-- Up Next, Phase 2 — reminders in the app:
--   When the group marks a game "played together", every member who was in the list by then
--   and has no After score for it gets it in their To score queue ("Add your After score").
--   Someone who missed that session can say so ("Didn't play"), and the reminder goes away.

create table public.after_skips (
  user_id uuid not null references auth.users (id) on delete cascade,
  list_id uuid not null references public.lists (id) on delete cascade,
  game_id bigint not null references public.games (id) on delete cascade,
  skipped_at timestamptz not null default now(),
  primary key (user_id, list_id, game_id)
);
alter table public.after_skips enable row level security;
create policy "your own skipped reminders" on public.after_skips
  for select to authenticated using (user_id = auth.uid());

create or replace function public.skip_after(p_list uuid, p_game bigint)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_list);
begin
  insert into public.after_skips (user_id, list_id, game_id) values (v_uid, p_list, p_game)
  on conflict do nothing;
end
$$;

-- Everything waiting on the caller, newest first: After scores for games played together
-- ("after"), then games in their lists they haven't scored at all ("score").
create or replace function public.score_queue()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with me as (select public.require_user() as uid),
  mine as (
    select ug.game_id, ug.before_score, ug.after_score
    from public.user_games ug, me
    where ug.user_id = me.uid
  ),
  pending as (
    select lg.game_id, lg.list_id, lg.added_at as at, ap.display_name as added_by_name, 'score'::text as kind
    from public.list_games lg
    join public.list_members m on m.list_id = lg.list_id
    join me on me.uid = m.user_id
    left join public.profiles ap on ap.id = lg.added_by
    where lg.status = 'active'
      and not exists (
        select 1 from mine
        where mine.game_id = lg.game_id and (mine.before_score is not null or mine.after_score is not null)
      )
    union all
    select lg.game_id, lg.list_id, lg.played_at, null, 'after'
    from public.list_games lg
    join public.list_members m on m.list_id = lg.list_id
    join me on me.uid = m.user_id
    where lg.status = 'played'
      and lg.played_at >= m.joined_at
      and not exists (select 1 from mine where mine.game_id = lg.game_id and mine.after_score is not null)
      and not exists (
        select 1 from public.after_skips s
        where s.user_id = me.uid and s.list_id = lg.list_id and s.game_id = lg.game_id
      )
  )
  select coalesce(jsonb_agg(item order by kind_order, newest desc), '[]')
  from (
    select case p.kind when 'after' then 0 else 1 end as kind_order,
      max(p.at) as newest,
      jsonb_build_object(
        'id', g.id, 'title', g.title, 'cover_url', g.cover_url, 'genres', to_jsonb(g.genres),
        'kind', p.kind,
        'played_at', case when p.kind = 'after' then max(p.at) end,
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
    group by g.id, p.kind
  ) q
$$;

revoke all on all functions in schema public from public, anon;
grant execute on function public.skip_after(uuid, bigint) to authenticated;
