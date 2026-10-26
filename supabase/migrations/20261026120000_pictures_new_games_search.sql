-- Up Next, round 2:
--   * Lists get a picture the group chooses (instead of the covers of whatever was added last).
--   * "New since you last looked": each member's last visit to a list, a count per list and a
--     flag on each new game.
--   * Better game search: fuzzy matching on titles already in Up Next, Steam app ids, and one
--     shared row per game whichever catalog it was picked from.

------------------------------------------------------------------------------------------
-- 1. Fuzzy text matching
------------------------------------------------------------------------------------------

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- The comparable form of a title: lower case, no ™ ® ©, dots and apostrophes dropped
-- (R.E.P.O. -> repo, Baldur's -> baldurs), "&" as "and", other punctuation as spaces, and no
-- leading "the". "THE FINALS" and "The Finals™" both become "finals".
-- The app has the same rule in src/lib/search/rank.ts (titleKey); keep them in step.
create or replace function public.title_key(t text)
returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select coalesce(nullif(regexp_replace(k, '^the ', ''), ''), k)
  from (
    select btrim(regexp_replace(
             regexp_replace(
               regexp_replace(replace(lower(coalesce(t, '')), '&', ' and '), '[™®©]', '', 'g'),
               '[.''’`]', '', 'g'),
             '[^[:alnum:]]+', ' ', 'g')) as k
  ) x
$$;

------------------------------------------------------------------------------------------
-- 2. Games: Steam app id, one row per game
------------------------------------------------------------------------------------------

alter table public.games add column steam_appid bigint unique;
create index games_title_key_idx on public.games (public.title_key(title));
create index games_title_trgm_idx on public.games using gin (public.title_key(title) extensions.gin_trgm_ops);

drop function public.upsert_game(text, bigint, text, text[], smallint);

-- Adds a game to the shared catalog, or returns the row that already exists for it.
-- A game picked from IGDB, from Steam, or typed by hand lands on the same row when the
-- ids or the title match, so friends' scores always meet on one game.
create or replace function public.upsert_game(
  p_title text,
  p_igdb_id bigint default null,
  p_cover_url text default null,
  p_genres text[] default '{}',
  p_release_year smallint default null,
  p_steam_appid bigint default null
)
returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_id bigint;
  v_title text := left(btrim(p_title), 120);
begin
  if v_title = '' then
    raise exception 'A game needs a name' using errcode = '22023';
  end if;

  if p_igdb_id is not null then
    select id into v_id from public.games where igdb_id = p_igdb_id;
  end if;
  if v_id is null and p_steam_appid is not null then
    select id into v_id from public.games where steam_appid = p_steam_appid;
  end if;
  if v_id is null then
    select id into v_id from public.games g
    where public.title_key(g.title) = public.title_key(v_title)
      and (p_igdb_id is null or g.igdb_id is null)
      and (p_steam_appid is null or g.steam_appid is null)
    order by g.id
    limit 1;
  end if;

  if v_id is null then
    insert into public.games (igdb_id, steam_appid, title, cover_url, genres, release_year, created_by)
    values (p_igdb_id, p_steam_appid, v_title, p_cover_url, coalesce(p_genres, '{}'), p_release_year, v_uid)
    returning id into v_id;
    return v_id;
  end if;

  -- Fill in what the existing row is missing; never take an id another row already uses.
  update public.games g
  set igdb_id = coalesce(g.igdb_id,
        case when p_igdb_id is not null and not exists (select 1 from public.games x where x.igdb_id = p_igdb_id)
             then p_igdb_id end),
      steam_appid = coalesce(g.steam_appid,
        case when p_steam_appid is not null and not exists (select 1 from public.games x where x.steam_appid = p_steam_appid)
             then p_steam_appid end),
      cover_url = coalesce(g.cover_url, p_cover_url),
      genres = case when cardinality(g.genres) = 0 then coalesce(p_genres, '{}') else g.genres end,
      release_year = coalesce(g.release_year, p_release_year)
  where g.id = v_id;
  return v_id;
end
$$;

-- Games already in Up Next that look like the query, typos included. Returns how many
-- players have each game, which the app uses to rank games friends already play higher.
create or replace function public.search_games(p_query text, p_limit int default 10)
returns table (
  id bigint, title text, cover_url text, genres text[], release_year smallint,
  igdb_id bigint, steam_appid bigint, players bigint, match real
)
language sql stable security definer
set search_path = ''
as $$
  with q as (select public.title_key(p_query) as k)
  select g.id, g.title, g.cover_url, g.genres, g.release_year, g.igdb_id, g.steam_appid,
         (select count(*) from public.user_games ug where ug.game_id = g.id) as players,
         greatest(
           extensions.similarity(public.title_key(g.title), q.k),
           extensions.word_similarity(q.k, public.title_key(g.title)),
           case when public.title_key(g.title) like '%' || q.k || '%' then 0.9 else 0 end
         )::real as match
  from public.games g, q
  where q.k <> ''
    and (public.title_key(g.title) like '%' || q.k || '%'
         or extensions.word_similarity(q.k, public.title_key(g.title)) > 0.4
         or extensions.similarity(public.title_key(g.title), q.k) > 0.3)
  order by match desc, players desc, g.title
  limit least(greatest(coalesce(p_limit, 10), 1), 30)
$$;

------------------------------------------------------------------------------------------
-- 3. List pictures
------------------------------------------------------------------------------------------

alter table public.lists add column image_updated_at timestamptz;

create table public.list_images (
  list_id uuid primary key references public.lists (id) on delete cascade,
  mime text not null check (mime in ('image/webp', 'image/jpeg', 'image/png')),
  data bytea not null check (octet_length(data) between 100 and 400000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.list_images enable row level security;
create policy "pictures of lists you are in" on public.list_images
  for select to authenticated using (public.is_list_member(list_id));

-- Anyone in the list can set its picture.
create or replace function public.set_list_image(p_list uuid, p_mime text, p_data bytea)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_list);
begin
  insert into public.list_images (list_id, mime, data, updated_by)
  values (p_list, p_mime, p_data, v_uid)
  on conflict (list_id) do update
    set mime = excluded.mime, data = excluded.data, updated_by = excluded.updated_by, updated_at = now();
  update public.lists set image_updated_at = now() where id = p_list;
end
$$;

create or replace function public.clear_list_image(p_list uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_list);
begin
  delete from public.list_images where list_id = p_list;
  update public.lists set image_updated_at = null where id = p_list;
end
$$;

create or replace function public.list_image(p_list uuid)
returns table (mime text, data bytea, updated_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select i.mime, i.data, i.updated_at
  from public.list_images i
  where i.list_id = p_list and public.require_member(p_list) is not null
$$;

------------------------------------------------------------------------------------------
-- 4. New since your last visit
------------------------------------------------------------------------------------------

alter table public.list_members add column last_seen_at timestamptz not null default now();

create or replace function public.mark_list_seen(p_list uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_list);
begin
  update public.list_members set last_seen_at = now() where list_id = p_list and user_id = v_uid;
end
$$;

------------------------------------------------------------------------------------------
-- 5. The board and the list summaries, now with pictures and "new"
------------------------------------------------------------------------------------------

create or replace function public.list_board(p_list uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_list);
  v_list public.lists;
  v_n int;
  v_needed int;
  v_seen timestamptz;
  v_out jsonb;
begin
  select * into v_list from public.lists where id = p_list;
  select count(*) into v_n from public.list_members where list_id = p_list;
  select last_seen_at into v_seen from public.list_members where list_id = p_list and user_id = v_uid;
  v_needed := public.rank_threshold(v_n);

  with members as (
    select m.user_id, p.display_name, p.avatar_hue, p.avatar_url, m.joined_at
    from public.list_members m
    join public.profiles p on p.id = m.user_id
    where m.list_id = p_list
  ),
  lg as (
    select g.id, g.title, g.cover_url, g.genres, l.status, l.added_by, l.added_at, l.played_at,
           ap.display_name as added_by_name
    from public.list_games l
    join public.games g on g.id = l.game_id
    left join public.profiles ap on ap.id = l.added_by
    where l.list_id = p_list and l.status in ('active', 'played')
  ),
  ms as (
    select lg.id as game_id, mb.user_id, mb.display_name, mb.avatar_hue, mb.avatar_url, mb.joined_at,
           ug.before_score, ug.after_score, ug.can_play,
           (ug.before_score is not null or ug.after_score is not null) as scored,
           public.personal_score(ug.before_score, ug.after_score) as personal
    from lg
    cross join members mb
    left join public.user_games ug on ug.game_id = lg.id and ug.user_id = mb.user_id
  ),
  agg as (
    select lg.id, lg.title, lg.cover_url, lg.genres, lg.status, lg.added_by, lg.added_by_name,
           lg.added_at, lg.played_at,
           count(*) filter (where ms.scored) as scored_count,
           coalesce(bool_or(ms.scored and ms.user_id = v_uid), false) as me_scored,
           round(avg(ms.personal) filter (where ms.scored), 1) as group_score,
           count(*) filter (where ms.after_score is not null) as played_count,
           count(*) filter (where ms.scored and ms.after_score is null) as hype_count,
           avg(ms.after_score) as after_avg,
           coalesce(array_agg(ms.display_name order by ms.joined_at) filter (where ms.can_play = false), '{}') as cant_play,
           coalesce(bool_or(ms.user_id = v_uid and ms.can_play = false), false) as me_cant_play
    from lg
    join ms on ms.game_id = lg.id
    group by lg.id, lg.title, lg.cover_url, lg.genres, lg.status, lg.added_by, lg.added_by_name,
             lg.added_at, lg.played_at
  ),
  classified as (
    select a.*,
      case
        when a.status = 'played' then 'played'
        when v_list.playable_only and cardinality(a.cant_play) > 0 then 'blocked'
        when not a.me_scored then 'unscored'
        when a.scored_count < v_needed then 'waiting'
        else 'ranked'
      end as section
    from agg a
  ),
  ranked as (
    select c.*,
      row_number() over (
        partition by c.section
        order by c.group_score desc nulls last, c.scored_count desc, c.after_avg desc nulls last, c.title
      ) as pos
    from classified c
  ),
  cards as (
    select r.section, r.pos, r.me_scored, r.added_at, r.played_at,
      jsonb_build_object(
        'id', r.id,
        'title', r.title,
        'cover_url', r.cover_url,
        'genres', to_jsonb(r.genres),
        'status', r.status,
        'added_by', r.added_by,
        'added_by_name', r.added_by_name,
        'added_at', r.added_at,
        'played_at', r.played_at,
        'is_new', r.status = 'active' and r.added_at > v_seen and r.added_by is distinct from v_uid,
        'scored_count', r.scored_count,
        'member_count', v_n,
        'needed', v_needed,
        'me_scored', r.me_scored,
        'cant_play', to_jsonb(r.cant_play),
        'rank', case when r.section = 'ranked' then r.pos end,
        'group_score', case when r.me_scored then r.group_score end,
        'played_count', case when r.me_scored then r.played_count end,
        'hype_count', case when r.me_scored then r.hype_count end,
        'scores', case when r.me_scored then (
          select jsonb_agg(jsonb_build_object(
                   'user_id', s.user_id,
                   'name', s.display_name,
                   'hue', s.avatar_hue,
                   'avatar_url', s.avatar_url,
                   'is_me', s.user_id = v_uid,
                   'before', s.before_score,
                   'after', s.after_score,
                   'personal', s.personal,
                   'tag', case when not s.scored then null
                               when s.after_score is not null then 'played' else 'hype' end
                 ) order by (s.user_id <> v_uid), s.joined_at)
          from ms s where s.game_id = r.id
        ) end
      ) as card
    from ranked r
  )
  select jsonb_build_object(
    'list', jsonb_build_object(
      'id', v_list.id,
      'name', v_list.name,
      'invite_code', v_list.invite_code,
      'playable_only', v_list.playable_only,
      'created_by', v_list.created_by,
      'is_creator', v_list.created_by = v_uid,
      'member_count', v_n,
      'needed', v_needed,
      'image_version', (extract(epoch from v_list.image_updated_at) * 1000)::bigint
    ),
    'members', (
      select jsonb_agg(jsonb_build_object(
               'id', mb.user_id, 'name', mb.display_name, 'hue', mb.avatar_hue,
               'avatar_url', mb.avatar_url, 'is_me', mb.user_id = v_uid,
               'is_creator', mb.user_id = v_list.created_by
             ) order by (mb.user_id <> v_uid), mb.joined_at)
      from members mb
    ),
    'ranked', coalesce((select jsonb_agg(card order by pos) from cards where section = 'ranked'), '[]'),
    'waiting', coalesce((select jsonb_agg(card order by pos) from cards where section = 'waiting'), '[]'),
    'blocked', coalesce((select jsonb_agg(card order by added_at desc) from cards where section = 'blocked'), '[]'),
    'needs_score', coalesce((select jsonb_agg(card order by added_at desc) from cards
                             where section in ('unscored', 'blocked') and not me_scored), '[]'),
    'played', coalesce((select jsonb_agg(card order by (card ->> 'group_score')::numeric desc nulls last, played_at desc)
                        from cards where section = 'played'), '[]'),
    'linked_categories', coalesce((
      select jsonb_agg(jsonb_build_object(
               'category_id', c.id, 'name', c.name, 'owner_id', c.owner_id,
               'owner_name', op.display_name, 'mine', c.owner_id = v_uid,
               'game_count', (select count(*) from public.category_games cg where cg.category_id = c.id)
             ) order by c.name)
      from public.list_categories lc
      join public.categories c on c.id = lc.category_id
      join public.profiles op on op.id = c.owner_id
      where lc.list_id = p_list
    ), '[]'),
    'hidden', case when v_list.created_by = v_uid then coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title, 'cover_url', g.cover_url) order by g.title)
      from public.list_games l join public.games g on g.id = l.game_id
      where l.list_id = p_list and l.status = 'hidden'
    ), '[]') else '[]' end
  ) into v_out;

  return v_out;
