-- Shared academic content: course packs, versions, subjects, units, topics and
-- resources. This table set is readable by every signed-in student (and by the
-- anonymous guest preview) but writable only by the service role, which the
-- importer (src/server/api/packs.js) and the seed script use.
create table public.course_packs (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  title text not null check (length(title) between 1 and 160),
  description text not null default '',
  institution text,
  programme text,
  branch text,
  academic_year text,
  syllabus_version text,
  publication_status text not null default 'imported'
    check (publication_status in ('authored', 'imported', 'needs-review', 'reviewed', 'retired')),
  reviewed_by text,
  reviewed_at timestamptz,
  license text not null default 'unlicensed',
  author text not null default 'Repository contributors',
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_pack_versions (
  id uuid primary key default gen_random_uuid(),
  pack_id text not null references public.course_packs(id) on delete cascade,
  version text not null check (version ~ '^[0-9]+(\.[0-9]+){0,2}$'),
  content_hash text not null,
  publication_status text not null default 'imported'
    check (publication_status in ('authored', 'imported', 'needs-review', 'reviewed', 'retired')),
  notes text not null default '',
  imported_by text,
  imported_at timestamptz not null default now(),
  unique (pack_id, version)
);
create index course_pack_versions_pack_idx on public.course_pack_versions (pack_id, imported_at desc);

alter table public.course_packs
  add constraint course_packs_current_version_fk
  foreign key (current_version_id) references public.course_pack_versions(id) on delete set null;

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  pack_version_id uuid not null references public.course_pack_versions(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$'),
  code text,
  name text not null,
  short_name text,
  description text not null default '',
  icon text,
  color text,
  position int not null default 0,
  unique (pack_version_id, key)
);
create index subjects_pack_idx on public.subjects (pack_version_id, position);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  number int not null check (number > 0),
  title text,
  syllabus_text text not null default '',
  exam_focus boolean not null default false,
  unique (subject_id, number)
);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  -- Stable pack-qualified key. Unique per pack version, so an older version
  -- stays readable after a new version is imported with the same keys.
  key text not null check (key ~ '^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9:-]*$'),
  unit_number int not null,
  title text not null,
  minutes int not null default 20 check (minutes between 1 and 600),
  priority text check (priority in ('high', 'medium', 'low') or priority is null),
  exam_focus boolean not null default false,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  position int not null default 0
);
create index topics_subject_idx on public.topics (subject_id, unit_number, position);
create index topics_key_idx on public.topics (key);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  kind text not null check (kind in ('guide', 'worked-example', 'quiz', 'solution', 'resource')),
  title text,
  body jsonb not null,
  position int not null default 0
);
create index materials_topic_idx on public.materials (topic_id, position);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  label text not null,
  url text not null check (url ~* '^https?://'),
  description text not null default '',
  position int not null default 0
);
create index resources_subject_idx on public.resources (subject_id, position);

create trigger set_updated_at before update on public.course_packs
  for each row execute function private.bump_updated_at();

alter table public.course_packs enable row level security;
alter table public.course_pack_versions enable row level security;
alter table public.subjects enable row level security;
alter table public.units enable row level security;
alter table public.topics enable row level security;
alter table public.materials enable row level security;
alter table public.resources enable row level security;

-- Only published (not retired) content is visible. Guests may preview packs
-- before creating an account; content is not private and holds no student data.
create policy "published packs are readable"
  on public.course_packs for select
  to anon, authenticated
  using (publication_status <> 'retired');

create policy "published versions are readable"
  on public.course_pack_versions for select
  to anon, authenticated
  using (exists (
    select 1 from public.course_packs p
    where p.id = course_pack_versions.pack_id
      and p.publication_status <> 'retired'
  ));

create policy "subjects of readable versions are readable"
  on public.subjects for select
  to anon, authenticated
  using (exists (
    select 1
    from public.course_pack_versions v
    join public.course_packs p on p.id = v.pack_id
    where v.id = subjects.pack_version_id
      and p.publication_status <> 'retired'
  ));

create policy "units of readable subjects are readable"
  on public.units for select
  to anon, authenticated
  using (exists (
    select 1
    from public.subjects s
    join public.course_pack_versions v on v.id = s.pack_version_id
    join public.course_packs p on p.id = v.pack_id
    where s.id = units.subject_id
      and p.publication_status <> 'retired'
  ));

