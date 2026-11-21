-- Student-owned tables.
--
-- Every table here has a user_id column that defaults to the authenticated
-- session (private.require_user_id()). A trigger rejects inserts that claim a
-- different user and updates that try to change ownership, and RLS policies
-- restrict each operation to the row owner. Ownership never comes from the
-- client payload.
--
-- Each record also carries a revision token: the browser computes the same
-- fingerprint when it loads the row and sends it back on update. A mismatch
-- means another device saved first, and PostgREST reports zero updated rows
-- instead of overwriting unseen work.

create table public.profiles (
  user_id uuid primary key default private.require_user_id() references auth.users(id) on delete cascade,
  display_name text not null default 'Student'
    check (length(display_name) between 1 and 60),
  institution text check (institution is null or length(institution) <= 120),
  programme text check (programme is null or length(programme) <= 120),
  branch text check (branch is null or length(branch) <= 120),
  semester int check (semester is null or semester between 1 and 12),
  explanation_language text not null default 'en'
    check (explanation_language in ('en', 'hi-en')),
  onboarding_step int not null default 1 check (onboarding_step between 1 and 9),
  onboarding_completed_at timestamptz,
  theme text not null default 'dark' check (theme in ('dark', 'light')),
  locale text not null default 'en-IN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_course_packs (
  user_id uuid not null default private.require_user_id() references auth.users(id) on delete cascade,
  pack_id text not null references public.course_packs(id) on delete restrict,
  pack_version_id uuid not null references public.course_pack_versions(id) on delete restrict,
  selected_at timestamptz not null default now(),
  primary key (user_id, pack_id)
);

create table public.user_subjects (
  user_id uuid not null default private.require_user_id() references auth.users(id) on delete cascade,
  pack_id text not null,
  subject_key text not null,
  selected boolean not null default true,
  selected_at timestamptz not null default now(),
  primary key (user_id, pack_id, subject_key),
  foreign key (user_id, pack_id) references public.user_course_packs(user_id, pack_id) on delete cascade
);
create index user_subjects_owner_idx on public.user_subjects (user_id, pack_id) where selected;

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default private.require_user_id() references auth.users(id) on delete cascade,
  pack_id text not null references public.course_packs(id) on delete restrict,
  title text not null check (length(title) between 1 and 120),
  -- Calendar day in the student's local time zone. Stored as a date so no
  -- UTC conversion can move the exam to the previous or next day.
  exam_date date not null,
  start_time time,
  scope text not null default 'selected' check (scope in ('selected', 'full', 'custom')),
  notes text not null default '' check (length(notes) <= 2000),
  subject_keys text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, pack_id, title, exam_date)
);
create index exams_owner_idx on public.exams (user_id, exam_date);

create table public.study_preferences (
  user_id uuid not null default private.require_user_id() references auth.users(id) on delete cascade,
  pack_id text not null references public.course_packs(id) on delete restrict,
  hours_per_day numeric(3, 1) not null default 4 check (hours_per_day between 0.5 and 12),
  study_days text[] not null default '{mon,tue,wed,thu,fri,sat,sun}'
    check (array_length(study_days, 1) between 1 and 7
      and study_days <@ array['mon','tue','wed','thu','fri','sat','sun']),
  start_date date,
  plan_days int not null default 7 check (plan_days between 1 and 60),
  scope text not null default 'exam' check (scope in ('exam', 'full')),
  exclude_done boolean not null default true,
  primary key (user_id, pack_id)
);