end
$$;

create or replace function public.my_lists()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_out jsonb := '[]';
  r record;
  b jsonb;
begin
  for r in
    select l.id, m.joined_at, m.last_seen_at
    from public.list_members m join public.lists l on l.id = m.list_id
    where m.user_id = v_uid
    order by m.joined_at
  loop
    b := public.list_board(r.id);
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', r.id,
      'name', b -> 'list' ->> 'name',
      'member_count', (b -> 'list' ->> 'member_count')::int,
      'members', b -> 'members',
      'needs_score', jsonb_array_length(b -> 'needs_score'),
      'next', b -> 'ranked' -> 0,
      'image_version', b -> 'list' -> 'image_version',
      'new_count', (
        select count(*) from public.list_games lg
        where lg.list_id = r.id and lg.status = 'active'
          and lg.added_at > r.last_seen_at and lg.added_by is distinct from v_uid
      )
    ));
  end loop;
  return v_out;
end
$$;

------------------------------------------------------------------------------------------
-- 6. Who may call what
------------------------------------------------------------------------------------------

revoke all on all functions in schema public from public, anon;
grant execute on function
  public.title_key(text),
  public.upsert_game(text, bigint, text, text[], smallint, bigint),
  public.search_games(text, int),
  public.set_list_image(uuid, text, bytea),
  public.clear_list_image(uuid),
  public.list_image(uuid),
  public.mark_list_seen(uuid)
to authenticated;
