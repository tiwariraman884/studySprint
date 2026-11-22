# Verification

What has been run, what it proves, and what is still unverified. Results below
were recorded against the feature branch, not the working copy they were
developed in.

## Commands

```bash
npm run check        # syntax + asset checks
npm test             # unit, architecture and security tests
npm run test:smoke   # Worker boots, whole module graph served, guest app honest
npm run test:pg      # migrations, seed and the ownership suite on real PostgreSQL
npm run verify       # check + test + smoke + build
```

## What each suite proves

### `npm test` — 65 tests, 0 failures, 0 skipped

| File | Count | Proves |
| --- | --- | --- |
| `study.test.mjs` | 6 | Existing content and compiler behaviour is intact: 104 topics, 140 short questions, 60 long answers, 176 MCQs, compiler request bounds and honest failure reporting |
| `architecture.test.mjs` | 3 | Module graph resolves, server source is not served, planner capacity accounting, backup validation |
| `keys-migration.test.mjs` | 9 | Key namespace and uniqueness, deterministic legacy mapping, idempotent upgrade, immutable backup, unmapped records preserved, import preview classification |
| `sync.test.mjs` | 7 | Per-account queue, newest-edit merge, durability across reload, offline retry, conflict surfaced, debounce, revision sent with writes |
| `auth.test.mjs` | 8 | Unconfigured and SDK-failure states keep guest mode, restored session, sign-up needs confirmation, sign-in/sign-out/expiry events, recovery redirects, pinned SDK plus integrity hash |
| `server.test.mjs` | 8 | Only public config injected, no secret in a page or response, callback routes, environment validation, token-gated idempotent import, invalid pack rejected |
| `security.test.mjs` | 10 | Every student table has RLS and one owner policy per command, no catch-all policy, ownership enforced by trigger, content is read-only for students, revision guards present, no privileged credential in browser code |
| `curriculum.test.mjs` | 6 | The curriculum mapping's structure, source register and review flags |

Note: the suite total includes the existing content tests above; it is not a
claim that every listed behaviour is exercised end to end.

### `npm run test:pg` — 4 tests, 0 failures, 0 skipped

Runs `supabase/tests/ownership.sql` against PostgreSQL 15 as two different
students and as an anonymous session:

1. Migrations apply and re-running the pack seed does not duplicate content
   (104 topics, 1 version).
2. **Cross-student isolation:** student B cannot read student A's notes, exams,
   progress or drafts; filtering by a guessed id returns nothing; B cannot
   overwrite or delete A's rows even with a guessed primary key.
3. **Allowed operations still work:** the owner creates, updates and deletes a
   note; onboarding is idempotent and replaces the subject selection; a subject
   outside the pack is refused; an anonymous session may read published content
   but cannot call a student RPC; content cannot be published or modified.
4. **Stale writes:** a fresh edit with the correct revision succeeds; a second
   device holding the old revision is refused; settings conflicts raise
   `stale_settings`; the browser fingerprint equals the SQL fingerprint on the
   same row.

`STUDY_SPRINT_REQUIRE_PG=1` turns an unavailable database into a failure rather
than a skip. CI sets it.

### `npm run test:smoke`

Boots the real Worker with an empty environment, walks the complete module graph
(59 modules) and asserts the guest app is served, the account dialog exists, auth
routes render, `"enabled":false` is reported honestly, and no secret appears in
the page.

## Browser verification (headless Chromium, real DOM)

Driven against the isolated worktree build, zero console errors in every run:

| Scenario | Result |
| --- | --- |
| First visit, clean storage | Onboarding opens at step 1 (profile) |
| Complete profile, subjects, time, review | All four steps advance; review shows the chosen pack, subjects, hours and exam date |
| Deselect 2 of 6 subjects | 4 remain checked, 4 are stored, and the plan is built from 4 |
| Finish | Dialog closes, dashboard renders, sidebar shows the student's own name, heading and initials |
| Reload | Onboarding does not reappear; name and 4 subjects persist |
| Subjects page | 4 subject tiles, not 6 |
| Quiz page | Subject picker lists only the 4 selected |
| Revision page | Filters list only the 4 selected |
| Account panel with no configuration | Says sign-in is unavailable, "Continue as guest" still works |
| Settings | Four tabs (Preferences, Profile, Subjects, Account) reachable by keyboard |

## Not verified, and why

| Area | Status | Blocker |
| --- | --- | --- |
| Sign-up, confirmation email, password recovery | **Unverified** | No `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` in this environment. Never exercised against a live project |
| Cross-device sync with two real accounts | **Unverified end to end** | Needs a configured project. The ownership suite proves isolation in SQL; the browser-to-cloud path is unit-tested against a fake client only |
| Two real students using the same pack | **Partially verified** | Proved in SQL with real roles. Not yet driven through two browsers against a hosted project |
| Guest import into an account | **Unverified end to end** | Preview, mapping and idempotence are unit-tested; the upload path needs a configured project |
| Email delivery in production | **Not configured** | Requires SMTP credentials and a verified sending domain (see AUTHENTICATION.md) |
| Mobile widths | **Not visually verified at 360 px** | CSS breakpoints exist; only inspected in a desktop viewport |
| On-device AI model download | **Not exercised here** | ~700 MB download; unchanged from before this milestone |

Until the Supabase values are set and those flows are actually exercised, they
must be described as unverified — not as working.

## Deliberate non-claims

- This is the multi-student foundation, not the whole product plan.
- The first pack is authored material, not an approved syllabus.
- The curriculum map is a researched aid, not an official curriculum, and its
  review flags are open where sources are missing.
- Unit-level learning content exists for the six subjects of the pack, not for
  every mapped subject.
