-- Up Next, Phase 3 — Steam and friends:
--   * Connect Steam (Steam sign-in, verified on the server) and import the games you own:
--     each one lands in your library as "I can play this", once; removing it keeps it removed.
--   * Steam playtime: games you've played for an hour or more without an After score get a
--     nudge in To score ("Played on Steam"), which you can dismiss.
--   * Find friends: your Steam friends who use Up Next, and (opt-in) people from your small
--     Discord servers who also opted in. Invite them to a list; they join or decline.
--
-- Anything that writes a verified Steam or Discord identity is server-only: the browser can't
-- call it, so nobody can claim someone else's Steam account or Discord servers.

------------------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------------------

create table public.steam_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  steam_id text not null unique check (steam_id ~ '^[0-9]{17}$'),
  persona_name text,
  avatar_url text,
  linked_at timestamptz not null default now(),
  synced_at timestamptz,
  sync_status text check (sync_status in ('ok', 'private', 'empty', 'error')),
  game_count int not null default 0
);

create table public.steam_games (
  user_id uuid not null references auth.users (id) on delete cascade,
  appid bigint not null,
  game_id bigint references public.games (id) on delete set null,
  playtime_min int not null default 0,
  playtime_2weeks_min int not null default 0,
  last_played_at timestamptz,
  first_seen_at timestamptz not null default now(),
  primary key (user_id, appid)
);
create index steam_games_game_idx on public.steam_games (game_id);

create table public.steam_friends (
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_steam_id text not null,
  primary key (user_id, friend_steam_id)
);
create index steam_friends_friend_idx on public.steam_friends (friend_steam_id);

create table public.steam_nudge_skips (
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id bigint not null references public.games (id) on delete cascade,
  skipped_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create table public.discord_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  discord_id text not null,
  linked_at timestamptz not null default now()
);

-- Only small servers are kept (see discord_save), so strangers from big servers never show up.
create table public.discord_guilds (
  user_id uuid not null references auth.users (id) on delete cascade,
  guild_id text not null,
  name text not null,
  member_count int,
  primary key (user_id, guild_id)
);
create index discord_guilds_guild_idx on public.discord_guilds (guild_id);

create table public.list_invites (
  list_id uuid not null references public.lists (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  from_user uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, to_user)
);

alter table public.steam_accounts enable row level security;
alter table public.steam_games enable row level security;
alter table public.steam_friends enable row level security;
alter table public.steam_nudge_skips enable row level security;
alter table public.discord_links enable row level security;
alter table public.discord_guilds enable row level security;
alter table public.list_invites enable row level security;

create policy "your own Steam account" on public.steam_accounts for select to authenticated using (user_id = auth.uid());
create policy "your own Steam games" on public.steam_games for select to authenticated using (user_id = auth.uid());
create policy "your own Steam friends" on public.steam_friends for select to authenticated using (user_id = auth.uid());
create policy "your own dismissed nudges" on public.steam_nudge_skips for select to authenticated using (user_id = auth.uid());
create policy "your own Discord link" on public.discord_links for select to authenticated using (user_id = auth.uid());
create policy "your own Discord servers" on public.discord_guilds for select to authenticated using (user_id = auth.uid());
create policy "invites you sent or got" on public.list_invites
  for select to authenticated using (to_user = auth.uid() or from_user = auth.uid());

-- Joining a list (by code, link or invite) clears any pending invite to it.
create or replace function public.clear_invite_on_join()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.list_invites where list_id = new.list_id and to_user = new.user_id;
  return new;
end
$$;
create trigger list_members_clear_invite after insert on public.list_members
  for each row execute function public.clear_invite_on_join();

------------------------------------------------------------------------------------------
-- Steam: link, import, unlink (link and import are server-only)
------------------------------------------------------------------------------------------