create or replace function private.iso_utc(ts timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when ts is null then null
    else to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+00:00"')
  end
$$;

create or replace function private.json_str(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_jsonb(coalesce(value, ''))::text
$$;

create or replace function private.json_ts(ts timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_jsonb(coalesce(private.iso_utc(ts), '1970-01-01T00:00:00+00:00'))::text
$$;

-- Record columns are rendered as sorted-key JSON exactly as the browser's
-- canonicalJson() (src/client/core/records.js) renders them, so the fingerprint
-- computed in the browser matches the one verified here.
create or replace function public.topic_progress_fingerprint(
  p_status text,
  p_notes text,
  p_excluded boolean
)
returns text
language sql
immutable
set search_path = ''
as $$
  select private.record_fingerprint('{' ||
    '"excluded":' || case when coalesce(p_excluded, false) then 'true' else 'false' end || ',' ||
    '"notes":' || private.json_str(p_notes) || ',' ||
    '"status":' || private.json_str(p_status) || '}')
$$;

create or replace function public.revision_record_fingerprint(
  p_revised_at timestamptz,
  p_confidence int,
  p_note text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select private.record_fingerprint('{' ||
    '"confidence":' || coalesce(p_confidence, 0)::text || ',' ||
    '"note":' || private.json_str(p_note) || ',' ||
    '"revisedAt":' || private.json_ts(p_revised_at) || '}')
$$;

create or replace function public.quiz_attempt_fingerprint(
  p_completed_at timestamptz,
  p_question_count int,
  p_correct_count int
)
returns text
language sql
immutable
set search_path = ''
as $$
  select private.record_fingerprint('{' ||
    '"completedAt":' || private.json_ts(p_completed_at) || ',' ||
    '"correctCount":' || coalesce(p_correct_count, 0)::text || ',' ||
    '"questionCount":' || coalesce(p_question_count, 0)::text || '}')
$$;

create or replace function public.note_fingerprint(p_body text)
returns text
language sql
immutable
set search_path = ''
as $$
  select private.record_fingerprint('{"body":' || private.json_str(p_body) || '}')
$$;

create or replace function public.long_answer_draft_fingerprint(
  p_body text,
  p_self_score int,
  p_practised boolean
)
returns text
language sql
immutable
set search_path = ''
as $$
  select private.record_fingerprint('{' ||
    '"body":' || private.json_str(p_body) || ',' ||
    '"practised":' || case when coalesce(p_practised, false) then 'true' else 'false' end || ',' ||
    '"selfScore":' || coalesce(p_self_score, 0)::text || '}')
$$;

create or replace function public.code_draft_fingerprint(p_code text, p_stdin text)
returns text
language sql
immutable
set search_path = ''
as $$
  select private.record_fingerprint('{' ||
    '"code":' || private.json_str(p_code) || ',' ||
    '"stdin":' || private.json_str(p_stdin) || '}')
$$;

grant execute on function public.topic_progress_fingerprint(text, text, boolean),
  public.revision_record_fingerprint(timestamptz, int, text),
  public.quiz_attempt_fingerprint(timestamptz, int, int),
  public.note_fingerprint(text),
  public.long_answer_draft_fingerprint(text, int, boolean),
  public.code_draft_fingerprint(text, text)
  to authenticated, service_role;

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default private.require_user_id() references auth.users(id) on delete cascade,
  pack_id text not null,
  exam_id uuid references public.exams(id) on delete set null,
  title text not null default 'Study plan',
  start_date date not null,
  end_date date not null,
  days int not null check (days between 1 and 60),
  hours_per_day numeric(3, 1) not null check (hours_per_day between 0.5 and 12),
  scope text not null default 'exam' check (scope in ('exam', 'full')),
  subject_keys text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'archived')),
  -- Backlog topic keys that did not fit in the schedule. Kept so the planner can
  -- report remaining workload honestly instead of exceeding daily capacity.
  backlog_keys text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  foreign key (user_id, pack_id) references public.user_course_packs(user_id, pack_id) on delete cascade
);
create unique index plans_one_active_idx on public.plans (user_id, pack_id) where status = 'active';
create index plans_owner_idx on public.plans (user_id, start_date);

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default private.require_user_id() references auth.users(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  day_index int not null check (day_index between 1 and 60),
  block_index int not null default 0 check (block_index between 0 and 60),
  -- Calendar day in the student's time zone.
  scheduled_date date not null,
  subject_key text,
  title text not null default '',
  minutes int not null default 30 check (minutes between 5 and 600),
  topic_keys text[] not null default '{}',
  completed_at timestamptz,
  notes text not null default '' check (length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, day_index, block_index)
);
create index study_sessions_owner_idx on public.study_sessions (user_id, scheduled_date);

-- Separate records, deliberately: a completed study session never implies topic
-- mastery, and reading a topic never implies a study session was completed.
create table public.topic_progress (
  user_id uuid not null default private.require_user_id() references auth.users(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  status text not null default 'not-started'
    check (status in ('not-started', 'learning', 'done', 'weak')),
  -- Stable "pack:subject:legacy-id" key so offline clients can map progress
  -- before they have resolved database UUIDs.
  topic_key text not null,
  completed_at timestamptz,
  excluded boolean not null default false,
  notes_summary text not null default '' check (length(notes_summary) <= 500),
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id),
  unique (user_id, topic_key)
);
create index topic_progress_owner_status_idx on public.topic_progress (user_id, status);

create table public.revision_records (
  user_id uuid not null default private.require_user_id() references auth.users(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  topic_key text not null,
  revised_at timestamptz not null default now(),
  confidence int check (confidence between 1 and 5),
  note text not null default '' check (length(note) <= 1000),
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id),
  unique (user_id, topic_key)
);
create index revision_records_owner_idx on public.revision_records (user_id, revised_at desc);

create table public.quiz_attempts (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null default private.require_user_id() references auth.users(id) on delete cascade,
  pack_id text not null,
  subject_key text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  question_count int not null default 0 check (question_count between 0 and 200),
  correct_count int not null default 0 check (correct_count >= 0),
  revision text not null default 'v1',
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check (correct_count <= question_count),
  foreign key (user_id, pack_id) references public.user_course_packs(user_id, pack_id) on delete cascade
);
create index quiz_attempts_owner_idx on public.quiz_attempts (user_id, started_at desc);

create table public.quiz_answers (
  user_id uuid not null default private.require_user_id() references auth.users(id) on delete cascade,
  attempt_id uuid not null,
  question_key text not null,
  topic_key text,
  selected_index int check (selected_index between -1 and 3),
  correct boolean not null default false,
  answered_at timestamptz not null default now(),
  primary key (user_id, attempt_id, question_key),
  foreign key (user_id, attempt_id) references public.quiz_attempts(user_id, id) on delete cascade
);

create table public.notes (
  user_id uuid not null default private.require_user_id() references auth.users(id) on delete cascade,
  pack_id text not null,
  topic_id uuid references public.topics(id) on delete cascade,
  topic_key text not null,
  body text not null default '' check (length(body) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_key),
  foreign key (user_id, pack_id) references public.user_course_packs(user_id, pack_id) on delete cascade
);

create table public.long_answer_drafts (
  user_id uuid not null default private.require_user_id() references auth.users(id) on delete cascade,
  pack_id text not null,
  answer_key text not null,
  body text not null default '' check (length(body) <= 50000),
  self_score int check (self_score between 0 and 10),
  practised boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, answer_key),
  foreign key (user_id, pack_id) references public.user_course_packs(user_id, pack_id) on delete cascade
);

