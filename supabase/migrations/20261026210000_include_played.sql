-- Up Next, round 3:
--   * "Played games" switch on a list's Up next tab: each member chooses whether games the group
--     already played are ranked together with the ones not played yet.
--   * Picking a game that is already in Up Next fills in what its row is missing (cover, ids).
--   * Trigger functions are no longer callable through the API (they only run as triggers).

alter table public.list_members add column include_played boolean not null default false;

create or replace function public.set_include_played(p_list uuid, p_on boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_list);
begin
  update public.list_members set include_played = coalesce(p_on, false)
  where list_id = p_list and user_id = v_uid;
end
$$;

-- Fills in a game's missing cover and catalog ids; never overwrites what is there and never
-- takes an id another game already has.
create or replace function public.fill_game_details(p_game bigint, p_cover_url text, p_igdb_id bigint, p_steam_appid bigint)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  update public.games g
  set cover_url = coalesce(g.cover_url, p_cover_url),
      igdb_id = coalesce(g.igdb_id,
        case when p_igdb_id is not null and not exists (select 1 from public.games x where x.igdb_id = p_igdb_id)
             then p_igdb_id end),
      steam_appid = coalesce(g.steam_appid,
        case when p_steam_appid is not null and not exists (select 1 from public.games x where x.steam_appid = p_steam_appid)
             then p_steam_appid end)
  where g.id = p_game;
end
$$;

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
  v_include boolean;
  v_out jsonb;
begin
  select * into v_list from public.lists where id = p_list;
  select count(*) into v_n from public.list_members where list_id = p_list;
  select last_seen_at, include_played into v_seen, v_include from public.list_members where list_id = p_list and user_id = v_uid;
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
      end as section,
      -- A played game can join the full ranking ("include played") on the same terms as the rest:
      -- you scored it, enough members scored it, and everyone can play it (when the filter is on).
      (a.status = 'played' and a.me_scored and a.scored_count >= v_needed
        and not (v_list.playable_only and cardinality(a.cant_play) > 0)) as played_rankable
    from agg a
  ),
  ranked as (
    select c.*,
      row_number() over (
        partition by c.section
        order by c.group_score desc nulls last, c.scored_count desc, c.after_avg desc nulls last, c.title
      ) as pos,
      case when c.section = 'ranked' or c.played_rankable then
        row_number() over (
          partition by (c.section = 'ranked' or c.played_rankable)
          order by c.group_score desc nulls last, c.scored_count desc, c.after_avg desc nulls last, c.title
        )
      end as pos_all
    from classified c
  ),
  cards as (
    select r.section, r.pos, r.pos_all, r.me_scored, r.added_at, r.played_at,
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
      'image_version', (extract(epoch from v_list.image_updated_at) * 1000)::bigint,
      'include_played', coalesce(v_include, false)
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
    -- Unplayed and played games in one ranking, for members who switched "Played games" on.
    'ranked_all', coalesce((select jsonb_agg(card || jsonb_build_object('rank', pos_all) order by pos_all)
                            from cards where pos_all is not null), '[]'),
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

revoke all on all functions in schema public from public, anon;
revoke execute on function public.handle_new_user(), public.category_game_to_linked_lists() from authenticated;
grant execute on function
  public.set_include_played(uuid, boolean),
  public.fill_game_details(bigint, text, bigint, bigint)
to authenticated;
