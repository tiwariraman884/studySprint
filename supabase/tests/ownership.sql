-- Live ownership and integrity suite.
--
-- Run after the migrations and the pack seed on any PostgreSQL that provides
-- auth.uid() (a real Supabase project, `supabase db reset`, or the helpers in
-- tests/support/supabase-shim.sql for a plain PostgreSQL). The Node runner in
-- tests/integration/pg-harness.mjs executes it and fails on any output line
-- that starts with "NOT OK".
--
-- How it works: each scenario switches to the `authenticated` role, sets the
-- session subject (request.jwt.claim.sub) to a fixed UUID and then tries the
-- operation. A failure is either an error or zero affected rows.
\set ON_ERROR_STOP 0
\pset pager off

create extension if not exists pgcrypto;

-- Fixed test identities. They exist only inside this test database.
insert into auth.users (id, email)
values ('11111111-1111-4111-8111-111111111111', 'student-a@example.test'),
       ('22222222-2222-4222-8222-222222222222', 'student-b@example.test')
on conflict (id) do nothing;

-- Both students select the same pack: two students, one course pack.
-- A committed transaction, so the fixtures below see stable topic UUIDs.
begin;
do $$
declare
  v_version uuid;
begin
  select id into v_version from public.course_pack_versions where version = '1.0.0';
  if v_version is null then
    raise exception 'run the pack seed before the ownership suite';
  end if;
  insert into public.profiles (user_id, display_name, onboarding_completed_at)
  values ('11111111-1111-4111-8111-111111111111', 'Student A', now()),
         ('22222222-2222-4222-8222-222222222222', 'Student B', now())
  on conflict do nothing;
  insert into public.user_course_packs (user_id, pack_id, pack_version_id)
  values ('11111111-1111-4111-8111-111111111111', 'cia-2-2025-26', v_version),
         ('22222222-2222-4222-8222-222222222222', 'cia-2-2025-26', v_version)
  on conflict do nothing;
  insert into public.user_subjects (user_id, pack_id, subject_key)
  select u.id, 'cia-2-2025-26', 'cia-2-2025-26:de'
  from (values ('11111111-1111-4111-8111-111111111111'::uuid),
               ('22222222-2222-4222-8222-222222222222'::uuid)) u(id)
  on conflict do nothing;
end;
$$;
commit;

-- ---------------------------------------------------------------------------
-- Fixtures for student A.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
insert into public.notes (pack_id, topic_key, body, topic_id)
values ('cia-2-2025-26', 'cia-2-2025-26:de:de1', 'A private note',
        (select id from public.topics where key = 'cia-2-2025-26:de:de1'));
insert into public.topic_progress (topic_id, topic_key, status)
values ((select id from public.topics where key = 'cia-2-2025-26:de:de2'), 'cia-2-2025-26:de:de2', 'done');
insert into public.quiz_attempts (id, pack_id, question_count, correct_count)
values ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'cia-2-2025-26', 8, 6);
insert into public.exams (pack_id, title, exam_date)
values ('cia-2-2025-26', 'A mid semester', '2026-12-01');
insert into public.long_answer_drafts (pack_id, answer_key, body)
values ('cia-2-2025-26', 'la-alg-a', 'A draft');
commit;

-- ---------------------------------------------------------------------------
-- student B cannot read student A.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$
declare n int;
begin
  select count(*) into n from public.notes;
  if n <> 0 then raise exception 'NOT OK: student B can read student A notes (%)', n; end if;
  select count(*) into n from public.exams;
  if n <> 0 then raise exception 'NOT OK: student B can read student A exams (%)', n; end if;
  select count(*) into n from public.topic_progress;
  if n <> 0 then raise exception 'NOT OK: student B can read student A progress (%)', n; end if;
  select count(*) into n from public.long_answer_drafts;
  if n <> 0 then raise exception 'NOT OK: student B can read student A drafts (%)', n; end if;
  select count(*) into n from public.notes where user_id = '11111111-1111-4111-8111-111111111111';
  if n <> 0 then raise exception 'NOT OK: filtering a guessed id exposes rows';
  end if;
  raise notice 'OK: student B cannot read student A';
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- student B cannot overwrite student A, even using a guessed id.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$
declare n int; ignored text;
begin
  ignored := set_config('app.record_revision', 'deadbeef', true);
  update public.notes set body = 'hijacked' where topic_key = 'cia-2-2025-26:de:de1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NOT OK: student B overwrote a note (guessed id)'; end if;
  update public.quiz_attempts set correct_count = 0 where id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NOT OK: student B overwrote a quiz attempt (guessed id)'; end if;
  raise notice 'OK: student B cannot overwrite student A';
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- student B cannot delete student A.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$
declare n int;
begin
  delete from public.notes where topic_key = 'cia-2-2025-26:de:de1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NOT OK: student B deleted a note'; end if;
  delete from public.exams;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NOT OK: student B deleted exams'; end if;
  raise notice 'OK: student B cannot delete student A';
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- Ownership cannot be forged or reassigned.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$
begin
  begin
    insert into public.notes (user_id, pack_id, topic_key, body)
    values ('11111111-1111-4111-8111-111111111111', 'cia-2-2025-26', 'cia-2-2025-26:de:de3', 'forged');
    raise exception 'NOT OK: a student inserted a row for another user';
  exception when insufficient_privilege then
    raise notice 'OK: forged ownership rejected';
  end;
