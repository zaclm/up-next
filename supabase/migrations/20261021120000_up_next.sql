-- Up Next: schema, access rules, blind scoring and the ranking.
--
-- Rules this file implements (see the project plan):
--   * One score per person per game, 1-10 in half steps; Before (hype) and After (played).
--   * Personal score = After only -> After; Before only -> Before; both -> 30% Before + 70% After.
--   * Group score = plain average of the personal scores of list members who scored it.
--   * Blind scoring: you see others' scores, the group score and the rank of a game only
--     after you have scored it yourself.
--   * A game is ranked once ceil(members / 2) members scored it (never fewer than 2,
--     never more than the member count).
--   * Playable filter (on by default, per list): a game is held back while any member
--     has said they can't play it.

------------------------------------------------------------------------------------------
-- 1. Value types and pure helpers
------------------------------------------------------------------------------------------

create domain public.score as numeric(3, 1)
  check (value >= 1 and value <= 10 and value * 2 = trunc(value * 2));

create or replace function public.personal_score(b numeric, a numeric)
returns numeric
language sql immutable
set search_path = ''
as $$
  select case
    when a is null then b
    when b is null then a
    else round((3 * b + 7 * a) / 10.0, 1)
  end
$$;

create or replace function public.rank_threshold(member_count int)
returns int
language sql immutable
set search_path = ''
as $$
  select least(member_count, greatest(2, ceil(member_count / 2.0)::int))
$$;

------------------------------------------------------------------------------------------
-- 2. Tables
------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url text,
  avatar_hue smallint not null default 210 check (avatar_hue between 0 and 359),
  created_at timestamptz not null default now()
);

