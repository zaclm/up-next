-- Local sample data (same people and games as the design mockups).
-- Only for local development: npm run db:reset

\set ON_ERROR_STOP on
set client_min_messages = warning;

begin;

create function pg_temp.as_user(p_name text) returns void language plpgsql security definer as $$
declare v uuid;
begin
  select id into v from auth.users where email = lower(p_name) || '@upnext.local';
  perform set_config('request.jwt.claim.sub', v::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
end $$;

insert into auth.users (email, raw_user_meta_data) values
  ('zac@upnext.local', '{"display_name":"Zac"}'),
  ('karim@upnext.local', '{"display_name":"Karim"}'),
  ('yassine@upnext.local', '{"display_name":"Yassine"}'),
  ('omar@upnext.local', '{"display_name":"Omar"}'),
  ('mehdi@upnext.local', '{"display_name":"Mehdi"}'),
  ('ilyas@upnext.local', '{"display_name":"Ilyas"}');

-- Pale identity tints spread around the wheel
update public.profiles p set avatar_hue = v.hue
from (values ('Zac', 214), ('Karim', 318), ('Yassine', 140), ('Omar', 28), ('Mehdi', 250), ('Ilyas', 48)) v(name, hue)
where p.display_name = v.name;

create temp table g (k text primary key, id bigint);
select pg_temp.as_user('zac');
insert into g values
  ('hd2',     public.upsert_game('Helldivers 2', null, '/dev-covers/helldivers-2.svg', '{Shooter,Co-op}', 2024::smallint)),
  ('drg',     public.upsert_game('Deep Rock Galactic', null, '/dev-covers/deep-rock-galactic.svg', '{Shooter,Co-op}', 2020::smallint)),
  ('repo',    public.upsert_game('R.E.P.O.', null, '/dev-covers/repo.svg', '{Horror,Co-op}', 2025::smallint)),
  ('valheim', public.upsert_game('Valheim', null, '/dev-covers/valheim.svg', '{Survival,Co-op}', 2021::smallint)),
  ('phasmo',  public.upsert_game('Phasmophobia', null, '/dev-covers/phasmophobia.svg', '{Horror,Co-op}', 2020::smallint)),
  ('raft',    public.upsert_game('Raft', null, '/dev-covers/raft.svg', '{Survival,Co-op}', 2022::smallint)),
  ('amongus', public.upsert_game('Among Us', null, '/dev-covers/among-us.svg', '{Party}', 2018::smallint)),
  ('hades',   public.upsert_game('Hades II', null, '/dev-covers/hades-2.svg', '{Roguelike}', 2025::smallint)),
  ('bg3',     public.upsert_game('Baldur''s Gate 3', null, '/dev-covers/baldurs-gate-3.svg', '{RPG}', 2023::smallint)),
  ('night',   public.upsert_game('Elden Ring Nightreign', null, '/dev-covers/nightreign.svg', '{Action,Co-op}', 2025::smallint)),
  ('sot',     public.upsert_game('Sea of Thieves', null, '/dev-covers/sea-of-thieves.svg', '{Adventure,Co-op}', 2018::smallint)),
  ('lc',      public.upsert_game('Lethal Company', null, '/dev-covers/lethal-company.svg', '{Horror,Co-op}', 2023::smallint)),
  ('peak',    public.upsert_game('Peak', null, '/dev-covers/peak.svg', '{Climbing,Co-op}', 2025::smallint)),
  ('llb',     public.upsert_game('Lethal League Blaze', null, '/dev-covers/lethal-league.svg', '{Fighting}', 2018::smallint));
create function pg_temp.g(p text) returns bigint language sql as $$ select id from g where k = p $$;

-- Lists
select pg_temp.as_user('zac');
create temp table l (k text primary key, id uuid);
insert into l values ('squad', public.create_list('Squad Night')), ('bros', public.create_list('Brothers')), ('raid', public.create_list('Weekend Raid'));
create function pg_temp.l(p text) returns uuid language sql as $$ select id from l where k = p $$;
update public.lists set invite_code = 'SQDN-4821' where id = pg_temp.l('squad');
update public.lists set invite_code = 'BROS-2739' where id = pg_temp.l('bros');
update public.lists set invite_code = 'RAID-5562' where id = pg_temp.l('raid');

select pg_temp.as_user('karim');   select public.join_list('SQDN-4821'); select public.join_list('RAID-5562');
select pg_temp.as_user('yassine'); select public.join_list('SQDN-4821');
select pg_temp.as_user('omar');    select public.join_list('SQDN-4821');
select pg_temp.as_user('mehdi');   select public.join_list('BROS-2739');
select pg_temp.as_user('ilyas');   select public.join_list('BROS-2739');

-- Zac's library, categories and scores
select pg_temp.as_user('zac');
select public.save_score(pg_temp.g('hd2'), 9, null);
select public.save_score(pg_temp.g('drg'), 8, null);
select public.save_score(pg_temp.g('repo'), 8, null);
select public.save_score(pg_temp.g('valheim'), 7, 7);
select public.save_score(pg_temp.g('phasmo'), 8, 9);
select public.save_score(pg_temp.g('raft'), 7, 8.5);
select public.save_score(pg_temp.g('amongus'), 6, 7);
select public.save_score(pg_temp.g('hades'), 9.5, 9.5);
select public.save_score(pg_temp.g('bg3'), 9, null, false);
select public.save_score(pg_temp.g('night'), 8.5, null);
select public.save_score(pg_temp.g('sot'), 7, 8);

create temp table c (k text primary key, id bigint);
insert into c values ('coop', public.create_category('Co-op')), ('horror', public.create_category('Horror')),
                     ('weekend', public.create_category('Weekend')), ('solo', public.create_category('Solo'));
select public.set_game_categories(pg_temp.g('hd2'), array[(select id from c where k='coop'), (select id from c where k='weekend')]);
select public.set_game_categories(pg_temp.g('drg'), array[(select id from c where k='coop')]);
select public.set_game_categories(pg_temp.g('repo'), array[(select id from c where k='coop'), (select id from c where k='horror')]);
select public.set_game_categories(pg_temp.g('valheim'), array[(select id from c where k='coop'), (select id from c where k='weekend')]);
select public.set_game_categories(pg_temp.g('phasmo'), array[(select id from c where k='coop'), (select id from c where k='horror')]);
select public.set_game_categories(pg_temp.g('raft'), array[(select id from c where k='coop')]);
select public.set_game_categories(pg_temp.g('amongus'), array[(select id from c where k='coop')]);
select public.set_game_categories(pg_temp.g('hades'), array[(select id from c where k='solo')]);
select public.set_game_categories(pg_temp.g('bg3'), array[(select id from c where k='weekend')]);
select public.set_game_categories(pg_temp.g('night'), array[(select id from c where k='coop')]);
select public.set_game_categories(pg_temp.g('sot'), array[(select id from c where k='coop')]);

-- Squad Night: Co-op is linked; Omar adds Lethal Company; Karim adds Lethal League Blaze, Peak
select public.link_category(pg_temp.l('squad'), (select id from c where k='coop'));
select public.add_games_to_lists(array[pg_temp.g('bg3')], array[pg_temp.l('squad'), pg_temp.l('bros')]);
select public.add_games_to_lists(array[pg_temp.g('sot'), pg_temp.g('amongus')], array[pg_temp.l('bros')]);
select public.add_games_to_lists(array[pg_temp.g('drg'), pg_temp.g('raft'), pg_temp.g('night')], array[pg_temp.l('raid')]);
select pg_temp.as_user('omar');  select public.add_games_to_lists(array[pg_temp.g('lc')], array[pg_temp.l('squad')]);
select pg_temp.as_user('karim'); select public.add_games_to_lists(array[pg_temp.g('llb'), pg_temp.g('peak')], array[pg_temp.l('squad')]);

-- Friends' scores
select pg_temp.as_user('karim');
select public.save_score(pg_temp.g('hd2'), 8, 8);
select public.save_score(pg_temp.g('drg'), 7.5, null);
select public.save_score(pg_temp.g('repo'), 7, null);
select public.save_score(pg_temp.g('valheim'), 8, 7);
select public.save_score(pg_temp.g('lc'), 9, null);
select public.save_score(pg_temp.g('llb'), 7, null);
select public.save_score(pg_temp.g('phasmo'), 9, 8.5);
select public.save_score(pg_temp.g('raft'), 7, 8);
select public.save_score(pg_temp.g('amongus'), 7, 7);
select public.save_score(pg_temp.g('bg3'), 8, null, false);
select public.save_score(pg_temp.g('night'), 8, 8);

select pg_temp.as_user('yassine');
select public.save_score(pg_temp.g('hd2'), 8, 9);
select public.save_score(pg_temp.g('drg'), 8, 8);
select public.save_score(pg_temp.g('repo'), 8, null);
select public.save_score(pg_temp.g('valheim'), 8, 7);
select public.save_score(pg_temp.g('lc'), 7, 8);
select public.save_score(pg_temp.g('peak'), 8, null);
select public.save_score(pg_temp.g('phasmo'), 8, 9);
select public.save_score(pg_temp.g('raft'), 8, 8);
select public.save_score(pg_temp.g('amongus'), 6, 6.5);
select public.save_score(pg_temp.g('sot'), 8, null, false);

select pg_temp.as_user('omar');
select public.save_score(pg_temp.g('hd2'), 8, 8);
select public.save_score(pg_temp.g('drg'), 7, 8.5);
select public.save_score(pg_temp.g('night'), 9, null, false);
select public.save_score(pg_temp.g('bg3'), 7, null, false);
select public.save_score(pg_temp.g('phasmo'), 9, 8.5);
select public.save_score(pg_temp.g('raft'), 7, 8);
select public.save_score(pg_temp.g('amongus'), 7, 7);

select pg_temp.as_user('mehdi');
select public.save_score(pg_temp.g('bg3'), 9, null);
select public.save_score(pg_temp.g('sot'), 7.5, null);
select public.save_score(pg_temp.g('amongus'), 6, null);
select pg_temp.as_user('ilyas');
select public.save_score(pg_temp.g('bg3'), 8.5, 9);
select public.save_score(pg_temp.g('sot'), 8, null);

-- Played together in Squad Night
select pg_temp.as_user('zac');
select public.set_list_game_status(pg_temp.l('squad'), pg_temp.g('phasmo'), 'played');
select public.set_list_game_status(pg_temp.l('squad'), pg_temp.g('raft'), 'played');
select public.set_list_game_status(pg_temp.l('squad'), pg_temp.g('amongus'), 'played');

commit;
\echo seeded