end;
$$;
rollback;

-- Anonymous sessions cannot touch student data.
begin;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare n int;
begin
  begin
    perform count(*) from public.notes;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.notes (pack_id, topic_key, body) values ('cia-2-2025-26', 'x', 'anon');
    raise exception 'NOT OK: anon inserted a note';
  exception when insufficient_privilege then
    raise notice 'OK: anon cannot write student data';
  end;
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- Students cannot publish or modify shared academic content.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$
declare n int;
begin
  begin
    update public.topics set title = 'Hacked';
    raise exception 'NOT OK: student modified shared content';
  exception when insufficient_privilege then
    raise notice 'OK: students cannot publish shared content';
  end;
  begin
    perform public.import_course_pack('{}'::jsonb, 'x');
    raise exception 'NOT OK: student called the content importer';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- Guests may read published content and the pack list.
-- ---------------------------------------------------------------------------
begin;
set local role anon;
do $$
declare n int;
begin
  select count(*) into n from public.topics;
  if n < 1 then raise exception 'NOT OK: anon cannot read published topics'; end if;
  raise notice 'OK: guests can read published content (% topics)', n;
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- Stale devices: a revision mismatch affects zero rows.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$
declare
  rev text;
  n int;
begin
  select public.topic_progress_fingerprint(status, notes_summary, excluded)
    into rev from public.topic_progress where topic_key = 'cia-2-2025-26:de:de2';
  perform set_config('app.record_revision', rev, true);
  update public.topic_progress set status = 'learning' where topic_key = 'cia-2-2025-26:de:de2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NOT OK: fresh edit rejected'; end if;
  perform set_config('app.record_revision', rev, true);
  begin
    update public.topic_progress set status = 'weak' where topic_key = 'cia-2-2025-26:de:de2';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'NOT OK: stale device overwrote newer work'; end if;
  exception when serialization_failure or insufficient_privilege then
    null; -- expected: the stored row no longer matches the revision this device saw
  end;
  raise notice 'OK: stale updates are rejected';
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- A new pack version keeps stable topic keys and reports removed topics.
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
do $$
declare
  pack jsonb;
  result jsonb;
begin
  select to_jsonb(row) into pack
  from (select
    p.id, p.title, p.description, p.institution, p.programme, p.branch, p.academic_year,
    p.syllabus_version, p.publication_status, p.license, p.author
  from public.course_packs p where p.id = 'cia-2-2025-26') row;
  pack := pack || jsonb_build_object(
    'id', 'cia-2-2025-26',
    'version', '9.9.9',
    'subjects', (
      select jsonb_agg(jsonb_build_object(
        'subject', jsonb_build_object('key', s.key, 'name', s.name, 'short', s.short_name, 'description', s.description, 'icon', s.icon, 'color', s.color),
        'curriculum', jsonb_build_object('code', s.code),
        'units', coalesce((select jsonb_agg(jsonb_build_object('number', u.number, 'text', u.syllabus_text, 'exam', u.exam_focus)) from public.units u where u.subject_id = s.id), '[]'::jsonb),
        'topics', coalesce((select jsonb_agg(jsonb_build_object(
            'id', t.key, 'unit', t.unit_number, 'title', t.title, 'minutes', t.minutes,
            'priority', t.priority, 'exam', t.exam_focus, 'options', t.content -> 'options',
            'answer', t.content -> 'answer'))
          from public.topics t
          where t.subject_id = s.id
            and not (s.key = 'cia-2-2025-26:de' and t.unit_number = 5)), '[]'::jsonb),
        'resources', '[]'::jsonb
      ))
      from public.subjects s
      join public.course_pack_versions v on v.id = s.pack_version_id
      where v.version = '1.0.0'
    )
  );
  result := public.import_course_pack(pack, 'suite-hash-9-9-9');
  if (result ->> 'changed')::boolean is not true then raise exception 'NOT OK: version import not applied'; end if;
  if jsonb_array_length(result -> 'removedTopicKeys') < 1 then
    raise exception 'NOT OK: removed topics were not reported';
  end if;
  raise notice 'OK: version update reports % removed topic keys', jsonb_array_length(result -> 'removedTopicKeys');
