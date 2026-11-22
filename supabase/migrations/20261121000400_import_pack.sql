-- Import a validated course pack into the normalized content tables.
--
-- Called by the seed file (supabase/seed/20-import-course-packs.sql) and by the
-- importer endpoint (src/server/api/packs.js) with the service role. Students
-- have no privileges on the content tables, so this function is one of the few
-- write paths, and it is never reachable anonymously.
--
-- Versioning rules:
--   * An unchanged content hash is a no-op (idempotent repeat imports).
--   * A new version becomes the pack's current version, and the previous
--     versions stay readable so older student plans keep rendering.
--   * Progress, plans and notes are keyed by stable topic keys, so a new
--     version keeps a learner's history; topics removed in the new version are
--     reported back to the caller instead of being quietly deleted.
create or replace function public.import_course_pack(p_pack jsonb, p_content_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pack_id text := p_pack ->> 'id';
  v_version text := p_pack ->> 'version';
  v_existing_hash text;
  v_version_id uuid;
  v_previous_version_id uuid;
  v_subject jsonb;
  v_unit jsonb;
  v_topic jsonb;
  v_subject_id uuid;
  v_topic_id uuid;
  v_removed text[];
  v_counts jsonb;
begin
  if v_pack_id is null or v_pack_id !~ '^[a-z0-9][a-z0-9-]{2,63}$' then
    raise exception 'invalid pack id' using errcode = '22023';
  end if;
  if v_version is null or v_version !~ '^[0-9]+(\.[0-9]+){0,2}$' then
    raise exception 'invalid pack version' using errcode = '22023';
  end if;
  if jsonb_typeof(p_pack -> 'subjects') <> 'array' then
    raise exception 'pack has no subjects' using errcode = '22023';
  end if;

  select id into v_previous_version_id
    from public.course_pack_versions
   where pack_id = v_pack_id
   order by imported_at desc
   limit 1;

  select content_hash into v_existing_hash
    from public.course_pack_versions
   where pack_id = v_pack_id and version = v_version;

  if v_existing_hash = p_content_hash then
    select id into v_version_id
      from public.course_pack_versions
     where pack_id = v_pack_id and version = v_version;
    return jsonb_build_object(
      'packId', v_pack_id,
      'version', v_version,
      'versionId', v_version_id,
      'changed', false
    );
  end if;

  insert into public.course_packs (
    id, slug, title, description, institution, programme, branch, academic_year,
    syllabus_version, publication_status, reviewed_by, reviewed_at, license, author
  ) values (
    v_pack_id,
    v_pack_id,
    p_pack ->> 'title',
    coalesce(p_pack ->> 'description', ''),
    p_pack ->> 'institution',
    p_pack ->> 'programme',
    p_pack ->> 'branch',
    p_pack ->> 'academicYear',
    p_pack ->> 'syllabusVersion',
    coalesce(p_pack ->> 'publicationStatus', 'imported'),
    p_pack ->> 'reviewedBy',
    (p_pack ->> 'reviewedAt')::timestamptz,
    coalesce(p_pack ->> 'license', 'unlicensed'),
    coalesce(p_pack ->> 'author', 'Repository contributors')
  )
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    institution = excluded.institution,
    programme = excluded.programme,
    branch = excluded.branch,
    academic_year = excluded.academic_year,
    syllabus_version = excluded.syllabus_version,
    publication_status = excluded.publication_status,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at,
    license = excluded.license,
    author = excluded.author,
    updated_at = now();

  insert into public.course_pack_versions (
    pack_id, version, content_hash, publication_status, notes, imported_by
  ) values (
    v_pack_id,
    v_version,
    p_content_hash,
    coalesce(p_pack ->> 'publicationStatus', 'imported'),
    coalesce(p_pack ->> 'notes', ''),
    'import_course_pack'
  )
  on conflict (pack_id, version) do update set
    content_hash = excluded.content_hash,
    publication_status = excluded.publication_status,
    imported_at = now()
  returning id into v_version_id;

  -- Rebuild the version's content from the document. Child rows cascade.
  delete from public.subjects where pack_version_id = v_version_id;

  for v_subject in select * from jsonb_array_elements(p_pack -> 'subjects') loop
    insert into public.subjects (
      pack_version_id, key, code, name, short_name, description, icon, color, position
    ) values (
      v_version_id,
      v_subject -> 'subject' ->> 'key',
      v_subject -> 'curriculum' ->> 'code',
      v_subject -> 'subject' ->> 'name',
      v_subject -> 'subject' ->> 'short',
      coalesce(v_subject -> 'subject' ->> 'description', ''),
      v_subject -> 'subject' ->> 'icon',
      v_subject -> 'subject' ->> 'color',
      (select count(*) from public.subjects s where s.pack_version_id = v_version_id)
    )
    returning id into v_subject_id;

    for v_unit in select * from jsonb_array_elements(v_subject -> 'units') loop
      insert into public.units (subject_id, number, title, syllabus_text, exam_focus)
      values (
        v_subject_id,
        (v_unit ->> 'number')::int,
        v_unit ->> 'title',
        coalesce(v_unit ->> 'text', ''),
        coalesce((v_unit ->> 'exam')::boolean, false)
      );
    end loop;

    for v_topic in select * from jsonb_array_elements(v_subject -> 'topics') loop
      insert into public.topics (
        subject_id, key, unit_number, title, minutes, priority, exam_focus, content, position
      ) values (
        v_subject_id,
        v_topic ->> 'id',
        (v_topic ->> 'unit')::int,
        v_topic ->> 'title',
        greatest(1, coalesce((v_topic ->> 'minutes')::int, 20)),
        v_topic ->> 'priority',
        coalesce((v_topic ->> 'exam')::boolean, false),
        v_topic - 'id',
        (select count(*) from public.topics t where t.subject_id = v_subject_id)
      )
      returning id into v_topic_id;

      insert into public.materials (topic_id, kind, title, body, position)
      values
        (v_topic_id, 'guide', v_topic ->> 'title', jsonb_build_object(
          'brief', v_topic -> 'brief',
          'hinglish', v_topic -> 'hinglish',
          'points', v_topic -> 'points',
          'recall', v_topic -> 'recall'
        ), 0),
        (v_topic_id, 'worked-example', v_topic ->> 'question', jsonb_build_object(
          'question', v_topic -> 'question',
          'steps', v_topic -> 'steps',
          'code', v_topic -> 'code',
          'codeLanguage', v_topic -> 'codeLanguage'
        ), 1),
        (v_topic_id, 'quiz', v_topic ->> 'mcq', jsonb_build_object(
          'mcq', v_topic -> 'mcq',
          'options', v_topic -> 'options',
          'answer', v_topic -> 'answer',
          'explanation', v_topic -> 'explanation'
        ), 2);
    end loop;

    insert into public.resources (subject_id, label, url, description, position)
    select
      v_subject_id,
      r ->> 0,
      r ->> 1,
      coalesce(r ->> 2, ''),
      ordinality - 1
    from jsonb_array_elements(coalesce(v_subject -> 'resources', '[]'::jsonb))
      with ordinality as t(r, ordinality)
    where (r ->> 1) ~* '^https?://';
  end loop;

  -- Long answers are stored on a related topic (the first one) so their body
  -- renders with the same records a student already uses. Every answer keeps
  -- its own key in the body, so an answer with several related topics is not
  -- lost. Questions and quiz MCQs are stored as materials on their topic too,
  -- which keeps the shared content independent from student records.
  insert into public.materials (topic_id, kind, title, body, position)
  select
    coalesce(primary_topic.id, first_topic.id),
    'solution',
    l ->> 'title',
    l,
    10
  from jsonb_array_elements(coalesce(p_pack -> 'long', '[]'::jsonb)) as l
  join public.subjects s on s.pack_version_id = v_version_id and s.key = l ->> 'subject'
  left join public.topics primary_topic
    on primary_topic.subject_id = s.id
   and primary_topic.key = coalesce(l -> 'related' ->> 0, '')
  left join lateral (
    select t.id from public.topics t where t.subject_id = s.id order by t.position limit 1
  ) first_topic on true
  where coalesce(primary_topic.id, first_topic.id) is not null;

  insert into public.materials (topic_id, kind, title, body, position)
  select t.id, 'worked-example', q ->> 'title', q, 20
  from jsonb_array_elements(coalesce(p_pack -> 'chapterQuestions', '[]'::jsonb)) as q
  join public.subjects s on s.pack_version_id = v_version_id and s.key = q ->> 'subject'
  join public.topics t on t.subject_id = s.id and t.key = q ->> 'topicId';

  insert into public.materials (topic_id, kind, title, body, position)
  select t.id, 'quiz', q ->> 'mcq', q, 30
  from jsonb_array_elements(coalesce(p_pack -> 'quiz', '[]'::jsonb)) as q
  join public.subjects s on s.pack_version_id = v_version_id and s.key = q ->> 'subject'
  join public.topics t on t.subject_id = s.id and t.key = q ->> 'topicId';

  update public.course_packs set current_version_id = v_version_id where id = v_pack_id;

  -- Report topics that disappeared since the previous version so the caller
  -- can tell an existing learner what will no longer be shown.
  if v_previous_version_id is not null and v_previous_version_id <> v_version_id then
    select coalesce(array_agg(old.key), '{}') into v_removed
    from public.topics old
    join public.subjects s on s.id = old.subject_id
    where s.pack_version_id = v_previous_version_id
      and not exists (
        select 1 from public.topics n
        join public.subjects s2 on s2.id = n.subject_id
        where s2.pack_version_id = v_version_id and n.key = old.key
      );
  else
    v_removed := '{}';
  end if;

  select jsonb_build_object(
    'subjects', (select count(*) from public.subjects where pack_version_id = v_version_id),
    'topics', (select count(*) from public.topics t join public.subjects s on s.id = t.subject_id where s.pack_version_id = v_version_id),
    'units', (select count(*) from public.units u join public.subjects s on s.id = u.subject_id where s.pack_version_id = v_version_id)
  ) into v_counts;

  return jsonb_build_object(
    'packId', v_pack_id,
    'version', v_version,
    'versionId', v_version_id,
    'changed', true,
    'previousVersionId', v_previous_version_id,
    'counts', v_counts,
    'removedTopicKeys', v_removed
  );
end;
$$;

revoke all on function public.import_course_pack(jsonb, text) from public, anon, authenticated;
grant execute on function public.import_course_pack(jsonb, text) to service_role;
