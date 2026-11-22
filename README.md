# Study Sprint

A preparation workspace for college students. Choose a course pack and your
subjects, build a realistic study plan, work through topic notes and worked
questions, practise with quizzes, revise what is weak, and keep a coding lab
beside it. Progress can stay in the browser as a guest, or follow you between
devices in your own account.

No framework, no runtime npm dependencies: the client is dependency-free ES
modules and the server is a small HTTP Worker.

## Run locally

Use **Node.js 22 or newer**.

```bash
git clone https://github.com/tiwariraman884/studySprint.git
cd studySprint
npm ci
npm run dev
```

Open **http://127.0.0.1:3000**. Guest mode works with no configuration at all.
Cloud accounts are optional and need the two public values described in
[Setup](docs/SETUP.md).

| Command | What it does |
| --- | --- |
| `npm run dev` | Local server with module reload. `-- --port 4000` to change the port |
| `npm test` | Unit and architecture tests (65 today) |
| `npm run test:pg` | Migrations, pack seed and the ownership suite against real PostgreSQL |
| `npm run test:smoke` | Boots the Worker and walks the whole module graph with no configuration |
| `npm run check` | Syntax and asset checks |
| `npm run build` | `dist/client` and `dist/server`, refusing to emit a server secret |
| `npm run verify` | check + tests + smoke + build |
| `npm run seed:packs` | Regenerate `supabase/seed/10-course-packs.json` from the authored content |
| `npm run check:sdk` | Confirm the pinned Supabase SDK build still matches its integrity hash |

## What a student can do

1. **Try it as a guest.** Everything works; progress is stored in this browser.
2. **Create an account and sign in** (when the deployment is configured), with
   email confirmation, password recovery, session restoration and sign out.
3. **Set up a profile**: display name, college, programme, branch, semester and
   explanation language (English or Hinglish). Everything except the name is
   optional and editable later.
4. **Choose a course pack and subjects.** The first pack is the six-subject
   collection the project started with. A student can select a subset and change
   it later without losing saved progress.
5. **Generate a plan** of 1–60 days at 1–12 hours a day. Impossible schedules
   are reported as remaining workload instead of silently overflowing each day.
6. **Study, practise and track** topic status, revision, notes, long-answer
   drafts, code drafts and quiz attempts — each kept separate, so checking off a
   study session never claims mastery.
7. **Continue on another device** by signing in.

## Three different completion measures

These are deliberately not the same number, and the interface does not pretend
they are:

| Measure | What it is | Current state |
| --- | --- | --- |
| Study pack | Authored learning content: units, topic guides, worked questions, MCQs, long answers | 1 pack, 6 subjects, 36 units, **104 topics**, 140 short questions, 60 long answers, 176 MCQs |
| Curriculum map | A semester-wise subject mapping researched from official sources, used to help a student choose subjects | **21 branches**, 558 subject rows, with explicit review flags where a source is missing |
| Unit-level content | Authored notes for every unit of every mapped subject | **Not complete.** The study pack covers its six subjects only. A mapped subject without a pack has no notes yet, and the UI says so |

## Current boundaries

- The coding lab runs Python and JavaScript in a sandboxed worker on the device,
  and C++17 through a bounded server proxy to Compiler Explorer. Capacity is that
  of those services, not of this application.
- The optional on-device AI assistant downloads a small model; it is
  experimental and can be wrong, including when debugging. Syllabus search and
  error hints work without it.
- Sign-in, cloud sync and guest import require a Supabase project. Without the
  public configuration the app says so plainly and stays fully usable as a guest.
- This milestone is the **multi-student foundation**, not the whole Study Sprint
  plan. Payments, social features, faculty analytics, a contributor CMS, AI
  syllabus upload and a new remote code service are intentionally out of scope.

## Documentation

| Document | Contents |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | Layers, boundaries, application composition |
| [Setup](docs/SETUP.md) | Fresh clone to running app, and what each environment variable does |
| [Authentication](docs/AUTHENTICATION.md) | Sign-up, confirmation, recovery, redirect URLs, email delivery |
| [Database](docs/DATABASE.md) | Tables, row-level security, ownership and concurrency |
| [Course packs](docs/COURSE-PACKS.md) | Pack format, seeding, versioning and import |
| [Sync and migration](docs/SYNC-AND-MIGRATION.md) | Guest data, import preview, offline queue, conflict strategy |
| [Content](docs/CONTENT.md) | Editing content, the curriculum map, review flags |
| [Deployment](docs/DEPLOYMENT.md) | Building and hosting, environment variables |
| [Verification](docs/VERIFICATION.md) | Every check, what it proves, and what remains unverified |