create table public.games (
  id bigint generated always as identity primary key,
  igdb_id bigint unique,
  title text not null check (char_length(title) between 1 and 120),
  cover_url text,
  genres text[] not null default '{}',
  release_year smallint,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index games_title_idx on public.games (lower(title));

create table public.user_games (
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id bigint not null references public.games (id) on delete cascade,
  before_score public.score,
  after_score public.score,
  can_play boolean not null default true,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index user_games_game_idx on public.user_games (game_id);

create table public.categories (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  created_at timestamptz not null default now()
);
create unique index categories_owner_name_idx on public.categories (owner_id, lower(name));

create table public.category_games (
  category_id bigint not null references public.categories (id) on delete cascade,
  game_id bigint not null references public.games (id) on delete cascade,
  primary key (category_id, game_id)
);

create or replace function public.new_invite_code()
returns text
language plpgsql volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      if i = 4 then code := code || '-'; end if;
    end loop;
    exit when not exists (select 1 from public.lists l where l.invite_code = code);
  end loop;
  return code;
end
$$;

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  created_by uuid not null references auth.users (id) on delete cascade,
  invite_code text not null unique default public.new_invite_code(),
  playable_only boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.list_members (
  list_id uuid not null references public.lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index list_members_user_idx on public.list_members (user_id);

create table public.list_games (
  list_id uuid not null references public.lists (id) on delete cascade,
  game_id bigint not null references public.games (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'played', 'hidden')),
  added_at timestamptz not null default now(),
  played_at timestamptz,
  primary key (list_id, game_id)
);
create index list_games_game_idx on public.list_games (game_id);

create table public.list_categories (
  list_id uuid not null references public.lists (id) on delete cascade,
  category_id bigint not null references public.categories (id) on delete cascade,
  linked_at timestamptz not null default now(),
  primary key (list_id, category_id)
);

------------------------------------------------------------------------------------------
-- 3. Profiles are created with the account (Discord or email sign-up)
------------------------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, display_name, avatar_url, avatar_hue)
  values (
    new.id,
    left(btrim(coalesce(
      nullif(btrim(meta ->> 'display_name'), ''),
      nullif(btrim(meta -> 'custom_claims' ->> 'global_name'), ''),
      nullif(btrim(meta ->> 'full_name'), ''),
      nullif(btrim(meta ->> 'name'), ''),
      nullif(btrim(meta ->> 'user_name'), ''),
      split_part(coalesce(new.email, 'player'), '@', 1)
    )), 40),
    nullif(meta ->> 'avatar_url', ''),
    abs(hashtext(new.id::text)) % 360
  );
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------------------------------
-- 4. Access rules (Row Level Security)
-- The app talks to the database through the functions below, which check the caller
-- themselves. These policies protect the tables if anyone uses the Supabase API directly.
------------------------------------------------------------------------------------------

create or replace function public.is_list_member(p_list uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.list_members m
    where m.list_id = p_list and m.user_id = auth.uid()
  )
$$;

create or replace function public.shares_list_with(p_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_user = auth.uid() or exists (
    select 1
    from public.list_members a
    join public.list_members b on b.list_id = a.list_id
    where a.user_id = auth.uid() and b.user_id = p_user
  )
$$;

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.user_games enable row level security;
alter table public.categories enable row level security;
alter table public.category_games enable row level security;
alter table public.lists enable row level security;
alter table public.list_members enable row level security;
alter table public.list_games enable row level security;
alter table public.list_categories enable row level security;

create policy "see yourself and people you share a list with" on public.profiles
  for select to authenticated using (public.shares_list_with(id));
create policy "edit your own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "signed-in players can read the catalog" on public.games
  for select to authenticated using (true);

-- Only your own scores are readable directly; other people's scores reach you only
-- through list_board / list_game, which apply blind scoring.
create policy "your own scores" on public.user_games
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "your own categories" on public.categories
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "games in your own categories" on public.category_games
  for all to authenticated
  using (exists (select 1 from public.categories c where c.id = category_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.categories c where c.id = category_id and c.owner_id = auth.uid()));

create policy "lists you are in" on public.lists
  for select to authenticated using (public.is_list_member(id));

create policy "members of lists you are in" on public.list_members
  for select to authenticated using (public.is_list_member(list_id));

create policy "games in lists you are in" on public.list_games
  for select to authenticated using (public.is_list_member(list_id));

create policy "linked categories of lists you are in" on public.list_categories
  for select to authenticated using (public.is_list_member(list_id));

------------------------------------------------------------------------------------------
-- 5. Reading: the list board, one game in a list, my lists, my queue, my library
------------------------------------------------------------------------------------------

create or replace function public.require_user()
returns uuid
language plpgsql stable
set search_path = ''
as $$
declare
  v uuid := auth.uid();
begin
  if v is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  return v;
end
$$;

create or replace function public.require_member(p_list uuid)
returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v uuid := public.require_user();
begin
  if not exists (select 1 from public.list_members m where m.list_id = p_list and m.user_id = v) then
    raise exception 'List not found' using errcode = 'P0002';
  end if;
  return v;
end
$$;

-- Everything the Up next screen needs for one list, already masked for the caller.
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
  v_out jsonb;
begin
  select * into v_list from public.lists where id = p_list;
  select count(*) into v_n from public.list_members where list_id = p_list;
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
        'scored_count', r.scored_count,
        'member_count', v_n,
        'needed', v_needed,
        'me_scored', r.me_scored,
        'cant_play', to_jsonb(r.cant_play),
        'rank', case when r.section = 'ranked' then r.pos end,
        -- Numbers only for games the caller has scored (blind scoring).
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
      'needed', v_needed
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

-- One game inside one list: the game page.
create or replace function public.list_game(p_list uuid, p_game bigint)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_list);
  v_board jsonb := public.list_board(p_list);
  v_card jsonb;
  v_section text;
  v_lg public.list_games;
  v_game public.games;
  v_mine public.user_games;
  v_scored boolean;
begin
  select * into v_lg from public.list_games where list_id = p_list and game_id = p_game;
  if not found then
    raise exception 'Game not found in this list' using errcode = 'P0002';
  end if;
  select * into v_game from public.games where id = p_game;
  select * into v_mine from public.user_games where user_id = v_uid and game_id = p_game;
  v_scored := v_mine.before_score is not null or v_mine.after_score is not null;

  select s.key, e.value into v_section, v_card
  from jsonb_each(v_board) s
  cross join lateral jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]' end) e(value)
  where s.key in ('ranked', 'waiting', 'blocked', 'played', 'needs_score')
    and (e.value ->> 'id')::bigint = p_game
  order by case s.key when 'needs_score' then 2 else 1 end
  limit 1;

  return jsonb_build_object(
    'list', v_board -> 'list',
    'game', jsonb_build_object(
      'id', v_game.id, 'title', v_game.title, 'cover_url', v_game.cover_url,
      'genres', to_jsonb(v_game.genres), 'release_year', v_game.release_year
    ),
    'status', v_lg.status,
    'section', v_section,
    'card', v_card,
    'is_adder', v_lg.added_by = v_uid,
    'is_creator', (v_board -> 'list' ->> 'created_by')::uuid = v_uid,
    'mine', jsonb_build_object(
      'scored', coalesce(v_scored, false),
      'in_library', v_mine.user_id is not null,
      'before', v_mine.before_score,
      'after', v_mine.after_score,
      'can_play', coalesce(v_mine.can_play, true),
      'personal', public.personal_score(v_mine.before_score, v_mine.after_score)
    ),
    -- Who has scored is shown to everyone; what they scored only after you score.
    'members', (
      select jsonb_agg(jsonb_build_object(
               'id', m.user_id,
               'name', p.display_name,
               'hue', p.avatar_hue,
               'avatar_url', p.avatar_url,
               'is_me', m.user_id = v_uid,
               'scored', (ug.before_score is not null or ug.after_score is not null),
               'can_play', ug.can_play,
               'before', case when coalesce(v_scored, false) then ug.before_score end,
               'after', case when coalesce(v_scored, false) then ug.after_score end,
               'personal', case when coalesce(v_scored, false) then public.personal_score(ug.before_score, ug.after_score) end
             ) order by (m.user_id <> v_uid), m.joined_at)
      from public.list_members m
      join public.profiles p on p.id = m.user_id
      left join public.user_games ug on ug.user_id = m.user_id and ug.game_id = p_game
      where m.list_id = p_list
    ),
    'other_lists', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) order by l.name)
      from public.list_games lg2
      join public.lists l on l.id = lg2.list_id
      join public.list_members m2 on m2.list_id = l.id and m2.user_id = v_uid
      where lg2.game_id = p_game and lg2.list_id <> p_list and lg2.status <> 'hidden'
    ), '[]')
  );