create policy "topics of readable subjects are readable"
  on public.topics for select
  to anon, authenticated
  using (exists (
    select 1
    from public.subjects s
    join public.course_pack_versions v on v.id = s.pack_version_id
    join public.course_packs p on p.id = v.pack_id
    where s.id = topics.subject_id
      and p.publication_status <> 'retired'
  ));

create policy "materials of readable topics are readable"
  on public.materials for select
  to anon, authenticated
  using (exists (
    select 1
    from public.topics t
    join public.subjects s on s.id = t.subject_id
    join public.course_pack_versions v on v.id = s.pack_version_id
    join public.course_packs p on p.id = v.pack_id
    where t.id = materials.topic_id
      and p.publication_status <> 'retired'
  ));

create policy "resources of readable subjects are readable"
  on public.resources for select
  to anon, authenticated
  using (exists (
    select 1
    from public.subjects s
    join public.course_pack_versions v on v.id = s.pack_version_id
    join public.course_packs p on p.id = v.pack_id
    where s.id = resources.subject_id
      and p.publication_status <> 'retired'
  ));

-- No INSERT/UPDATE/DELETE policy exists for students, and the grants below
-- remove those privileges, so a student cannot publish or alter shared content
-- even with direct REST calls.
revoke all on public.course_packs, public.course_pack_versions, public.subjects,
  public.units, public.topics, public.materials, public.resources
  from anon, authenticated;
grant select on public.course_packs, public.course_pack_versions, public.subjects,
  public.units, public.topics, public.materials, public.resources
  to anon, authenticated;
grant all on public.course_packs, public.course_pack_versions, public.subjects,
  public.units, public.topics, public.materials, public.resources
  to service_role;

-- Current topics of every readable pack. Used by the client to resolve stable
-- keys; it does not reveal any student data and stays inside the content
-- policies by reading only published packs.
create or replace function public.current_topics()
returns table (
  key text,
  topic_id uuid,
  subject_key text,
  unit_number int,
  title text,
  minutes int,
  exam_focus boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.key, t.id, s.key, t.unit_number, t.title, t.minutes, t.exam_focus
  from public.topics t
  join public.subjects s on s.id = t.subject_id
  join public.course_pack_versions v on v.id = s.pack_version_id
  join public.course_packs p on p.id = v.pack_id
  where p.current_version_id = v.id
    and p.publication_status <> 'retired'
  order by s.position, t.unit_number, t.position
$$;
revoke all on function public.current_topics() from public;
grant execute on function public.current_topics() to anon, authenticated, service_role;

-- Resolve one stable key to the current topic UUID. Returns null for unknown
-- keys instead of guessing, and refuses an ambiguous key (the same key can only
-- exist once per version, but this stays explicit).
create or replace function public.resolve_topic_id(p_topic_key text)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select (array_agg(t.id))[1]
  from public.topics t
  join public.subjects s on s.id = t.subject_id
  join public.course_pack_versions v on v.id = s.pack_version_id
  join public.course_packs p on p.id = v.pack_id
  where t.key = p_topic_key
    and p.current_version_id = v.id
    and p.publication_status <> 'retired'
  having count(*) = 1
$$;
revoke all on function public.resolve_topic_id(text) from public;
grant execute on function public.resolve_topic_id(text) to anon, authenticated, service_role;

-- Pack lookup used by the browser: latest version of every published pack with
-- its subject list. Implemented as a view so listing packs stays one request.
create or replace view public.course_pack_summaries
with (security_invoker = true)
as
select
  p.id,
  p.title,
  p.description,
  p.institution,
  p.programme,
  p.branch,
  p.academic_year,
  p.syllabus_version,
  p.publication_status,
  p.license,
  p.author,
  p.current_version_id,
  v.version as current_version,
  (select count(*) from public.subjects s where s.pack_version_id = p.current_version_id) as subject_count,
  (select count(*) from public.topics t join public.subjects s on s.id = t.subject_id where s.pack_version_id = p.current_version_id) as topic_count
from public.course_packs p
left join public.course_pack_versions v on v.id = p.current_version_id
where p.publication_status <> 'retired';

grant select on public.course_pack_summaries to anon, authenticated;
