-- Local seed: import every generated course pack.
-- Companion data file: supabase/seed/10-course-packs.json (npm run seed:packs).
-- This file contains no student data, so it is safe to commit.
--
-- psql variant (tests/support/rls.test.mjs and manual seeding):
--   docker exec -i <container> psql -U postgres -d study -v ON_ERROR_STOP=1 \
--     -f - < supabase/seed/20-import-course-packs.sql
-- It requires the data file to be mounted at /tmp/seed/10-course-packs.json.
-- The Supabase CLI reset runs the equivalent stored-procedure call; see
-- docs/COURSE-PACKS.md.
do $$
declare
  doc jsonb := convert_from(pg_read_binary_file('/tmp/seed/10-course-packs.json'), 'UTF8')::jsonb;
  entry jsonb;
  result jsonb;
begin
  for entry in select * from jsonb_array_elements(doc -> 'packs') loop
    result := public.import_course_pack(entry -> 'pack', entry ->> 'contentHash');
    raise notice 'Imported pack: %', result;
  end loop;
end;
$$;
