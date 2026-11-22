-- Shared helpers for the study platform.
--
-- * private.current_user_id() is the single source of ownership. It reads the
--   authenticated session's subject claim; application code never sends a user
--   id, so a student cannot claim another student's rows.
-- * Fingerprint helpers normalise a student's record into the same shape the
--   browser uses (see src/client/core/sync.js). The browser sends that value as
--   the revision it last saw, so a device with stale data cannot overwrite a
--   newer edit silently.
create schema if not exists private;
-- Table owners (postgres) need this to reference auth.users in local setups.
grant usage on schema auth to authenticated, service_role;
grant select on auth.users to service_role;
revoke all on schema private from public;
-- Supabase grants this to its API roles already; repeating it keeps a plain
-- PostgreSQL (the integration container) working the same way.
grant usage on schema auth to authenticated, service_role;
grant usage on schema private to authenticated, service_role;
grant select on auth.users to authenticated;

create or replace function private.current_user_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
$$;

create or replace function private.require_user_id()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  return uid;
end;
$$;

create or replace function private.fnv1a(value text)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  hash bigint := 2166136261;
  bytes bytea := convert_to(coalesce(value, ''), 'UTF8');
  i int;
begin
  for i in 0 .. length(bytes) - 1 loop
    hash := hash # (get_byte(bytes, i)::bigint);
    hash := (hash * 16777619) & 4294967295;
  end loop;
  return hash;
end;
$$;

-- "status|2026-11-20T10:00:00.000Z" -> 8 lowercase hex characters.
create or replace function private.record_fingerprint(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(lpad(to_hex(private.fnv1a(value)), 8, '0'))
$$;

create or replace function private.bump_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Students may only belong to themselves: every private table uses this
-- trigger so ownership cannot be rewritten even through a later policy change.
create or replace function private.guard_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Row ownership cannot change' using errcode = '42501';
  end if;
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then
    raise exception 'Row owner must be the authenticated user' using errcode = '42501';
  end if;
  return new;
end;
$$;