end
$$;

-- The caller's lists with a short summary each.
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
    select l.id, m.joined_at
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
      'covers', (
        select coalesce(jsonb_agg(c ->> 'cover_url'), '[]')
        from (
          select c from jsonb_array_elements(b -> 'ranked') c
          union all select c from jsonb_array_elements(b -> 'waiting') c
          union all select c from jsonb_array_elements(b -> 'needs_score') c
          limit 3
        ) x
      )
    ));
  end loop;
  return v_out;
end
$$;

-- Every game across the caller's lists that still needs their score.
create or replace function public.score_queue()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with me as (select public.require_user() as uid),
  pending as (
    select lg.game_id, lg.list_id, lg.added_at, ap.display_name as added_by_name
    from public.list_games lg
    join public.list_members m on m.list_id = lg.list_id
    join me on me.uid = m.user_id
    left join public.profiles ap on ap.id = lg.added_by
    where lg.status = 'active'
      and not exists (
        select 1 from public.user_games ug, me
        where ug.user_id = me.uid and ug.game_id = lg.game_id
          and (ug.before_score is not null or ug.after_score is not null)
      )
  )
  select coalesce(jsonb_agg(item order by newest desc), '[]')
  from (
    select max(p.added_at) as newest,
      jsonb_build_object(
        'id', g.id, 'title', g.title, 'cover_url', g.cover_url, 'genres', to_jsonb(g.genres),
        'lists', jsonb_agg(jsonb_build_object(
          'id', l.id, 'name', l.name, 'added_by_name', p.added_by_name,
          'scored_count', (
            select count(*) from public.list_members m3
            join public.user_games ug3 on ug3.user_id = m3.user_id and ug3.game_id = g.id
            where m3.list_id = l.id and (ug3.before_score is not null or ug3.after_score is not null)
          ),
          'member_count', (select count(*) from public.list_members m4 where m4.list_id = l.id)
        ) order by l.name)
      ) as item
    from pending p
    join public.games g on g.id = p.game_id
    join public.lists l on l.id = p.list_id
    group by g.id
  ) q
$$;