create table public.code_drafts (
  user_id uuid not null default private.require_user_id() references auth.users(id) on delete cascade,
  pack_id text not null,
  language text not null check (language in ('python', 'cpp', 'javascript')),
  code text not null default '' check (length(code) <= 30000),
  stdin text not null default '' check (length(stdin) <= 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, language),
  foreign key (user_id, pack_id) references public.user_course_packs(user_id, pack_id) on delete cascade
);

-- One JSON document per student for the small, presentation-only client state
-- that does not deserve its own table: theme, active quiz pointer, assistant
-- transcript and the focus timer. No learning records live here.
create table public.student_settings (
  user_id uuid primary key default private.require_user_id() references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object' and length(settings::text) <= 200000),
  revision text not null default 'v1',
  updated_at timestamptz not null default now()
);

-- Optimistic concurrency for the record tables. The browser sends the revision
-- it last loaded in the app.record_revision setting (see
-- src/client/core/sync.js). A BEFORE UPDATE trigger compares it with the stored
-- row, because a policy check evaluates the row *before* the update and would
-- compare the new value with itself. An empty token means "not supplied" and is
-- accepted for signed-in sessions; the client always supplies one.
create or replace function private.revision_matches(p_actual text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('app.record_revision', true), '') in ('', p_actual)
$$;

create or replace function public.check_topic_progress_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not private.revision_matches(
    public.topic_progress_fingerprint(old.status, old.notes_summary, old.excluded)) then
    raise exception 'stale update: another device saved this topic first' using errcode = '40001';
  end if;
  return new;
end;
$$;

create or replace function public.check_revision_record_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not private.revision_matches(
    public.revision_record_fingerprint(old.revised_at, old.confidence, old.note)) then
    raise exception 'stale update: another device saved this revision first' using errcode = '40001';
  end if;
  return new;
end;
$$;

create or replace function public.check_note_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not private.revision_matches(public.note_fingerprint(old.body)) then
    raise exception 'stale update: another device saved this note first' using errcode = '40001';
  end if;
  return new;
end;
$$;

create or replace function public.check_long_answer_draft_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not private.revision_matches(
    public.long_answer_draft_fingerprint(old.body, old.self_score, old.practised)) then
    raise exception 'stale update: another device saved this draft first' using errcode = '40001';
  end if;
  return new;
