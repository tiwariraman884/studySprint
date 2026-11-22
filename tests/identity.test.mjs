// Regression guard for pack-qualified identity.
//
// Subjects now have a stable key ("cia-2-2025-26:de") and topics carry it in
// `topic.subject`. Legacy code compared `topic.subject === subject.id`, which
// silently matched nothing. Six such comparisons existed and were found by a
// sweep after the identity change; this test keeps them from coming back.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const featuresRoot = path.resolve(import.meta.dirname, "../src/client/features");

function jsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

test("feature modules never compare a topic's subject with a legacy subject id", () => {
  const offenders = [];
  for (const file of jsFiles(featuresRoot)) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      const rel = path.relative(featuresRoot, file).replace(/\\/g, "/");
      if (/\.subject\s*===\s*[A-Za-z_.?]*\.id\b/.test(line) && !line.includes("key")) {
        offenders.push(`${rel}:${i + 1} ${line.trim().slice(0, 110)}`);
      }
      if (/CURRICULUM\.find\(c\) => c\.id === [A-Za-z_.?]*\.id\)/.test(line)) {
        offenders.push(`${rel}:${i + 1} ${line.trim().slice(0, 110)}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `Use the stable subject key instead:\n${offenders.join("\n")}`);
});

test("subject lookups tolerate both a namespaced key and a bare id", async () => {
  const content = await import("../src/content/packs/index.js");
  const pack = content.CIA2_PACK;
  const subjects = pack.subjects.map((s) => s.subject);
  const byKey = (id) => {
    const tail = String(id).split(":").pop();
    return (
      subjects.find((x) => x.key === id) ||
      subjects.find((x) => x.id === id) ||
      subjects.find((x) => x.key.split(":").pop() === tail)
    );
  };
  assert.equal(byKey("cia-2-2025-26:de")?.name, byKey("de")?.name);
  assert.equal(byKey("de")?.key, "cia-2-2025-26:de");
});

test("every topic carries the subject key that the UI filters on", async () => {
  const { CIA2_PACK } = await import("../src/content/packs/index.js");
  for (const entry of CIA2_PACK.subjects) {
    assert.equal(entry.subject.key, `cia-2-2025-26:${entry.subject.rawId}`);
    for (const topic of entry.topics) {
      assert.equal(topic.subject, entry.subject.key, `${topic.id} should carry its subject key`);
      assert.ok(topic.id.startsWith(entry.subject.key + ":"), `${topic.id} should be namespaced under its subject`);
    }
  }
});
