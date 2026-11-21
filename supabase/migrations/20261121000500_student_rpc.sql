
-- Finish profile and default subject selection creation in one place.
--
-- A student session may write its own profile, but creating the *default*
-- subject selection depends on reading the published pack, whose policies are
-- fixed at statement start. Running the whole onboarding write as one
-- SECURITY DEFINER function keeps that bootstrap consistent and is also what
-- the app calls after sign-up. Ownership is still taken from auth.uid().
create or replace function public.complete_onboarding(
  p_display_name text,
  p_pack_id text,
  p_subject_keys text[]
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user_id();
  v_version uuid;
  profile public.profiles;
begin
  select v.id into v_version
  from public.course_packs p
  join public.course_pack_versions v on v.id = p.current_version_id
  where p.id = p_pack_id
    and p.publication_status <> 'retired';
  if v_version is null then
    raise exception 'unknown course pack' using errcode = 'P0002';
  end if;
  if p_subject_keys is null or array_length(p_subject_keys, 1) is null then
    raise exception 'choose at least one subject' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_subject_keys) k
    where not exists (
      select 1 from public.subjects s
      where s.pack_version_id = v_version and s.key = k
    )
  ) then
    raise exception 'one or more subjects are not part of this pack' using errcode = '22023';
  end if;

  insert into public.profiles (user_id, display_name, onboarding_completed_at)
  values (uid, left(coalesce(nullif(trim(p_display_name), ''), 'Student'), 60), now())
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        onboarding_completed_at = coalesce(public.profiles.onboarding_completed_at, now())
  returning * into profile;

  insert into public.user_course_packs (user_id, pack_id, pack_version_id)
  values (uid, p_pack_id, v_version)
  on conflict (user_id, pack_id) do update set pack_version_id = excluded.pack_version_id;

  delete from public.user_subjects where user_id = uid and pack_id = p_pack_id and subject_key <> all (p_subject_keys);
  insert into public.user_subjects (user_id, pack_id, subject_key, selected)
  select uid, p_pack_id, k, true from unnest(p_subject_keys) k
  on conflict (user_id, pack_id, subject_key) do update set selected = true;

  return profile;
end;
$$;
revoke all on function public.complete_onboarding(text, text, text[]) from public, anon;
grant execute on function public.complete_onboarding(text, text, text[]) to authenticated;

-- Record-level convenience: resolve every stable key in one round trip.
-- NOT security definer: it runs as the caller, so row-level security still
-- decides which topics the caller may see. A key that is not visible, or that
-- matches more than one row, is simply absent from the result; the client
-- reports those keys instead of guessing. The `ambiguous` column makes a
-- duplicate visible rather than silently picking one.
create or replace function public.topic_ids_for_keys(p_keys text[])
returns table (key text, id uuid, ambiguous boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select k.key, (array_agg(t.id))[1] as id, count(t.id) > 1 as ambiguous
  from (select distinct unnest(p_keys) as key) k
  join public.topics t on t.key = k.key
  join public.subjects s on s.id = t.subject_id
  join public.course_pack_versions v on v.id = s.pack_version_id
  join public.course_packs p on p.id = v.pack_id
  where p.current_version_id = v.id
    and p.publication_status <> 'retired'
  group by k.key
$$;
revoke all on function public.topic_ids_for_keys(text[]) from public, anon;
grant execute on function public.topic_ids_for_keys(text[]) to authenticated;
