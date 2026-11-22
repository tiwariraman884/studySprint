# Deployment

## Local development

1. Install Node.js 22 or newer (no npm packages needed).
2. Run `npm run dev` from the repository root.
3. Open the URL printed in the terminal.
4. Refresh after frontend edits; restart after backend edits.

The `.env.example` file documents all optional and required variables. The
server reads shell environment variables only — it does **not** load a `.env`
file automatically.

## Supabase setup (multi-student cloud sync)

Cloud sign-in and sync require a Supabase project. Guest mode works without it.

1. Create a project at https://supabase.com.
2. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in your environment.
3. Apply migrations in order:

```bash
# From the repo root, using the Supabase CLI:
supabase db push
# or apply each file in supabase/migrations/ manually in the SQL editor.
```

4. Migrations implement:
   - Row-Level Security (RLS) on all student tables.
   - `BEFORE UPDATE` trigger guards (`guard_revision`) for optimistic concurrency.
   - Stored functions that run as `service_role` only.
   - A live SQL test suite (`supabase/tests/`) covering cross-student isolation.

> **Never put the service-role key in a browser-visible variable.** It must
> stay in Supabase Edge Function secrets or a server-side environment only.

## Cloudflare Worker

The source includes `wrangler.jsonc`. Set its Worker name to a name in your
own account, then:

```bash
npm run verify        # check + test + build
npx wrangler deploy
```

`dist/server/index.js` is the generated entry point. This repository does not
contain your Cloudflare credentials, and no Cloudflare deployment was performed
during the source export.

## Static frontend

`dist/client/` contains the standalone browser assets. Serve from the root of a
domain. Root-relative URLs mean a subdirectory deployment (e.g. a default GitHub
Pages path) requires base-path changes.

Static hosting supports notes, planner, quizzes, revision, browser workers,
local AI, SQL sandbox, Python/JS lab, and digital logic simulator. It does
**not** implement `/api/compile`; compiled languages (C, C++, Java) route to the
Compiler Explorer API and need the backend on the same origin for custom
configurations. Do not label a static-only deployment as a full Smart Lab.

## Academic onboarding

The 21-branch curriculum catalog is bundled as a static JS module
(`src/content/curriculum/`). No external database call is needed to resolve
branch/semester mappings. Students set their branch and semester in the Settings
dialog. The resolution result is stored in `localStorage` and preserved across
backup restores.

The following items require manual confirmation and cannot be resolved
automatically:

- **RIT Roorkee `CSE++`**: the `CSE++` alias does not map to any official
  university branch code. The app discloses this and prevents automatic
  mapping. Contact your department for your official branch code.
- **CIA 1 exam scope**: unit coverage for CIA 1 is not yet configured in the
  curriculum catalog. The app falls back to full-syllabus mode and discloses
  this clearly.
- **College-specific elective selections**: which elective a college actually
  runs is a local decision not encoded in the catalog.

## Progress migration

Browser storage belongs to its origin. To move between origins, export progress
from the old origin and import it through the new site's Settings dialog.

Academic profile (branch, semester, exam scope) is preserved across imports;
it is stored separately from quiz and plan progress and is not overwritten by
a restore.

## CI

`.github/workflows/ci.yml` runs `npm run verify` (`check + test + build`) on
every push. A GitHub Actions pass does not mean the app is deployed; deployment
requires a separate authorized workflow step.
