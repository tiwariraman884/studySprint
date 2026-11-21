-- Minimal stand-in for the parts of a Supabase database the migrations rely on.
-- Used only by tests/local RLS harness in a throwaway PostgreSQL container; the
-- real host is Supabase, whose auth schema already provides these objects.
create schema if not exists auth;
create extension if not exists pgcrypto;

-- Supabase grants this already; a plain PostgreSQL needs it after our roles are
-- created below, so re-apply at the end of this file.

create table auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid()
returns uuid
language plpgsql
stable
as $$
declare
  raw text := current_setting('request.jwt.claim.sub', true);
begin
  if raw is null or raw = '' then
    return null;
  end if;
  return raw::uuid;
exception when others then
  return null;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to service_role;