end;
$$;
rollback;
-- ---------------------------------------------------------------------------
-- Allowed own-record operations still work (non-superuser, owner claims).
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$
declare n int; id uuid;
begin
  insert into public.notes (pack_id, topic_key, body)
  values ('cia-2-2025-26', 'own-record-check', 'own note')
  on conflict (user_id, topic_key) do update set body = excluded.body;
  select count(*) into n from public.notes where topic_key = 'own-record-check';
  if n <> 1 then raise exception 'NOT OK: owner could not create and read own note'; end if;

  -- A stale-free update with the correct revision is accepted.
  perform set_config('app.record_revision',
    (select public.note_fingerprint('own note')), true);
  update public.notes set body = 'own note edited' where topic_key = 'own-record-check';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NOT OK: owner could not update own note'; end if;

  delete from public.notes where topic_key = 'own-record-check';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'NOT OK: owner could not delete own note'; end if;

  -- Linking a note to a topic uses the stable key, resolved from the catalog.
  id := public.resolve_topic_id('cia-2-2025-26:de:de1');

  if (public.complete_onboarding('Student A', 'cia-2-2025-26',
        array['cia-2-2025-26:de', 'cia-2-2025-26:py'])).user_id
     is distinct from '11111111-1111-4111-8111-111111111111' then
    raise exception 'NOT OK: onboarding returned the wrong profile';
  end if;
  select count(*) into n from public.user_subjects
   where user_id = '11111111-1111-4111-8111-111111111111' and selected;
  if n <> 2 then raise exception 'NOT OK: onboarding did not record subject choices (%)', n; end if;
  raise notice 'OK: owners can create, update, delete and onboard';
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- RPC permissions, unknown keys and repeated onboarding/import.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$
declare
  resolved int;
  ambiguous boolean;
begin
  -- Resolver: one known key, one unknown key. The unknown key is absent, not
  -- invented, and the known key resolves to the topic UUID.
  select count(*) into resolved from public.topic_ids_for_keys(
    array['cia-2-2025-26:de:de1', 'cia-2-2025-26:de:does-not-exist']);
  if resolved <> 1 then raise exception 'NOT OK: resolver should return only known keys'; end if;
  select count(*) into resolved from public.topic_ids_for_keys(
    array['cia-2-2025-26:de:de1']);
  if resolved <> 1 then raise exception 'NOT OK: resolver failed for a known key'; end if;
  select count(*) into resolved from public.current_topics()
   where key = 'cia-2-2025-26:de:de1';
  if resolved <> 1 then raise exception 'NOT OK: current_topics did not expose the published key'; end if;

  -- Repeated onboarding is idempotent and can change the subject selection.
  perform public.complete_onboarding('Student B', 'cia-2-2025-26', array['cia-2-2025-26:de']);
  perform public.complete_onboarding('Student B', 'cia-2-2025-26', array['cia-2-2025-26:dsa']);
  select count(*) into resolved from public.user_subjects
   where user_id = '22222222-2222-4222-8222-222222222222' and selected;
  if resolved <> 1 then raise exception 'NOT OK: subject selection was not replaced (%)', resolved; end if;
  select count(*) into resolved from public.user_course_packs
   where user_id = '22222222-2222-4222-8222-222222222222';
  if resolved <> 1 then raise exception 'NOT OK: repeated onboarding duplicated the pack row'; end if;

  -- A subject outside the pack is refused.
  begin
    perform public.complete_onboarding('Student B', 'cia-2-2025-26', array['other-pack:de']);
    raise exception 'NOT OK: onboarding accepted a subject outside the pack';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'OK: RPC permissions, unknown keys and repeated onboarding';
end;
$$;
rollback;

-- Anonymous sessions may read published content but may not call student RPCs.
begin;
set local role anon;
do $$
begin
  begin
    perform public.complete_onboarding('Anon', 'cia-2-2025-26', array['cia-2-2025-26:de']);
    raise exception 'NOT OK: anon called complete_onboarding';
  exception when insufficient_privilege then
    raise notice 'OK: anon cannot call student RPCs';
  end;
end;
$$;
rollback;