create or replace function public.steam_link(p_steam_id text, p_name text, p_avatar text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_old text;
begin
  if p_steam_id is null or p_steam_id !~ '^[0-9]{17}$' then
    raise exception 'Bad request' using errcode = '22023';
  end if;
  if exists (select 1 from public.steam_accounts where steam_id = p_steam_id and user_id <> v_uid) then
    raise exception 'That Steam account is already connected to another player' using errcode = 'P0001';
  end if;
  select steam_id into v_old from public.steam_accounts where user_id = v_uid;
  if v_old is distinct from p_steam_id then
    delete from public.steam_games where user_id = v_uid;
    delete from public.steam_friends where user_id = v_uid;
  end if;
  insert into public.steam_accounts (user_id, steam_id, persona_name, avatar_url)
  values (v_uid, p_steam_id, left(p_name, 64), p_avatar)
  on conflict (user_id) do update
    set steam_id = excluded.steam_id,
        persona_name = coalesce(excluded.persona_name, public.steam_accounts.persona_name),
        avatar_url = coalesce(excluded.avatar_url, public.steam_accounts.avatar_url),
        linked_at = case when public.steam_accounts.steam_id = excluded.steam_id
                         then public.steam_accounts.linked_at else now() end,
        synced_at = case when public.steam_accounts.steam_id = excluded.steam_id
                         then public.steam_accounts.synced_at end,
        game_count = case when public.steam_accounts.steam_id = excluded.steam_id
                          then public.steam_accounts.game_count else 0 end;
end
$$;

-- Saves what Steam says you own. p_games: [{appid, name, playtime, playtime_2weeks,
-- last_played (unix seconds), cover_url}]. Games seen for the first time join your library
-- as "I can play this"; games seen before only get fresh playtime, so a game you removed
-- from your library stays removed.
create or replace function public.steam_sync(p_games jsonb, p_status text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  r record;
  v_game bigint;
  v_title text;
  v_new boolean;
  v_added int := 0;
begin
  if not exists (select 1 from public.steam_accounts where user_id = v_uid) then
    raise exception 'Connect Steam first' using errcode = 'P0002';
  end if;
  if p_status not in ('ok', 'private', 'empty', 'error') then
    raise exception 'Bad request' using errcode = '22023';
  end if;

  for r in
    select * from jsonb_to_recordset(coalesce(p_games, '[]'))
      as x(appid bigint, name text, playtime int, playtime_2weeks int, last_played bigint, cover_url text)
    where x.appid > 0
  loop
    v_title := left(btrim(coalesce(r.name, '')), 120);
    v_game := null;
    select id into v_game from public.games where steam_appid = r.appid;
    if v_game is null and v_title <> '' then
      select id into v_game from public.games g
      where public.title_key(g.title) = public.title_key(v_title) and g.steam_appid is null
      order by g.id limit 1;
      if v_game is not null then
        update public.games set steam_appid = r.appid, cover_url = coalesce(cover_url, r.cover_url) where id = v_game;
      else
        insert into public.games (steam_appid, title, cover_url, created_by)
        values (r.appid, v_title, r.cover_url, v_uid)
        returning id into v_game;
      end if;
    elsif v_game is not null and r.cover_url is not null then
      update public.games set cover_url = r.cover_url where id = v_game and cover_url is null;
    end if;
    continue when v_game is null;

    insert into public.steam_games as sg (user_id, appid, game_id, playtime_min, playtime_2weeks_min, last_played_at)
    values (v_uid, r.appid, v_game, greatest(coalesce(r.playtime, 0), 0), greatest(coalesce(r.playtime_2weeks, 0), 0),
            case when coalesce(r.last_played, 0) > 0 then to_timestamp(r.last_played) end)
    on conflict (user_id, appid) do update
      set game_id = excluded.game_id,
          playtime_min = excluded.playtime_min,
          playtime_2weeks_min = excluded.playtime_2weeks_min,
          last_played_at = coalesce(excluded.last_played_at, sg.last_played_at)
    returning (xmax = 0) into v_new;

    if v_new then
      -- First time Steam lists it: you own it, so you can play it.
      insert into public.user_games as ug (user_id, game_id, can_play) values (v_uid, v_game, true)
      on conflict (user_id, game_id) do update set can_play = true, updated_at = now()
      returning (xmax = 0) into v_new;
      if v_new then
        v_added := v_added + 1;
      end if;
    end if;
  end loop;

  update public.steam_accounts
  set synced_at = now(), sync_status = p_status,
      game_count = (select count(*) from public.steam_games where user_id = v_uid)
  where user_id = v_uid;

  return jsonb_build_object('added', v_added,
                            'total', (select game_count from public.steam_accounts where user_id = v_uid));
end
$$;

-- Your Steam friends' ids, as Steam listed them (server-only), so friends can be found and
-- invited even when Steam is slow later.
create or replace function public.steam_save_friends(p_ids text[])
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  delete from public.steam_friends where user_id = v_uid;
  insert into public.steam_friends (user_id, friend_steam_id)
  select distinct v_uid, i from unnest(coalesce(p_ids, '{}')) i where i ~ '^[0-9]{17}$'
  on conflict do nothing;
  return (select count(*) from public.steam_friends where user_id = v_uid);
end
$$;

-- Disconnect Steam. Games already in your library stay; playtime and friends are forgotten.
create or replace function public.steam_unlink()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  delete from public.steam_games where user_id = v_uid;
  delete from public.steam_friends where user_id = v_uid;
  delete from public.steam_accounts where user_id = v_uid;
end
$$;

------------------------------------------------------------------------------------------
-- Discord servers (opt-in)
------------------------------------------------------------------------------------------

-- Server-only: keeps the servers with 100 members or fewer. p_guilds: [{id, name, member_count}]
create or replace function public.discord_save(p_discord_id text, p_guilds jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_all int;
begin
  insert into public.discord_links (user_id, discord_id) values (v_uid, left(p_discord_id, 32))
  on conflict (user_id) do update set discord_id = excluded.discord_id, linked_at = now();
  delete from public.discord_guilds where user_id = v_uid;
  select count(*) into v_all from jsonb_array_elements(coalesce(p_guilds, '[]'));
  insert into public.discord_guilds (user_id, guild_id, name, member_count)
  select distinct on (x.id) v_uid, x.id, left(coalesce(x.name, ''), 100), x.member_count
  from jsonb_to_recordset(coalesce(p_guilds, '[]')) as x(id text, name text, member_count int)
  where x.id ~ '^[0-9]{5,25}$' and x.member_count is not null and x.member_count <= 100;
  return jsonb_build_object('kept', (select count(*) from public.discord_guilds where user_id = v_uid), 'all', v_all);
end
$$;

create or replace function public.discord_unlink()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  delete from public.discord_guilds where user_id = v_uid;
  delete from public.discord_links where user_id = v_uid;
end
$$;

-- What's connected, for Account and Find friends.
create or replace function public.my_connections()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with me as (select public.require_user() as uid)
  select jsonb_build_object(
    'steam', (select jsonb_build_object(
                'steam_id', s.steam_id, 'name', s.persona_name, 'avatar_url', s.avatar_url,
                'linked_at', s.linked_at, 'synced_at', s.synced_at, 'status', s.sync_status,
                'game_count', s.game_count,
                'friend_count', (select count(*) from public.steam_friends f where f.user_id = s.user_id))
              from public.steam_accounts s where s.user_id = me.uid),
    'discord', (select jsonb_build_object(
                  'linked_at', d.linked_at,
                  'server_count', (select count(*) from public.discord_guilds g where g.user_id = d.user_id))
                from public.discord_links d where d.user_id = me.uid)
  )
  from me
$$;

------------------------------------------------------------------------------------------
-- Steam playtime nudges
------------------------------------------------------------------------------------------

-- Games you've played on Steam for an hour or more with no After score: the ones in your
-- lists first, then ones played in the last two weeks. At most 8.
create or replace function public.steam_nudges()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with me as (select public.require_user() as uid),
  candidates as (
    select g.id, g.title, g.cover_url, max(sg.playtime_min) as playtime_min,
           max(sg.last_played_at) as last_played_at,
           bool_or(sg.playtime_2weeks_min > 0) as recent,
           exists (
             select 1 from public.list_games lg
             join public.list_members m on m.list_id = lg.list_id and m.user_id = me.uid
             where lg.game_id = g.id and lg.status <> 'hidden'
           ) as in_lists
    from public.steam_games sg
    join me on sg.user_id = me.uid
    join public.games g on g.id = sg.game_id
    join public.user_games ug on ug.user_id = me.uid and ug.game_id = g.id
    where sg.playtime_min >= 60
      and ug.after_score is null
      and not exists (select 1 from public.steam_nudge_skips k where k.user_id = me.uid and k.game_id = g.id)
    group by g.id, g.title, g.cover_url, me.uid
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'title', c.title, 'cover_url', c.cover_url,
           'playtime_min', c.playtime_min, 'last_played_at', c.last_played_at, 'in_lists', c.in_lists
         ) order by c.in_lists desc, c.last_played_at desc nulls last, c.playtime_min desc), '[]')
  from (
    select * from candidates where in_lists or recent
    order by in_lists desc, last_played_at desc nulls last, playtime_min desc
    limit 8
  ) c
$$;

create or replace function public.skip_steam_nudge(p_game bigint)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  insert into public.steam_nudge_skips (user_id, game_id) values (v_uid, p_game) on conflict do nothing;
end
$$;

------------------------------------------------------------------------------------------
-- Finding friends and inviting them
------------------------------------------------------------------------------------------

-- Is p_user someone the caller may invite: shares a list, is a Steam friend, or shares a
-- small Discord server (both opted in).
create or replace function public.can_invite(p_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_user <> auth.uid() and (
    public.shares_list_with(p_user)
    or exists (
      select 1 from public.steam_friends f
      join public.steam_accounts s on s.steam_id = f.friend_steam_id
      where f.user_id = auth.uid() and s.user_id = p_user
    )
    or exists (
      select 1 from public.discord_guilds a
      join public.discord_guilds b on b.guild_id = a.guild_id
      where a.user_id = auth.uid() and b.user_id = p_user
    )
  )
$$;

-- Steam friends and Discord-server mates who use Up Next, with the caller's lists they're in
-- and the ones they've already been invited to.
create or replace function public.friend_suggestions()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with me as (select public.require_user() as uid),
  via_steam as (
    select s.user_id, s.persona_name
    from public.steam_friends f
    join me on f.user_id = me.uid
    join public.steam_accounts s on s.steam_id = f.friend_steam_id
    where s.user_id <> me.uid
  ),
  via_discord as (
    select b.user_id, a.name as server
    from public.discord_guilds a
    join me on a.user_id = me.uid
    join public.discord_guilds b on b.guild_id = a.guild_id
    where b.user_id <> me.uid
  ),
  people as (select user_id from via_steam union select user_id from via_discord)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.display_name, 'hue', p.avatar_hue, 'avatar_url', p.avatar_url,
           'steam_name', (select v.persona_name from via_steam v where v.user_id = p.id limit 1),
           'servers', coalesce((select jsonb_agg(distinct v.server) from via_discord v where v.user_id = p.id), '[]'),
           'in_lists', coalesce((
             select jsonb_agg(m2.list_id) from public.list_members m1
             join public.list_members m2 on m2.list_id = m1.list_id and m2.user_id = p.id
             where m1.user_id = me.uid), '[]'),
           'invited_lists', coalesce((
             select jsonb_agg(i.list_id) from public.list_invites i
             where i.to_user = p.id and i.from_user = me.uid), '[]')
         ) order by lower(p.display_name)), '[]')
  from people x
  join public.profiles p on p.id = x.user_id
  cross join me
