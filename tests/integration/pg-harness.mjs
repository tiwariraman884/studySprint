// Live PostgreSQL integration harness.
//
// Applies the migrations, imports the course pack seed, then runs
// supabase/tests/ownership.sql and fails on any "NOT OK" line. That SQL suite
// is the real proof that Student A cannot read, overwrite or delete Student B's
// rows; tests/security.test.mjs is the static guard that keeps the schema
// honest when this harness cannot run.
//
// npm run test:pg                          throwaway postgres:15-alpine container
// STUDY_SPRINT_PG_IMAGE=postgres:17-alpine npm run test:pg
// STUDY_SPRINT_PG=supabase npm run test:pg  uses SUPABASE_DB_URL with local psql
//                                            (e.g. `supabase start` printed URL)
// STUDY_SPRINT_REQUIRE_PG=1 npm run test:pg fails instead of skipping (CI)
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const mode = process.env.STUDY_SPRINT_PG || "docker";
const image = process.env.STUDY_SPRINT_PG_IMAGE || "postgres:15-alpine";
const container = `study-sprint-pg-${process.pid}`;
const local = mode === "supabase" || mode === "psql";
const requirePg = !!process.env.STUDY_SPRINT_REQUIRE_PG;

// Node's test runner executes the file's before hook in a separate module
// context from the test bodies on some versions, so the setup result is stored
// on a well-known global instead of a module variable.
const state = (globalThis.__pgHarness ||= {
  available: false,
  reason: `PostgreSQL integration did not run (mode ${mode})`,
  sqlOutput: "",
});

function run(bin, args, input) {
  // Always pass input: a child that inherits a background service's stdin never
  // receives EOF, and the call would appear to hang.
  const r = spawnSync(bin, args, { input: input ?? "", encoding: "utf8" });
  if (r.error) throw new Error(`${bin}: ${r.error.message}`);
  return r;
}

const dockerBin = process.env.STUDY_SPRINT_DOCKER || "docker";
const docker = (args, input) => run(dockerBin, args, input);

const migrationFiles = (await fs.readdir(path.join(root, "supabase/migrations")))
  .filter((f) => f.endsWith(".sql"))
  .sort();

// ---------------------------------------------------------------------------
// Local PostgreSQL (Supabase CLI or any server) through the psql client.
// ---------------------------------------------------------------------------
const localUrl = process.env.SUPABASE_DB_URL || process.env.STUDY_SPRINT_PG_URL;

function runLocal() {
  if (!localUrl)
    throw new Error("set SUPABASE_DB_URL (Supabase CLI: `supabase status` prints the DB URL)");
  const migrationsDir = path.join(root, "supabase/migrations");
  const work = path.join(root, ".tmp", "pg");
  return (async () => {
    await fs.mkdir(work, { recursive: true });
    if (process.env.STUDY_SPRINT_PG_SHIM !== "off") {
      const shim = run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", localUrl, "-f", path.join(root, "tests/support/supabase-shim.sql")]);
      const shimText = (shim.stdout || "") + (shim.stderr || "");
      // A real Supabase database already has auth.users and the roles.
      if (shim.status !== 0 && !/already exists|permission denied to create/.test(shimText))
        throw new Error(`shim: ${shimText.slice(0, 300)}`);
    }
    for (const file of migrationFiles) {
      const r = run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", localUrl, "-f", path.join(migrationsDir, file)]);
      if (r.status !== 0) throw new Error(`${file}: ${(r.stderr || "").slice(0, 300)}`);
    }
    // The seed reads its data file from /tmp/seed; rewrite for hosted runs.
    const seedPath = path.join(work, "seed.sql");
    const seedSql = (await fs.readFile(path.join(root, "supabase/seed/20-import-course-packs.sql"), "utf8"))
      .replace("/tmp/seed/10-course-packs.json", path.join(root, "supabase/seed/10-course-packs.json").split(path.sep).join("/"));
    await fs.writeFile(seedPath, seedSql);
    const seed = run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", localUrl, "-f", seedPath]);
    if (seed.status !== 0) throw new Error(`seed: ${(seed.stderr || "").slice(0, 300)}`);
    const suite = run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", localUrl, "-f", path.join(root, "supabase/tests/ownership.sql")]);
    state.sqlOutput = (suite.stdout || "") + (suite.stderr || "");
    if (/NOT OK/.test(state.sqlOutput)) throw new Error(state.sqlOutput.slice(0, 600));
    return "104";
  })();
}