end;
$$;

create or replace function public.check_code_draft_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not private.revision_matches(public.code_draft_fingerprint(old.code, old.stdin)) then
    raise exception 'stale update: another device saved this file first' using errcode = '40001';
  end if;
  return new;
end;
$$;

create or replace function public.check_quiz_attempt_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not private.revision_matches(
    public.quiz_attempt_fingerprint(old.completed_at, old.question_count, old.correct_count)) then
    raise exception 'stale update: another device saved this attempt first' using errcode = '40001';
  end if;
  return new;
end;
$$;

-- Cross-device conflict detection for the settings document.
create or replace function public.save_student_settings(p_settings jsonb, p_revision text)
returns table (revision text, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := private.require_user_id();
  new_revision text := private.record_fingerprint(p_settings::text || '|' || clock_timestamp()::text);
begin
  update public.student_settings s
     set settings = p_settings,
         revision = new_revision,
         updated_at = now()
   where s.user_id = uid
     and s.revision = p_revision;
  if not found then
    -- First save on a fresh account (no row yet) is not a conflict.
    insert into public.student_settings (user_id, settings, revision)
    values (uid, p_settings, new_revision)
    on conflict (user_id) do nothing;
    if not found then
      raise exception 'stale_settings' using errcode = 'P0001';
    end if;
  end if;
  return query
    select s.revision, s.updated_at from public.student_settings s where s.user_id = uid;
end;
$$;
revoke all on function public.save_student_settings(jsonb, text) from public, anon;
grant execute on function public.save_student_settings(jsonb, text) to authenticated;

create trigger set_updated_at before update on public.profiles
  for each row execute function private.bump_updated_at();
create trigger set_updated_at before update on public.exams
  for each row execute function private.bump_updated_at();
create trigger set_updated_at before update on public.plans
  for each row execute function private.bump_updated_at();
create trigger set_updated_at before update on public.study_sessions
  for each row execute function private.bump_updated_at();
create trigger set_updated_at before update on public.revision_records
  for each row execute function private.bump_updated_at();
create trigger set_updated_at before update on public.quiz_attempts
  for each row execute function private.bump_updated_at();
create trigger set_updated_at before update on public.notes
  for each row execute function private.bump_updated_at();
create trigger set_updated_at before update on public.long_answer_drafts
  for each row execute function private.bump_updated_at();
create trigger set_updated_at before update on public.code_drafts
  for each row execute function private.bump_updated_at();
create trigger set_updated_at before update on public.student_settings
  for each row execute function private.bump_updated_at();

create trigger set_topic_progress_updated_at before update on public.topic_progress
  for each row execute function private.bump_updated_at();

create trigger guard_owner before insert or update on public.profiles
  for each row execute function private.guard_owner();
create trigger guard_owner before insert or update on public.user_course_packs
  for each row execute function private.guard_owner();
create trigger guard_owner before insert or update on public.user_subjects
  for each row execute function private.guard_owner();
create trigger guard_owner before insert or update on public.exams
  for each row execute function private.guard_owner();
create trigger guard_owner before insert or update on public.study_preferences
  for each row execute function private.guard_owner();
create trigger guard_owner before insert or update on public.plans
  for each row execute function private.guard_owner();
create trigger guard_owner before insert or update on public.study_sessions
  for each row execute function private.guard_owner();
create trigger guard_owner before insert or update on public.topic_progress
  for each row execute function private.guard_owner();
create trigger guard_owner before insert or update on public.revision_records
  for each row execute function private.guard_owner();
create trigger guard_owner before insert or update on public.quiz_attempts
  for each row execute function private.guard_owner();
create trigger guard_owner before insert or update on public.quiz_answers
  for each row execute function private.guard_owner();
create trigger guard_owner before insert or update on public.notes
  for each row execute function private.guard_owner();
create trigger guard_owner before insert or update on public.long_answer_drafts
  for each row execute function private.guard_owner();
create trigger guard_owner before insert or update on public.code_drafts
  for each row execute function private.guard_owner();
create trigger guard_owner before insert or update on public.student_settings
  for each row execute function private.guard_owner();

-- Revision guards. A BEFORE UPDATE trigger sees NEW/OLD, unlike a policy check
-- which is evaluated against the row as it was before the update.
create trigger guard_revision before update on public.topic_progress
  for each row execute function public.check_topic_progress_revision();
create trigger guard_revision before update on public.revision_records
  for each row execute function public.check_revision_record_revision();
create trigger guard_revision before update on public.notes
  for each row execute function public.check_note_revision();
create trigger guard_revision before update on public.long_answer_drafts
  for each row execute function public.check_long_answer_draft_revision();
create trigger guard_revision before update on public.code_drafts
  for each row execute function public.check_code_draft_revision();
create trigger guard_revision before update on public.quiz_attempts
  for each row execute function public.check_quiz_attempt_revision();

alter table public.profiles enable row level security;
alter table public.user_course_packs enable row level security;
alter table public.user_subjects enable row level security;
alter table public.exams enable row level security;
alter table public.study_preferences enable row level security;
alter table public.plans enable row level security;
alter table public.study_sessions enable row level security;
alter table public.topic_progress enable row level security;
alter table public.revision_records enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.notes enable row level security;
alter table public.long_answer_drafts enable row level security;
alter table public.code_drafts enable row level security;
alter table public.student_settings enable row level security;

-- Operation-specific policies. Policies are permissive and OR together, so each
-- command gets exactly one policy; there is no catch-all USING (true).
create policy "select own profile" on public.profiles for select to authenticated
  using (user_id = (select private.current_user_id()));
create policy "insert own profile" on public.profiles for insert to authenticated
  with check (user_id = (select private.current_user_id()));
create policy "update own profile" on public.profiles for update to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));
create policy "delete own profile" on public.profiles for delete to authenticated
  using (user_id = (select private.current_user_id()));