$$;

-- Invite someone to a list you're in. Returns false if they're already in it.
create or replace function public.invite_to_list(p_list uuid, p_user uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_list);
begin
  if not public.can_invite(p_user) then
    raise exception 'You can only invite friends you can see here' using errcode = '42501';
  end if;
  if exists (select 1 from public.list_members where list_id = p_list and user_id = p_user) then
    return false;
  end if;
  insert into public.list_invites (list_id, to_user, from_user) values (p_list, p_user, v_uid)
  on conflict (list_id, to_user) do update set from_user = excluded.from_user, created_at = now();
  return true;
end
$$;

-- Invites waiting for the caller, newest first.
create or replace function public.my_invites()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with me as (select public.require_user() as uid)
  select coalesce(jsonb_agg(jsonb_build_object(
           'list_id', l.id, 'list_name', l.name, 'from_name', f.display_name,
           'member_names', (select jsonb_agg(p.display_name order by m.joined_at)
                            from public.list_members m join public.profiles p on p.id = m.user_id
                            where m.list_id = l.id),
           'created_at', i.created_at
         ) order by i.created_at desc), '[]')
  from public.list_invites i
  join me on i.to_user = me.uid
  join public.lists l on l.id = i.list_id
  join public.profiles f on f.id = i.from_user