-- The caller's library: every game they scored, with categories and the lists it is in.
create or replace function public.my_library()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with me as (select public.require_user() as uid)
  select jsonb_build_object(
    'games', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'title', g.title, 'cover_url', g.cover_url,
               'genres', to_jsonb(g.genres), 'release_year', g.release_year,
               'before', ug.before_score, 'after', ug.after_score,
               'personal', public.personal_score(ug.before_score, ug.after_score),
               'can_play', ug.can_play, 'added_at', ug.added_at,
               'categories', coalesce((
                 select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
                 from public.category_games cg join public.categories c on c.id = cg.category_id
                 where cg.game_id = g.id and c.owner_id = me.uid
               ), '[]'),
               'lists', coalesce((
                 select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) order by l.name)
                 from public.list_games lg
                 join public.lists l on l.id = lg.list_id
                 join public.list_members m on m.list_id = l.id and m.user_id = me.uid
                 where lg.game_id = g.id and lg.status <> 'hidden'
               ), '[]')
             ) order by g.title)
      from public.user_games ug
      join public.games g on g.id = ug.game_id
      where ug.user_id = me.uid
    ), '[]'),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.name,
               'count', (select count(*) from public.category_games cg
                         join public.user_games ug2 on ug2.game_id = cg.game_id and ug2.user_id = me.uid
                         where cg.category_id = c.id)
             ) order by c.name)
      from public.categories c where c.owner_id = me.uid
    ), '[]')
  )
  from me
$$;

------------------------------------------------------------------------------------------
-- 6. Writing: catalog, scores, library, categories, lists
------------------------------------------------------------------------------------------

