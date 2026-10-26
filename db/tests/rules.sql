-- Rule tests for Up Next. Run against a fresh database with the migration applied:
--   npm run db:test
-- Every check raises an exception when it fails, so the run stops at the first problem.

\set ON_ERROR_STOP on
set client_min_messages = warning;

begin;

-- Helpers: act as a player, the way the app does for each request.
create function pg_temp.as_user(p_name text) returns void language plpgsql security definer as $$
declare v uuid;
begin
  select id into v from auth.users where email = lower(p_name) || '@test.local';
  perform set_config('request.jwt.claim.sub', v::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.uid(p_name text) returns uuid language sql security definer as $$
  select id from auth.users where email = lower(p_name) || '@test.local'
$$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;
set client_min_messages = notice;

-- Pure math --------------------------------------------------------------------------
select pg_temp.check(personal_score(8, 6) = 6.6, '30/70: Before 8, After 6 -> 6.6');
select pg_temp.check(personal_score(7, 8.5) = 8.1, '30/70: Before 7, After 8.5 -> 8.1 (rounds half up)');
select pg_temp.check(personal_score(9, null) = 9, 'Before only counts as the score');
select pg_temp.check(personal_score(null, 7.5) = 7.5, 'After only counts as the score');
select pg_temp.check(rank_threshold(1) = 1 and rank_threshold(2) = 2 and rank_threshold(3) = 2
  and rank_threshold(4) = 2 and rank_threshold(5) = 3 and rank_threshold(6) = 3,
  'threshold: half the members rounded up, at least 2, at most everyone');

do $$ begin
  perform 7.3::public.score;
  raise exception 'FAILED: 7.3 should not be a valid score';
exception when check_violation then raise notice 'ok - scores only allow half steps (7.3 rejected)';
end $$;

-- Players (the sign-up trigger creates their profiles) --------------------------------
insert into auth.users (email, raw_user_meta_data) values
  ('zac@test.local', '{"display_name":"Zac"}'),
  ('karim@test.local', '{"full_name":"Karim"}'),
  ('yassine@test.local', '{"custom_claims":{"global_name":"Yassine"},"full_name":"yassine_99"}'),
  ('omar@test.local', '{}'),
  ('mehdi@test.local', '{"display_name":"Mehdi"}');

select pg_temp.check((select display_name from profiles where id = pg_temp.uid('yassine')) = 'Yassine',
  'Discord global name is used for the profile name');
select pg_temp.check((select display_name from profiles where id = pg_temp.uid('omar')) = 'omar',
  'email users without a name get the part before @');

-- Not signed in ----------------------------------------------------------------------
do $$ begin
  perform public.my_lists();
  raise exception 'FAILED: my_lists should refuse anonymous calls';
exception when invalid_authorization_specification then raise notice 'ok - anonymous calls are refused';
end $$;

-- Zac creates Squad Night, friends join with the code --------------------------------
select pg_temp.as_user('zac');
create temp table t_list as select public.create_list('Squad Night') as id;
grant all on t_list to authenticated;

select pg_temp.as_user('karim');
select public.join_list((select replace(lower(invite_code), '-', ' ') from lists where id = (select id from t_list)));
select pg_temp.as_user('yassine');
select public.join_list((select invite_code from lists where id = (select id from t_list)));
select pg_temp.as_user('omar');
select public.join_list((select invite_code from lists where id = (select id from t_list)));
select pg_temp.check((select count(*) from list_members where list_id = (select id from t_list)) = 4,
  'four members after three joins (codes work in any case, with or without the dash)');

-- Catalog -----------------------------------------------------------------------------
create temp table t_games (name text primary key, id bigint);
grant all on t_games to authenticated;
select pg_temp.as_user('zac');
insert into t_games values
  ('hd2', public.upsert_game('Helldivers 2')),
  ('drg', public.upsert_game('Deep Rock Galactic')),
  ('repo', public.upsert_game('R.E.P.O.')),
  ('valheim', public.upsert_game('Valheim')),
  ('lc', public.upsert_game('Lethal Company')),
  ('peak', public.upsert_game('Peak')),
  ('night', public.upsert_game('Elden Ring Nightreign'));
select pg_temp.check(public.upsert_game('helldivers 2') = (select id from t_games where name = 'hd2'),
  'adding a game by hand reuses an existing game with the same name');

create function pg_temp.g(p text) returns bigint language sql as $$ select id from t_games where name = p $$;

select public.add_games_to_lists(array(select id from t_games), array[(select id from t_list)]);

-- Scores (same numbers as the design mockups) ----------------------------------------
select pg_temp.as_user('zac');
select public.save_score(pg_temp.g('hd2'), 9, null);
select public.save_score(pg_temp.g('drg'), 8, null);
select public.save_score(pg_temp.g('repo'), 8, null);
select public.save_score(pg_temp.g('valheim'), 7, 7);
select public.save_score(pg_temp.g('night'), 8.5, null);

select pg_temp.as_user('karim');
select public.save_score(pg_temp.g('hd2'), 8, 8);
select public.save_score(pg_temp.g('drg'), 7.5, null);
select public.save_score(pg_temp.g('repo'), 7, null);
select public.save_score(pg_temp.g('valheim'), 8, 7);
select public.save_score(pg_temp.g('lc'), 9, null);
select public.save_score(pg_temp.g('night'), 8, null);

select pg_temp.as_user('yassine');
select public.save_score(pg_temp.g('hd2'), 8, 9);
select public.save_score(pg_temp.g('drg'), 8, 8);
select public.save_score(pg_temp.g('repo'), 8, null);
select public.save_score(pg_temp.g('valheim'), 8, 7);
select public.save_score(pg_temp.g('lc'), 7, 8);
select public.save_score(pg_temp.g('peak'), 8, null);

select pg_temp.as_user('omar');
select public.save_score(pg_temp.g('hd2'), 8, 8);
select public.save_score(pg_temp.g('drg'), 7, 8.5);
select public.save_score(pg_temp.g('night'), 9, null, false);  -- Omar can't play Nightreign

-- Zac's board ---------------------------------------------------------------------------
select pg_temp.as_user('zac');
create temp table t_board as select public.list_board((select id from t_list)) as b;
grant all on t_board to authenticated;

select pg_temp.check(
  (select jsonb_agg(c ->> 'title' order by (c ->> 'rank')::int) from t_board, jsonb_array_elements(b -> 'ranked') c)
    = '["Helldivers 2", "Deep Rock Galactic", "R.E.P.O.", "Valheim"]'::jsonb,
  'ranking order: Helldivers 2, Deep Rock Galactic, R.E.P.O., Valheim');
select pg_temp.check(
  (select jsonb_agg((c ->> 'group_score')::numeric order by (c ->> 'rank')::int) from t_board, jsonb_array_elements(b -> 'ranked') c)
    = '[8.4, 7.9, 7.7, 7.2]'::jsonb,
  'group scores 8.4, 7.9, 7.7, 7.2 (each member counts once)');
select pg_temp.check(
  (select (c ->> 'scored_count')::int from t_board, jsonb_array_elements(b -> 'ranked') c where c ->> 'title' = 'R.E.P.O.') = 3,
  'R.E.P.O. shows 3 of 4 scored');

select pg_temp.check(
  exists (select 1 from t_board, jsonb_array_elements(b -> 'needs_score') c
          where c ->> 'title' = 'Lethal Company'
            and c -> 'group_score' = 'null'::jsonb and c -> 'scores' = 'null'::jsonb
            and (c ->> 'scored_count')::int = 2),
  'BLIND: Zac sees that 2 of 4 scored Lethal Company, but no numbers');
select pg_temp.check(
  not exists (select 1 from t_board, jsonb_array_elements(b -> 'ranked') c where c ->> 'title' = 'Lethal Company'),
  'BLIND: Lethal Company is not ranked for Zac until he scores it');

select pg_temp.check(
  exists (select 1 from t_board, jsonb_array_elements(b -> 'blocked') c
          where c ->> 'title' = 'Elden Ring Nightreign' and c -> 'cant_play' = '["omar"]'::jsonb),
  'PLAYABLE: Nightreign is held back because Omar said he can''t play it');

select pg_temp.check(
  exists (select 1 from t_board, jsonb_array_elements(b -> 'needs_score') c where c ->> 'title' = 'Peak'),
  'Peak (scored by Yassine only) is in Zac''s queue');

-- Karim already scored Lethal Company: he sees numbers
select pg_temp.as_user('karim');
select pg_temp.check(
  (select (c ->> 'group_score')::numeric from jsonb_array_elements(public.list_board((select id from t_list)) -> 'ranked') c
   where c ->> 'title' = 'Lethal Company') = 8.4,
  'Karim (scored) sees Lethal Company''s group score: (9 + 7.7) / 2 = 8.4 rounded');

-- Yassine: Peak has only his score -> waiting (needs 2 of 4)
select pg_temp.as_user('yassine');
select pg_temp.check(
  exists (select 1 from jsonb_array_elements(public.list_board((select id from t_list)) -> 'waiting') c
          where c ->> 'title' = 'Peak' and (c ->> 'needed')::int = 2),
  'THRESHOLD: Peak waits until 2 of 4 have scored it');

-- Zac scores Lethal Company (played: 8 -> 6) and it is revealed at #3 with 7.8
select pg_temp.as_user('zac');
select public.save_score(pg_temp.g('lc'), 8, 6);
select pg_temp.check(
  (select (c ->> 'group_score')::numeric = 7.8 and (c ->> 'rank')::int = 3
   from jsonb_array_elements(public.list_board((select id from t_list)) -> 'ranked') c
   where c ->> 'title' = 'Lethal Company'),
  'after scoring, Zac sees Lethal Company at 7.8, ranked #3');

-- Game page shows who scored before revealing numbers
select pg_temp.as_user('omar');
select pg_temp.check(
  (select (m ->> 'scored')::boolean and m -> 'personal' = 'null'::jsonb
   from jsonb_array_elements(public.list_game((select id from t_list), pg_temp.g('lc')) -> 'members') m
   where m ->> 'name' = 'Karim'),
  'BLIND (game page): Omar sees that Karim scored, not what');

-- Direct API access only returns your own scores
set local role authenticated;
select pg_temp.as_user('zac');
select pg_temp.check((select count(distinct user_id) from public.user_games) = 1
  and (select bool_and(user_id = pg_temp.uid('zac')) from public.user_games),
  'RLS: reading the scores table directly returns only your own rows');
select pg_temp.check((select count(*) from public.lists) = 1, 'RLS: you only see lists you are in');
select pg_temp.as_user('mehdi');
select pg_temp.check((select count(*) from public.lists) = 0 and (select count(*) from public.list_games) = 0,
  'RLS: a non-member sees no lists and no list games');
do $$ begin
  perform public.list_board((select id from t_list));
  raise exception 'FAILED: a non-member should not read the board';
exception when no_data_found then raise notice 'ok - a non-member cannot open the list board';
end $$;
reset role;

-- Playable filter can be switched off by the creator only
select pg_temp.as_user('karim');
do $$ begin
  perform public.update_list((select id from t_list), null, false);
  raise exception 'FAILED: only the creator should change the playable filter';
exception when insufficient_privilege then raise notice 'ok - only the creator can switch the playable filter';
end $$;
select pg_temp.as_user('zac');
select public.update_list((select id from t_list), null, false);
select pg_temp.check(
  exists (select 1 from jsonb_array_elements(public.list_board((select id from t_list)) -> 'waiting') c
          where c ->> 'title' = 'Elden Ring Nightreign')
  or exists (select 1 from jsonb_array_elements(public.list_board((select id from t_list)) -> 'ranked') c
          where c ->> 'title' = 'Elden Ring Nightreign'),
  'with the filter off, Nightreign is ranked like any other game');
select public.update_list((select id from t_list), null, true);

-- Linked categories: a new Co-op game joins the list by itself
select pg_temp.as_user('zac');
create temp table t_cat as select public.create_category('Co-op') as id;
grant all on t_cat to authenticated;
select public.link_category((select id from t_list), (select id from t_cat));
insert into t_games values ('raft', public.upsert_game('Raft'));
select public.save_score(pg_temp.g('raft'), 7, 8.5);
select public.set_game_categories(pg_temp.g('raft'), array[(select id from t_cat)]);
select pg_temp.check(
  exists (select 1 from list_games where list_id = (select id from t_list) and game_id = pg_temp.g('raft')),
  'LINKED CATEGORY: putting Raft in Co-op added it to Squad Night');

-- Removing and hiding
select pg_temp.as_user('karim');
do $$ begin
  perform public.remove_list_game((select id from t_list), pg_temp.g('raft'));
  raise exception 'FAILED: only the adder should remove';
exception when insufficient_privilege then raise notice 'ok - only the person who added a game can remove it';
end $$;
select pg_temp.as_user('zac');
select public.set_list_game_status((select id from t_list), pg_temp.g('raft'), 'hidden');
select pg_temp.check(
  jsonb_array_length(public.list_board((select id from t_list)) -> 'hidden') = 1,
  'the creator can hide a game and still sees it under hidden games');

-- Played together
select public.set_list_game_status((select id from t_list), pg_temp.g('hd2'), 'played');
select pg_temp.check(
  (select c ->> 'title' from jsonb_array_elements(public.list_board((select id from t_list)) -> 'ranked') c
   where (c ->> 'rank')::int = 1) = 'Deep Rock Galactic'
  and jsonb_array_length(public.list_board((select id from t_list)) -> 'played') = 1,
  'marking Helldivers 2 as played moves it to Played together; Deep Rock Galactic is up next');

-- Summaries
select pg_temp.check(jsonb_array_length(public.my_lists()) = 1, 'my_lists returns Zac''s list');
select pg_temp.check(
  (select count(*) from jsonb_array_elements(public.score_queue()) q where q ->> 'title' = 'Peak') = 1,
  'score_queue has Peak for Zac');
select pg_temp.check(
  (select count(*) from jsonb_array_elements(public.my_library() -> 'games')) = 7,
  'Zac''s library holds the 7 games he scored');

-- One row per game, whichever catalog it came from ----------------------------------
select pg_temp.check(public.title_key('THE FINALS') = public.title_key('The Finals™')
  and public.title_key('Call of Duty®: Black Ops') = 'call of duty black ops'
  and public.title_key('R.E.P.O.') = 'repo' and public.title_key('Baldur''s Gate 3') = 'baldurs gate 3',
  'titles compare without case, ™/®, dots, apostrophes or a leading "The" (same rule as the app)');
select pg_temp.as_user('mehdi');
select pg_temp.check(public.upsert_game('HELLDIVERS™ 2', null, null, '{}', null, 553850) = pg_temp.g('hd2'),
  'picking "HELLDIVERS™ 2" from Steam lands on the existing Helldivers 2');
select pg_temp.check((select steam_appid from games where id = pg_temp.g('hd2')) = 553850,
  'and its Steam app id is saved on that row');
select pg_temp.check(public.upsert_game('Helldivers 2', 250616) = pg_temp.g('hd2'),
  'picking it from IGDB later also lands there');
select pg_temp.check((select igdb_id from games where id = pg_temp.g('hd2')) = 250616,
  'and adds the IGDB id');
select pg_temp.check(public.upsert_game('HELLDIVERS 2: Super Citizen', null, null, '{}', null, 553850) = pg_temp.g('hd2'),
  'the same Steam app id always means the same game');
select public.upsert_game('Valheim', 250616);
select pg_temp.check((select igdb_id from games where id = pg_temp.g('valheim')) is null,
  'an IGDB id already used by another game is never copied onto a second row');

-- Search finds games already in Up Next despite typos
select pg_temp.check((select title from public.search_games('heldivers') limit 1) = 'Helldivers 2', 'search: "heldivers" finds Helldivers 2');
select pg_temp.check((select title from public.search_games('valhem') limit 1) = 'Valheim', 'search: "valhem" finds Valheim');
select pg_temp.check((select title from public.search_games('lethal comp') limit 1) = 'Lethal Company', 'search: "lethal comp" finds Lethal Company');
select pg_temp.check((select title from public.search_games('deep') limit 1) = 'Deep Rock Galactic', 'search: the first word alone finds Deep Rock Galactic');

-- New since your last visit -------------------------------------------------------
update list_members set last_seen_at = now() - interval '1 hour'
where list_id = (select id from t_list) and user_id = pg_temp.uid('zac');
select pg_temp.as_user('karim');
insert into t_games values ('among', public.upsert_game('Among Us'));
select public.add_games_to_lists(array[pg_temp.g('among')], array[(select id from t_list)]);
select pg_temp.as_user('zac');
select pg_temp.check((select (l ->> 'new_count')::int from jsonb_array_elements(public.my_lists()) l) = 1,
  'Karim adding Among Us shows 1 new game on Zac''s list');
select pg_temp.check(
  (select (c ->> 'is_new')::boolean from jsonb_array_elements(public.list_board((select id from t_list)) -> 'needs_score') c
   where c ->> 'title' = 'Among Us'),
  'Among Us is marked new on Zac''s board');
select public.mark_list_seen((select id from t_list));
select pg_temp.check((select (l ->> 'new_count')::int from jsonb_array_elements(public.my_lists()) l) = 0,
  'opening the list clears the new count');
select pg_temp.as_user('karim');
select pg_temp.check((select (l ->> 'new_count')::int from jsonb_array_elements(public.my_lists()) l) = 0,
  'your own additions never count as new for you');

-- List pictures -------------------------------------------------------------------
select public.set_list_image((select id from t_list), 'image/webp', decode(repeat('ab', 200), 'hex'));
select pg_temp.as_user('zac');
select pg_temp.check((select (l ->> 'image_version') is not null from jsonb_array_elements(public.my_lists()) l)
  and (select octet_length(data) from public.list_image((select id from t_list))) = 200,
  'any member can set the list picture, and every member gets it');
select pg_temp.as_user('mehdi');
do $$ begin
  perform public.set_list_image((select id from t_list), 'image/webp', decode(repeat('ab', 200), 'hex'));
  raise exception 'FAILED: a non-member changed the list picture';
exception when no_data_found then raise notice 'ok - people outside the list cannot change its picture';
end $$;
do $$ begin
  perform * from public.list_image((select id from t_list));
  raise exception 'FAILED: a non-member read the list picture';
exception when no_data_found then raise notice 'ok - people outside the list cannot see its picture';
end $$;
select pg_temp.as_user('zac');
select public.clear_list_image((select id from t_list));
select pg_temp.check((select (l ->> 'image_version') is null from jsonb_array_elements(public.my_lists()) l),
  'removing the picture goes back to the default');

-- Leaving: the creator leaves, the list moves to the next member
select public.leave_list((select id from t_list));
select pg_temp.check((select created_by from lists where id = (select id from t_list)) = pg_temp.uid('karim'),
  'when the creator leaves, the earliest remaining member takes over');

rollback;
\echo ALL RULE TESTS PASSED
