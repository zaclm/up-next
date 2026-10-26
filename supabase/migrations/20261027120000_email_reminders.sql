-- Up Next, Phase 2 — email reminders:
--   When the group marks a game "played together", members who still owe an After score for it
--   get one email ("How was it? Add your After score"). Each player can turn these emails off.
--   Who gets one follows the same rule as the To score reminder, minus the person who marked it.

alter table public.profiles add column email_reminders boolean not null default true;

-- One email per person per game per list, even if the game is moved back and played again.
create table public.after_emails_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  list_id uuid not null references public.lists (id) on delete cascade,
  game_id bigint not null references public.games (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (user_id, list_id, game_id)
);
alter table public.after_emails_sent enable row level security; -- no policies: server only
revoke all on public.after_emails_sent from anon, authenticated;

create or replace function public.set_email_reminders(p_on boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  update public.profiles set email_reminders = coalesce(p_on, true) where id = v_uid;
end
$$;

-- Server only (not callable from the browser): reads sign-in email addresses.
create or replace function public.after_email_recipients(p_list uuid, p_game bigint, p_actor uuid)
returns table (user_id uuid, email text, name text, locale text)
language sql stable security definer
set search_path = ''
as $$
  select u.id, u.email::text, p.display_name, p.locale
  from public.list_games lg
  join public.list_members m on m.list_id = lg.list_id
  join public.profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  where lg.list_id = p_list
    and lg.game_id = p_game
    and lg.status = 'played'
    and m.user_id <> p_actor
    and m.joined_at <= lg.played_at
    and p.email_reminders
    and coalesce(u.email, '') like '%@%'
    and not exists (
      select 1 from public.user_games ug
      where ug.user_id = m.user_id and ug.game_id = p_game and ug.after_score is not null
    )
    and not exists (
      select 1 from public.after_skips s
      where s.user_id = m.user_id and s.list_id = p_list and s.game_id = p_game
    )
    and not exists (
      select 1 from public.after_emails_sent e
      where e.user_id = m.user_id and e.list_id = p_list and e.game_id = p_game
    )
$$;

revoke all on all functions in schema public from public, anon;
revoke execute on function public.after_email_recipients(uuid, bigint, uuid) from authenticated;
grant execute on function public.set_email_reminders(boolean) to authenticated;
