# Database design

PostgreSQL (Supabase) with row-level security. Shared academic content and
student-owned records are separate from the ground up: a student can read
published content and can never write it.

## Migrations

| File | Contents |
| --- | --- |
| `20261121000100_helpers.sql` | `private` schema: `current_user_id()`, ownership guard, FNV-1a fingerprint helpers |
| `20261121000200_content.sql` | Packs, versions, subjects, units, topics, materials, resources; read-only policies; key resolvers |
| `20261121000300_student_data.sql` | 15 student tables, constraints, indexes, per-command policies, ownership and revision triggers, `save_student_settings` |
| `20261121000400_import_pack.sql` | `import_course_pack(jsonb, text)`, service-role only, idempotent by content hash |
| `20261121000500_student_rpc.sql` | `complete_onboarding`, `resolve_topic_id`, `topic_ids_for_keys` |
| `20261121000600_profile_bootstrap.sql` | Creates a profile row when an account is created |

## Shared content

```
course_packs ─┬─ course_pack_versions ─┬─ subjects ─┬─ units
              │                       │            ├─ topics ─── materials
              │                       │            └─ resources
              └── current_version_id ─┘
```

- **Stable keys.** A topic's identity is `<pack>:<subject>:<topic>`, e.g.
  `cia-2-2025-26:de:de1`. The pack id doubles as the namespace. Two packs cannot
  collide, and a content version or an "exam focus" flag is never part of the
  identity.
- **Versions.** Importing a new version keeps earlier versions readable, so an
  older plan still renders. The function returns `removedTopicKeys` so a learner
  can be told what disappeared instead of losing it silently.
- **No student write path.** There is no INSERT/UPDATE/DELETE policy for
  students on these tables, and the grants remove those commands. Content is
  written only by the importer with the service role.
- **Readable by guests.** A signed-out visitor can read published packs to
  preview content. That is intended; there is no student data in these tables.

## Student records

| Table | One row per | Notes |
| --- | --- | --- |
| `profiles` | account | Name, institution, programme, branch, semester, language, onboarding completion |
| `user_course_packs` | account × pack | The pack and version the student chose |
| `user_subjects` | account × pack × subject | Selection; `selected = false` keeps history |
| `exams` | account exam | Calendar `date`, never a timestamp, so a day cannot shift |
| `study_preferences` | account × pack | Hours/day, study days, plan length |
| `plans` | account plan | The active plan and its backlog |
| `study_sessions` | plan × day × block | `completed_at` is separate from topic mastery |
| `topic_progress` | account × topic | Status, completion time, short summary |
| `revision_records` | account × topic | Last revision, confidence, note |
| `quiz_attempts` / `quiz_answers` | attempt / answer | Score is self-reported practice, not an examined result |
| `notes` | account × topic | Long free text |
| `long_answer_drafts` | account × answer | Draft, self-score, practised flag |
| `code_drafts` | account × language | Code and stdin |
| `student_settings` | account | Small presentation state only (theme, assistant transcript, timer) |

JSON is used for bounded payloads only (`student_settings`, and the content
`jsonb` columns). Learning records are real columns and real rows, never one
large document rewritten on every keystroke.

## Ownership

- `user_id` defaults to `private.require_user_id()`, which is `auth.uid()`.
  Ownership is never taken from the request body.
- A `BEFORE INSERT OR UPDATE` trigger refuses a row whose `user_id` differs from
  the session, and refuses moving a row to another account — even for the owner.
- Each table has one policy per command, all restricted to `authenticated` and
  all written as `user_id = (select private.current_user_id())`. There is no
  `USING (true)` anywhere.

## Concurrency

Each learning record carries a revision token: a 32-bit fingerprint of the
fields the client can change, computed identically in the browser
(`src/client/core/records.js`) and in SQL (`public.*_fingerprint`). The client
sends the token it loaded as a PostgREST column named `app.record_revision`; a
`BEFORE UPDATE` trigger compares it with the stored row and raises SQLSTATE
`40001` on a mismatch.

A trigger rather than a policy, because a policy's `WITH CHECK` is evaluated
against the row as it was *before* the update, where the new value equals
itself. This was found by the live suite, not by inspection.

`save_student_settings(settings, revision)` does the same for the one small
document, and raises `stale_settings` when another device saved first.

## Resolving keys safely

`resolve_topic_id()` and `topic_ids_for_keys()` are `SECURITY INVOKER`, so the
caller's RLS still applies; they read only current published versions. An
unknown key returns no row rather than a guess. An ambiguous key is reported with
`ambiguous = true`, never silently resolved to one of the candidates.

## Testing

`supabase/tests/ownership.sql` runs against a real database as two different
students and as an anonymous session: cross-user read, overwrite and delete
rejection with guessed ids, allowed own-record operations, RPC permissions,
unknown keys, content immutability, stale-write rejection, first-save semantics
and version import. `npm run test:pg` fails if any assertion does not run.
