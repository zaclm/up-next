-- Up Next, Phase 2 — languages: each player's chosen language (English, French or Arabic) is
-- saved on their profile, so it follows them to every device. Unset = browser language.

alter table public.profiles add column locale text check (locale in ('en', 'fr', 'ar'));

create or replace function public.set_locale(p_locale text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  if p_locale is not null and p_locale not in ('en', 'fr', 'ar') then
    raise exception 'Unknown language' using errcode = '22023';
  end if;
  update public.profiles set locale = p_locale where id = v_uid;
end
$$;

revoke all on all functions in schema public from public, anon;
grant execute on function public.set_locale(text) to authenticated;
