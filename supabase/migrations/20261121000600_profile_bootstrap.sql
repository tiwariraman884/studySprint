
-- Create a profile for each new account. In a real Supabase project the API
-- role cannot insert into auth.users, so the app cannot create its profile row
-- on first load. The auth.users row is authoritative: ownership still comes
-- from the session, never from a client payload. The display name is a neutral
-- default until the student completes onboarding.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, 'Student')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Accounts that already exist when this migration runs.
insert into public.profiles (user_id, display_name)
select u.id, 'Student' from auth.users u
on conflict (user_id) do nothing;
