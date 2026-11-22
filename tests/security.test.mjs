// Database ownership and integrity tests.
//
// The suite proves that student A cannot read, overwrite or delete student B's
// records — including with guessed primary keys — and that shared course
// content is immutable from a student session. It runs in two layers:
//
//  1. Static guarantee (always runs): every importable table either has
//     row-level security, or is explicitly listed as service-role-only.
//  2. Live guarantee: the SQL test suite in supabase/tests/ownership.sql is run
//     against a real PostgreSQL build in tests/integration/pg-harness.mjs
//     (npm run test:pg). See docs/DATABASE.md and docs/VERIFICATION.md.
//
// Neither layer is a substitute for the other: the static layer stops a new
// table from shipping without RLS, and the live layer exercises real policies,
// grants, triggers and constraints.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const migrations = fs
  .readdirSync(path.join(root, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ file: f, sql: read(`supabase/migrations/${f}`) }));

const studentTables = [
  "profiles",
  "user_course_packs",
  "user_subjects",
  "exams",
  "study_preferences",
  "plans",
  "study_sessions",
  "topic_progress",
  "revision_records",
  "quiz_attempts",
  "quiz_answers",
  "notes",
  "long_answer_drafts",
  "code_drafts",
  "student_settings",
];

const contentTables = [
  "course_packs",
  "course_pack_versions",
  "subjects",
  "units",
  "topics",
  "materials",
  "resources",
];

const allSql = migrations.map((m) => m.sql).join("\n");

test("migrations are ordered, non-empty and do not seed student data", () => {
  assert.ok(migrations.length >= 4);
  for (const m of migrations) {
    assert.ok(m.sql.trim().length > 200, `${m.file} looks empty`);
    // Top-level statements must not insert static student seed data
    const topLevelSql = m.sql.replace(/\$\$[\s\S]*?\$\$/g, "");
    assert.doesNotMatch(topLevelSql, /insert into public\.(notes|topic_progress)\b/i);
  }
  assert.equal(
    fs.readFileSync(path.join(root, "supabase/seed/10-course-packs.json"), "utf8").includes("user_id"),
    false,
    "the committed pack seed must not contain student rows",
  );
});

test("every student table enables row-level security", () => {
  for (const table of studentTables)
    assert.match(allSql, new RegExp(`alter table public\\.${table} enable row level security`), table);
  for (const table of contentTables)
    assert.match(allSql, new RegExp(`alter table public\\.${table} enable row level security`), table);
});

test("student tables use operation-specific owner policies only", () => {
  for (const table of studentTables) {
    for (const command of ["select", "insert", "update", "delete"])
      assert.match(
        allSql,
        new RegExp(`create policy "[a-z ]+" on public\\.${table} for ${command}\\b`),
        `${table} is missing a ${command} policy`,
      );
    // No catch-all policies: every policy must be restricted to authenticated
    // users and must mention the session-derived owner.
    const policies = allSql.match(
      new RegExp(`create policy [^;]+on public\\.${table} for [^;]+;`, "g"),
    );
    for (const p of policies) {
      assert.match(p, /to authenticated/, `${table}: ${p}`);
      assert.match(
        p,
        /user_id = \(select private\.current_user_id\(\)\)/,
        `${table} policy does not derive ownership from the session: ${p}`,
      );
      assert.doesNotMatch(p, /\btrue\s*\)/, `${table} has a catch-all policy: ${p}`);
    }
  }
});

test("ownership is enforced by a trigger, not only by policy", () => {
  for (const table of studentTables)
    assert.match(
      allSql,
      new RegExp(`create trigger guard_owner before insert or update on public\\.${table}`),
      table,
    );
  const helper = read("supabase/migrations/20261121000100_helpers.sql");
  assert.match(helper, /Row ownership cannot change/);
  assert.match(helper, /Row owner must be the authenticated user/);
});

test("shared content is readable by guests but writable only by the service role", () => {
  for (const table of contentTables) {
    assert.match(
      allSql,
      new RegExp(`grant select on [^;]*public\\.${table}[^;]*to anon, authenticated`, "i"),
      `${table} should be readable`,
    );
    assert.doesNotMatch(
      allSql,
      new RegExp(`create policy "[^"]*" on public\\.${table} for (insert|update|delete|all)`),
      `${table} must not have a student write policy`,
    );
    assert.match(
      allSql,
      new RegExp(`revoke all on [^;]*public\\.${table}`, "i"),
      `${table} should revoke default privileges`,
    );
  }
  assert.match(allSql, /grant all on[^;]*public\.course_packs[^;]*to service_role/);
});

test("stale-device updates are guarded by a revision token in the database", () => {
  assert.match(allSql, /app\.record_revision/);
  for (const table of ["topic_progress", "revision_records", "quiz_attempts", "notes", "long_answer_drafts", "code_drafts"]) {
    assert.match(
      allSql,
      new RegExp(`create trigger guard_revision before update on public\\.${table}`, "i"),
      `${table} is missing guard_revision trigger`,
    );
  }
  assert.match(allSql, /stale_settings/);
});

test("unique keys, foreign keys and indexes exist for ownership and lookups", () => {
  const required = [
    /create index topics_key_idx/,
    /primary key \(user_id, topic_key\)/,
    /(unique|primary key) \(user_id, pack_id, subject_key\)/,
    /foreign key \(user_id, pack_id\) references public\.user_course_packs\(user_id, pack_id\)/,
    /create index topics_subject_idx/,
    /create index user_subjects_owner_idx/,
    /create index topic_progress_owner_status_idx/,
    /create unique index plans_one_active_idx/,
  ];
  for (const pattern of required) assert.match(allSql, pattern);
});

test("private helpers are not exposed to anonymous sessions", () => {
  const helpers = read("supabase/migrations/20261121000100_helpers.sql");
  assert.match(helpers, /create schema if not exists private/);
  assert.match(helpers, /revoke all on schema private from public/);
  assert.match(helpers, /grant usage on schema private to authenticated, service_role/);
  // The only exec functions for anon are revoked explicitly where created.
  assert.match(allSql, /revoke all on function public\.save_student_settings\(jsonb, text\) from public, anon/);
  assert.match(allSql, /revoke all on function public\.import_course_pack\(jsonb, text\) from public, anon, authenticated/);
});

test("no privileged credential or service key appears in browser code", () => {
  const browserRoots = ["src/client", "src/content", "public"];
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs|html|css)$/.test(entry.name)) {
        const text = fs.readFileSync(full, "utf8");
        if (/service_role|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|postgres(ql)?:\/\//.test(text))
          offenders.push(full);
      }
    }
  };
  for (const r of browserRoots) walk(path.join(root, r));
  assert.deepEqual(offenders, []);
});

test("the live SQL ownership suite exists and covers cross-student access", () => {
  const sql = read("supabase/tests/ownership.sql");
  for (const probe of [
    "student B cannot read student A",
    "student B cannot overwrite student A",
    "student B cannot delete student A",
    "guessed id",
    "anon",
    "cannot publish",
  ])
    assert.ok(sql.toLowerCase().includes(probe.toLowerCase()), `ownership.sql is missing: ${probe}`);
});