$$;

-- Join (true) or decline (false) an invite. Returns the list id.
create or replace function public.answer_invite(p_list uuid, p_accept boolean)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  if not exists (select 1 from public.list_invites where list_id = p_list and to_user = v_uid) then
    raise exception 'List not found' using errcode = 'P0002';
  end if;
  if p_accept then
    insert into public.list_members (list_id, user_id) values (p_list, v_uid) on conflict do nothing;
  end if;
  delete from public.list_invites where list_id = p_list and to_user = v_uid;
  return p_list;
end
$$;

-- Server-only: who to email about an invite (if they keep emails on).
create or replace function public.invite_email_info(p_list uuid, p_user uuid, p_from uuid)
returns table (email text, name text, locale text, list_name text, from_name text)
language sql stable security definer
set search_path = ''
as $$
  select u.email::text, p.display_name, p.locale, l.name, f.display_name
  from public.list_invites i
  join auth.users u on u.id = i.to_user
  join public.profiles p on p.id = i.to_user
  join public.lists l on l.id = i.list_id
  join public.profiles f on f.id = p_from
  where i.list_id = p_list and i.to_user = p_user
    and p.email_reminders and coalesce(u.email, '') like '%@%'
$$;

------------------------------------------------------------------------------------------
-- Library: show Steam playtime next to each game
------------------------------------------------------------------------------------------

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
               'steam_min', (select max(sg.playtime_min) from public.steam_games sg
                             where sg.user_id = me.uid and sg.game_id = g.id),
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
-- Who can call what
------------------------------------------------------------------------------------------

revoke all on all functions in schema public from public, anon;
revoke all on public.steam_accounts, public.steam_games, public.steam_friends, public.steam_nudge_skips,
              public.discord_links, public.discord_guilds, public.list_invites from anon;
revoke insert, update, delete on public.steam_accounts, public.steam_games, public.steam_friends,
              public.steam_nudge_skips, public.discord_links, public.discord_guilds, public.list_invites
  from authenticated;

-- Server-only (verified identities, email addresses)
revoke execute on function public.steam_link(text, text, text) from authenticated;
revoke execute on function public.steam_sync(jsonb, text) from authenticated;
revoke execute on function public.steam_save_friends(text[]) from authenticated;
revoke execute on function public.discord_save(text, jsonb) from authenticated;
revoke execute on function public.invite_email_info(uuid, uuid, uuid) from authenticated;
revoke execute on function public.clear_invite_on_join() from authenticated;

grant execute on function
  public.steam_unlink(), public.discord_unlink(), public.my_connections(), public.steam_nudges(),
  public.skip_steam_nudge(bigint), public.can_invite(uuid), public.friend_suggestions(),
  public.invite_to_list(uuid, uuid), public.my_invites(), public.answer_invite(uuid, boolean),
  public.my_library()
to authenticated;