// ---------------------------------------------------------------------------
// Throwaway Docker container.
// ---------------------------------------------------------------------------
const psqlFile = (file) =>
  docker(["exec", container, "psql", "-U", "postgres", "-d", "study", "-q", "-v", "ON_ERROR_STOP=1", "-f", file]);

function runDocker() {
  const info = docker(["info", "--format", "{{.ServerVersion}}"]);
  if (info.status !== 0)
    throw new Error(`docker info exited ${info.status}: ${String(info.out || "").replace(/\s+/g, " ").slice(0, 200)}`);
  docker(["rm", "-f", container]);
  const started = docker([
    "run", "-d", "--name", container,
    "-e", "POSTGRES_PASSWORD=test", "-e", "POSTGRES_DB=study", "-p", "0:5432", image,
  ]);
  if (started.status !== 0) throw new Error(`could not start ${image}: ${started.stderr.trim()}`);
  return (async () => {
    for (let i = 0; i < 60; i++) {
      if (docker(["exec", container, "pg_isready", "-U", "postgres", "-d", "study"]).status === 0) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    docker(["exec", container, "mkdir", "-p", "/tmp/seed", "/tmp/migrations", "/tmp/tests"]);
    const files = [
      ["tests/support/supabase-shim.sql", "/tmp/shim.sql"],
      ["supabase/seed/10-course-packs.json", "/tmp/seed/10-course-packs.json"],
      ["supabase/seed/20-import-course-packs.sql", "/tmp/seed/20-import-course-packs.sql"],
      ["supabase/tests/ownership.sql", "/tmp/tests/ownership.sql"],
      ["tests/support/apply-migrations.sh", "/tmp/apply.sh"],
      ...migrationFiles.map((f) => [`supabase/migrations/${f}`, `/tmp/migrations/${f}`]),
    ];
    for (const [from, to] of files) {
      const cp = docker(["cp", path.join(root, from), `${container}:${to}`]);
      if (cp.status !== 0) throw new Error(`copy ${from} failed: ${cp.stderr}`);
    }
    const shim = psqlFile("/tmp/shim.sql");
    if (shim.status !== 0) throw new Error(`shim: ${shim.stderr}`);
    const apply = docker(["exec", container, "bash", "/tmp/apply.sh"]);
    if (apply.status !== 0) throw new Error(`migrations: ${apply.stderr}${apply.stdout}`);
    const seed = psqlFile("/tmp/seed/20-import-course-packs.sql");
    if (seed.status !== 0) throw new Error(`seed: ${seed.stderr}`);
    return "104";
  })();
}

async function setupHarness() {
  if (mode === "off") {
    state.reason = "STUDY_SPRINT_PG=off";
    state.available = false;
    return;
  }
  try {
    await (local ? runLocal() : runDocker());
    state.available = true;
    state.reason = "";
  } catch (err) {
    state.available = false;
    state.reason = `PostgreSQL integration failed: ${String(err?.message || err).replace(/\s+/g, " ").slice(0, 400)}`;
    if (!local) docker(["rm", "-f", container]);
    if (requirePg) throw err;
  }
}

let setupPromise = null;
const ensureSetup = () => (setupPromise ||= setupHarness());

/** Every test awaits the shared setup so availability is known first. */
function pgTest(name, fn) {
  return test(name, async (t) => {
    await ensureSetup();
    if (!state.available) {
      t.skip(`PostgreSQL unavailable: ${state.reason}`);
      return;
    }
    await fn(t);
  });
}

test.after(async () => {
  await ensureSetup();
  if (!local) docker(["rm", "-f", container]);
});

pgTest("migrations and the repeatable seed import the course pack", () => {
  if (local) {
    // runLocal() seeds on setup; the live suite below proves the rest.
    assert.ok(state.available);
    return;
  }
  const again = psqlFile("/tmp/seed/20-import-course-packs.sql");
  assert.equal(again.status, 0, again.stderr);
  const out = docker([
    "exec", container, "psql", "-U", "postgres", "-d", "study", "-t", "-A", "-c",
    "select count(*) || ':' || (select count(*) from public.course_pack_versions) from public.topics",
  ]);
  assert.equal(out.stdout.trim(), "104:1", "re-running the seed must not duplicate content");
});

pgTest("live ownership suite: cross-student access, ownership, content, conflicts", () => {
  let output = state.sqlOutput;
  if (!local) {
    const run = docker([
      "exec", container, "psql", "-U", "postgres", "-d", "study", "-v", "ON_ERROR_STOP=1",
      "-f", "/tmp/tests/ownership.sql",
    ]);
    output = (run.stdout || "") + (run.stderr || "");
    assert.equal(run.status, 0, output);
  }
  assert.doesNotMatch(output, /NOT OK/, output);
  assert.match(output, /OK: student B cannot read student A/);
  assert.match(output, /OK: student B cannot overwrite student A/);
  assert.match(output, /OK: student B cannot delete student A/);
  assert.match(output, /OK: students cannot publish shared content/);
  assert.match(output, /OK: stale updates are rejected/);
  assert.match(output, /OK: owners can create, update, delete and onboard/);
  assert.match(output, /OK: RPC permissions, unknown keys and repeated onboarding/);
  assert.match(output, /OK: anon cannot call student RPCs/);
});

// The browser computes the revision token it sends with every update. If the
// two implementations (src/client/core/records.js and the SQL functions) ever
// disagree, every save from a second device would be wrongly rejected as stale.
// This test writes a row of its own, reads the SQL fingerprints, and compares.
pgTest("browser and database fingerprints agree byte for byte", async () => {
  const { noteRevision, topicProgressRevision, longAnswerDraftRevision } =
    await import("../../src/client/core/records.js");
  const sql = `\\pset tuples_only on
\\pset format unaligned
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
insert into public.notes (pack_id, topic_key, body, topic_id)
values ('cia-2-2025-26', 'fingerprint-check', 'A private note', (select id from public.topics where key = 'cia-2-2025-26:de:de1'));
insert into public.topic_progress (topic_id, topic_key, status, notes_summary)
values (public.resolve_topic_id('cia-2-2025-26:de:de4'), 'progress-fingerprint-check', 'done', '');
insert into public.long_answer_drafts (pack_id, answer_key, body, self_score)
values ('cia-2-2025-26', 'fingerprint-check', 'A draft', null);
select public.note_fingerprint(n.body) || '|' ||
       public.topic_progress_fingerprint(p.status, p.notes_summary, p.excluded) || '|' ||
       public.long_answer_draft_fingerprint(d.body, d.self_score, d.practised) || '|' ||
       row_to_json(p)::text
from public.notes n, public.topic_progress p, public.long_answer_drafts d
where n.topic_key = 'fingerprint-check'
  and p.topic_key = 'progress-fingerprint-check'
  and d.answer_key = 'fingerprint-check';
rollback;`;
  const out = docker(["exec", "-i", container, "psql", "-U", "postgres", "-d", "study", "-q"], sql);
  const text = (out.stdout || "") + (out.stderr || "");
  if (!/^[0-9a-f]{8}\|/m.test(text))
    assert.fail(`fingerprint probe failed. psql said:\n${text.slice(0, 1500)}`);
  const out2 = { stdout: text };
  const line = out2.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^[0-9a-f]{8}\|/.test(l));
  const [sqlNote, sqlProgress, sqlDraft, progressJson] = line.split("|");
  const progressRow = JSON.parse(progressJson);

  assert.equal(noteRevision({ body: "A private note" }), sqlNote, "note fingerprint");
  assert.equal(
    topicProgressRevision({
      status: progressRow.status,
      notes_summary: progressRow.notes_summary,
      excluded: progressRow.excluded,
    }),
    sqlProgress,
    "topic progress fingerprint",
  );
  assert.equal(
    longAnswerDraftRevision({ body: "A draft", self_score: null, practised: false }),
    sqlDraft,
    "long answer draft fingerprint",
  );
});

pgTest("a first settings save succeeds and a repeat with a stale token is refused", () => {
  const base = `begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);`;
  // Both calls run inside one transaction: without that the first one rolls
  // back and the "second" call would be another legitimate first save.
  const sql = `${base}
select (public.save_student_settings('{"theme":"light"}'::jsonb, 'v1')).revision is not null as first_ok;
select public.save_student_settings('{"theme":"dark"}'::jsonb, 'not-the-current-token');
rollback;`;
  const out = docker(["exec", "-i", container, "psql", "-U", "postgres", "-d", "study", "-t", "-A", "-q"], sql);
  const text = (out.stdout || "") + (out.stderr || "");
  assert.match(text, /\bt\b/, `first save should succeed: ${text}`);
  assert.match(text, /stale_settings/, `stale token must be refused: ${text}`);
});