-- Adds a game to the shared catalog (or returns the existing one).
create or replace function public.upsert_game(
  p_title text,
  p_igdb_id bigint default null,
  p_cover_url text default null,
  p_genres text[] default '{}',
  p_release_year smallint default null
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
    insert into public.games (igdb_id, title, cover_url, genres, release_year, created_by)
    values (p_igdb_id, v_title, p_cover_url, coalesce(p_genres, '{}'), p_release_year, v_uid)
    on conflict (igdb_id) do update
      set cover_url = coalesce(excluded.cover_url, public.games.cover_url),
          genres = case when cardinality(excluded.genres) > 0 then excluded.genres else public.games.genres end
    returning id into v_id;
    return v_id;
  end if;
  select id into v_id from public.games
  where igdb_id is null and lower(title) = lower(v_title)
  order by id limit 1;
  if v_id is null then
    insert into public.games (title, cover_url, genres, release_year, created_by)
    values (v_title, p_cover_url, coalesce(p_genres, '{}'), p_release_year, v_uid)
    returning id into v_id;
  end if;
  return v_id;
end
$$;

-- Saves the caller's take on a game (this also puts it in their library).
create or replace function public.save_score(
  p_game bigint,
  p_before numeric,
  p_after numeric,
  p_can_play boolean default true
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  if p_before is null and p_after is null then
    raise exception 'Give it a Before or an After score' using errcode = '22023';
  end if;
  if not exists (select 1 from public.games where id = p_game) then
    raise exception 'Game not found' using errcode = 'P0002';
  end if;
  insert into public.user_games (user_id, game_id, before_score, after_score, can_play)
  values (v_uid, p_game, p_before::public.score, p_after::public.score, coalesce(p_can_play, true))
  on conflict (user_id, game_id) do update
    set before_score = excluded.before_score,
        after_score = excluded.after_score,
        can_play = excluded.can_play,
        updated_at = now();
end
$$;

create or replace function public.set_can_play(p_game bigint, p_can_play boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  update public.user_games set can_play = p_can_play, updated_at = now()
  where user_id = v_uid and game_id = p_game;
  if not found then
    insert into public.user_games (user_id, game_id, can_play) values (v_uid, p_game, p_can_play);
  end if;
end
$$;

create or replace function public.remove_from_library(p_game bigint)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  delete from public.category_games cg
  using public.categories c
  where c.id = cg.category_id and c.owner_id = v_uid and cg.game_id = p_game;
  delete from public.user_games where user_id = v_uid and game_id = p_game;
end
$$;

create or replace function public.create_category(p_name text)
returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_id bigint;
  v_name text := left(btrim(p_name), 30);
begin
  select id into v_id from public.categories where owner_id = v_uid and lower(name) = lower(v_name);
  if v_id is null then
    insert into public.categories (owner_id, name) values (v_uid, v_name) returning id into v_id;
  end if;
  return v_id;
end
$$;

create or replace function public.delete_category(p_category bigint)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  delete from public.categories where id = p_category and owner_id = v_uid;
end
$$;

-- Replaces the set of the caller's categories a game is in.
create or replace function public.set_game_categories(p_game bigint, p_categories bigint[])
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  delete from public.category_games cg
  using public.categories c
  where c.id = cg.category_id and c.owner_id = v_uid and cg.game_id = p_game
    and not (cg.category_id = any (coalesce(p_categories, '{}')));
  insert into public.category_games (category_id, game_id)
  select c.id, p_game from public.categories c
  where c.owner_id = v_uid and c.id = any (coalesce(p_categories, '{}'))
  on conflict do nothing;
end
$$;

-- A game added to a category also joins every list that category is linked to.
create or replace function public.category_game_to_linked_lists()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.list_games (list_id, game_id, added_by)
  select lc.list_id, new.game_id, c.owner_id
  from public.list_categories lc
  join public.categories c on c.id = lc.category_id
  join public.list_members m on m.list_id = lc.list_id and m.user_id = c.owner_id
  where lc.category_id = new.category_id
  on conflict do nothing;
  return new;
end
$$;

create trigger category_games_to_lists
  after insert on public.category_games
  for each row execute function public.category_game_to_linked_lists();

create or replace function public.create_list(p_name text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_id uuid;
begin
  insert into public.lists (name, created_by) values (btrim(p_name), v_uid) returning id into v_id;
  insert into public.list_members (list_id, user_id) values (v_id, v_uid);
  return v_id;
end
$$;

create or replace function public.join_list(p_code text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_id uuid;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  select id into v_id from public.lists
  where replace(invite_code, '-', '') = v_code;
  if v_id is null then
    raise exception 'That invite code doesn''t match a list' using errcode = 'P0002';
  end if;
  insert into public.list_members (list_id, user_id) values (v_id, v_uid) on conflict do nothing;
  return v_id;
end
$$;

-- What an invite link points at, so the join page can say "Join Squad Night?".
create or replace function public.invite_preview(p_code text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_list public.lists;
begin
  select * into v_list from public.lists where replace(invite_code, '-', '') = v_code;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_list.id,
    'name', v_list.name,
    'member_count', (select count(*) from public.list_members where list_id = v_list.id),
    'member_names', (select jsonb_agg(p.display_name order by m.joined_at)
                     from public.list_members m join public.profiles p on p.id = m.user_id
                     where m.list_id = v_list.id),
    'already_member', exists (select 1 from public.list_members where list_id = v_list.id and user_id = v_uid)
  );
end
$$;

create or replace function public.leave_list(p_list uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_list);
  v_next uuid;
begin
  delete from public.list_categories lc
  using public.categories c
  where c.id = lc.category_id and lc.list_id = p_list and c.owner_id = v_uid;
  delete from public.list_members where list_id = p_list and user_id = v_uid;
  select user_id into v_next from public.list_members where list_id = p_list order by joined_at limit 1;
  if v_next is null then
    delete from public.lists where id = p_list;
  else
    update public.lists set created_by = v_next where id = p_list and created_by = v_uid;
  end if;
end
$$;

create or replace function public.update_list(p_list uuid, p_name text, p_playable_only boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_list);
begin
  if not exists (select 1 from public.lists where id = p_list and created_by = v_uid) then
    raise exception 'Only the person who created the list can change this' using errcode = '42501';
  end if;
  update public.lists
  set name = coalesce(nullif(btrim(p_name), ''), name),
      playable_only = coalesce(p_playable_only, playable_only)
  where id = p_list;
end
$$;

create or replace function public.new_invite(p_list uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_list);
  v_code text := public.new_invite_code();
begin
  if not exists (select 1 from public.lists where id = p_list and created_by = v_uid) then
    raise exception 'Only the person who created the list can change this' using errcode = '42501';
  end if;
  update public.lists set invite_code = v_code where id = p_list;
  return v_code;
end
$$;

-- Adds games to lists. Returns how many list entries were new.
create or replace function public.add_games_to_lists(p_games bigint[], p_lists uuid[])
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_count int;
begin
  if exists (
    select 1 from unnest(coalesce(p_lists, '{}')) l(id)
    where not exists (select 1 from public.list_members m where m.list_id = l.id and m.user_id = v_uid)
  ) then
    raise exception 'List not found' using errcode = 'P0002';
  end if;
  insert into public.list_games (list_id, game_id, added_by)
  select l.id, g.id
       , v_uid
  from unnest(coalesce(p_lists, '{}')) l(id)
  cross join unnest(coalesce(p_games, '{}')) g(id)
  where exists (select 1 from public.games x where x.id = g.id)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- The person who added a game can take it out of the list.
create or replace function public.remove_list_game(p_list uuid, p_game bigint)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_list);
begin
  delete from public.list_games where list_id = p_list and game_id = p_game and added_by = v_uid;
  if not found then
    raise exception 'Only the person who added it can remove it' using errcode = '42501';
  end if;
end
$$;

-- 'played': any member. 'hidden': the list creator. 'active' (undo): the creator or the adder.
create or replace function public.set_list_game_status(p_list uuid, p_game bigint, p_status text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_list);
  v_is_creator boolean;
  v_lg public.list_games;
begin
  select * into v_lg from public.list_games where list_id = p_list and game_id = p_game;
  if not found then
    raise exception 'Game not found in this list' using errcode = 'P0002';
  end if;
  select created_by = v_uid into v_is_creator from public.lists where id = p_list;
  if p_status = 'hidden' and not v_is_creator then
    raise exception 'Only the person who created the list can hide games' using errcode = '42501';
  end if;
  if p_status = 'active' and not (v_is_creator or v_lg.added_by = v_uid or v_lg.status = 'played') then
    raise exception 'Only the list creator can bring this game back' using errcode = '42501';
  end if;
  if p_status not in ('active', 'played', 'hidden') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;
  update public.list_games
  set status = p_status,
      played_at = case when p_status = 'played' then now() when p_status = 'active' then null else played_at end
  where list_id = p_list and game_id = p_game;
end
$$;

create or replace function public.link_category(p_list uuid, p_category bigint)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_list);
  v_count int;
begin
  if not exists (select 1 from public.categories where id = p_category and owner_id = v_uid) then
    raise exception 'Category not found' using errcode = 'P0002';
  end if;
  insert into public.list_categories (list_id, category_id) values (p_list, p_category) on conflict do nothing;
  insert into public.list_games (list_id, game_id, added_by)
  select p_list, cg.game_id, v_uid from public.category_games cg where cg.category_id = p_category
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

create or replace function public.unlink_category(p_list uuid, p_category bigint)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_list);
begin
  delete from public.list_categories lc
  using public.categories c
  where c.id = lc.category_id and lc.list_id = p_list and lc.category_id = p_category and c.owner_id = v_uid;
end
$$;

create or replace function public.update_profile(p_display_name text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  update public.profiles set display_name = left(btrim(p_display_name), 40)
  where id = v_uid and btrim(p_display_name) <> '';
end
$$;

------------------------------------------------------------------------------------------
-- 7. Who may call what through the Supabase API
------------------------------------------------------------------------------------------

revoke all on all functions in schema public from public, anon;
grant execute on function
  public.is_list_member(uuid),
  public.shares_list_with(uuid),
  public.require_user(),
  public.require_member(uuid),
  public.personal_score(numeric, numeric),
  public.rank_threshold(int),
  public.list_board(uuid),
  public.list_game(uuid, bigint),
  public.my_lists(),
  public.score_queue(),
  public.my_library(),
  public.upsert_game(text, bigint, text, text[], smallint),
  public.save_score(bigint, numeric, numeric, boolean),
  public.set_can_play(bigint, boolean),
  public.remove_from_library(bigint),
  public.create_category(text),
  public.delete_category(bigint),
  public.set_game_categories(bigint, bigint[]),
  public.create_list(text),
  public.join_list(text),
  public.invite_preview(text),
  public.leave_list(uuid),
  public.update_list(uuid, text, boolean),
  public.new_invite(uuid),
  public.add_games_to_lists(bigint[], uuid[]),
  public.remove_list_game(uuid, bigint),
  public.set_list_game_status(uuid, bigint, text),
  public.link_category(uuid, bigint),
  public.unlink_category(uuid, bigint),
  public.update_profile(text)
to authenticated;