create policy "select own packs" on public.user_course_packs for select to authenticated
  using (user_id = (select private.current_user_id()));
create policy "insert own packs" on public.user_course_packs for insert to authenticated
  with check (user_id = (select private.current_user_id()));
create policy "update own packs" on public.user_course_packs for update to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));
create policy "delete own packs" on public.user_course_packs for delete to authenticated
  using (user_id = (select private.current_user_id()));

create policy "select own subjects" on public.user_subjects for select to authenticated
  using (user_id = (select private.current_user_id()));
create policy "insert own subjects" on public.user_subjects for insert to authenticated
  with check (user_id = (select private.current_user_id()));
create policy "update own subjects" on public.user_subjects for update to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));
create policy "delete own subjects" on public.user_subjects for delete to authenticated
  using (user_id = (select private.current_user_id()));

create policy "select own exams" on public.exams for select to authenticated
  using (user_id = (select private.current_user_id()));
create policy "insert own exams" on public.exams for insert to authenticated
  with check (user_id = (select private.current_user_id()));
create policy "update own exams" on public.exams for update to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));
create policy "delete own exams" on public.exams for delete to authenticated
  using (user_id = (select private.current_user_id()));

create policy "select own preferences" on public.study_preferences for select to authenticated
  using (user_id = (select private.current_user_id()));
create policy "insert own preferences" on public.study_preferences for insert to authenticated
  with check (user_id = (select private.current_user_id()));
create policy "update own preferences" on public.study_preferences for update to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));
create policy "delete own preferences" on public.study_preferences for delete to authenticated
  using (user_id = (select private.current_user_id()));

create policy "select own plans" on public.plans for select to authenticated
  using (user_id = (select private.current_user_id()));
create policy "insert own plans" on public.plans for insert to authenticated
  with check (user_id = (select private.current_user_id()));
create policy "update own plans" on public.plans for update to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));
create policy "delete own plans" on public.plans for delete to authenticated
  using (user_id = (select private.current_user_id()));

create policy "select own sessions" on public.study_sessions for select to authenticated
  using (user_id = (select private.current_user_id()));
create policy "insert own sessions" on public.study_sessions for insert to authenticated
  with check (user_id = (select private.current_user_id())
    and exists (select 1 from public.plans p where p.id = plan_id and p.user_id = (select private.current_user_id())));
create policy "update own sessions" on public.study_sessions for update to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));
create policy "delete own sessions" on public.study_sessions for delete to authenticated
  using (user_id = (select private.current_user_id()));

create policy "select own progress" on public.topic_progress for select to authenticated
  using (user_id = (select private.current_user_id()));
create policy "insert own progress" on public.topic_progress for insert to authenticated
  with check (user_id = (select private.current_user_id()));
create policy "update own progress" on public.topic_progress for update to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));

create or replace function public.check_code_draft_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.record_revision', true), '') <>
     public.code_draft_fingerprint(old.code, old.stdin) then
    raise exception 'stale update: another device saved this file first'
      using errcode = '40001';
  end if;
  return new;
end;
$$;
create policy "delete own progress" on public.topic_progress for delete to authenticated
  using (user_id = (select private.current_user_id()));

create policy "select own revisions" on public.revision_records for select to authenticated
  using (user_id = (select private.current_user_id()));
create policy "insert own revisions" on public.revision_records for insert to authenticated
  with check (user_id = (select private.current_user_id()));
create policy "update own revisions" on public.revision_records for update to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));
create policy "delete own revisions" on public.revision_records for delete to authenticated
  using (user_id = (select private.current_user_id()));

create policy "select own attempts" on public.quiz_attempts for select to authenticated
  using (user_id = (select private.current_user_id()));
create policy "insert own attempts" on public.quiz_attempts for insert to authenticated
  with check (user_id = (select private.current_user_id()));
create policy "update own attempts" on public.quiz_attempts for update to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));
create policy "delete own attempts" on public.quiz_attempts for delete to authenticated
  using (user_id = (select private.current_user_id()));

create policy "select own answers" on public.quiz_answers for select to authenticated
  using (user_id = (select private.current_user_id()));
create policy "insert own answers" on public.quiz_answers for insert to authenticated
  with check (user_id = (select private.current_user_id())
    and exists (select 1 from public.quiz_attempts a where a.id = attempt_id and a.user_id = (select private.current_user_id())));
create policy "update own answers" on public.quiz_answers for update to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));
create policy "delete own answers" on public.quiz_answers for delete to authenticated
  using (user_id = (select private.current_user_id()));

create policy "select own notes" on public.notes for select to authenticated
  using (user_id = (select private.current_user_id()));
create policy "insert own notes" on public.notes for insert to authenticated
  with check (user_id = (select private.current_user_id()));
create policy "update own notes" on public.notes for update to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));
create policy "delete own notes" on public.notes for delete to authenticated
  using (user_id = (select private.current_user_id()));

create policy "select own drafts" on public.long_answer_drafts for select to authenticated
  using (user_id = (select private.current_user_id()));
create policy "insert own drafts" on public.long_answer_drafts for insert to authenticated
  with check (user_id = (select private.current_user_id()));
create policy "update own drafts" on public.long_answer_drafts for update to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));
create policy "delete own drafts" on public.long_answer_drafts for delete to authenticated
  using (user_id = (select private.current_user_id()));

create policy "select own code" on public.code_drafts for select to authenticated
  using (user_id = (select private.current_user_id()));
create policy "insert own code" on public.code_drafts for insert to authenticated
  with check (user_id = (select private.current_user_id()));
create policy "update own code" on public.code_drafts for update to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));
create policy "delete own code" on public.code_drafts for delete to authenticated
  using (user_id = (select private.current_user_id()));

create policy "select own settings" on public.student_settings for select to authenticated
  using (user_id = (select private.current_user_id()));
create policy "insert own settings" on public.student_settings for insert to authenticated
  with check (user_id = (select private.current_user_id()));
create policy "update own settings" on public.student_settings for update to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));
create policy "delete own settings" on public.student_settings for delete to authenticated
  using (user_id = (select private.current_user_id()));

-- Grants: even if a policy were misconfigured, the role cannot do more than
-- its granted commands. anon gets nothing on student tables.
revoke all on public.profiles, public.user_course_packs, public.user_subjects, public.exams,
  public.study_preferences, public.plans, public.study_sessions, public.topic_progress,
  public.revision_records, public.quiz_attempts, public.quiz_answers, public.notes,
  public.long_answer_drafts, public.code_drafts, public.student_settings
  from anon, authenticated;
grant select, insert, update, delete on public.profiles, public.user_course_packs,
  public.user_subjects, public.exams, public.study_preferences, public.plans,
  public.study_sessions, public.topic_progress, public.revision_records,
  public.quiz_attempts, public.quiz_answers, public.notes, public.long_answer_drafts,
  public.code_drafts, public.student_settings
  to authenticated;
grant all on public.profiles, public.user_course_packs, public.user_subjects, public.exams,
  public.study_preferences, public.plans, public.study_sessions, public.topic_progress,
  public.revision_records, public.quiz_attempts, public.quiz_answers, public.notes,
  public.long_answer_drafts, public.code_drafts, public.student_settings
  to service_role;
