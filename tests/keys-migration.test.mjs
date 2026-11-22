import test from "node:test";
import assert from "node:assert/strict";
import {
  makeKey,
  parseKey,
  isLegacyId,
  resolveKeys,
  groupKeysByPack,
} from "../src/client/core/keys.js";
import { CIA2_PACK } from "../src/content/packs/index.js";
import {
  legacyKeyMap,
  upgradeGuestState,
  runGuestMigration,
  planImport,
  chooseImportWinner,
  LEGACY_STORAGE_KEY,
  MIGRATION_VERSION,
} from "../src/client/core/migration.js";

const memoryStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    keys: () => [...map.keys()],
    dump: () => Object.fromEntries(map),
  };
};

test("keys are namespaced, unambiguous and independent of content version", () => {
  assert.equal(makeKey("cia-2-2025-26", "de", "de1"), "cia-2-2025-26:de:de1");
  assert.equal(makeKey("btech-cse-2027", "os", "scheduling"), "btech-cse-2027:os:scheduling");
  assert.deepEqual(parseKey("cia-2-2025-26:de:de1"), {
    namespace: "cia-2-2025-26",
    subject: "de",
    topic: "de1",
    key: "cia-2-2025-26:de:de1",
  });
  assert.equal(parseKey("cia-2-2025-26:de"), null);
  assert.equal(isLegacyId("de1"), true);
  assert.equal(isLegacyId("cia-2-2025-26:de:de1"), false);
  assert.throws(() => makeKey("x", "y", "z"), /invalid key/);
  // The namespace is a curriculum namespace, not an exam or a version.
  assert.equal(parseKey("cia-2-2025-26:de:de1").namespace, "cia-2-2025-26");
});

test("resolution reports unknown and ambiguous keys instead of dropping them", () => {
  const pack = {
    subjects: [
      {
        topics: [
          { id: "p:a:one", rawId: "one" },
          { id: "p:b:dup", rawId: "shared" },
        ],
      },
      { topics: [{ id: "p:c:dup", rawId: "shared" }] },
    ],
  };
  const result = resolveKeys(["p:a:one", "p:a:missing", "shared", "p:z:other"], pack);
  assert.deepEqual([...result.resolved.keys()], ["p:a:one"]);
  assert.deepEqual(result.unknown.sort(), ["p:a:missing", "p:z:other"]);
  assert.equal(result.ambiguous.length, 1);
  assert.equal(result.ambiguous[0].key, "shared");
  assert.deepEqual(result.ambiguous[0].candidates.sort(), ["p:b:dup", "p:c:dup"]);
});

test("the first pack resolves every authored key and no key is ambiguous", () => {
  const keys = CIA2_PACK.subjects.flatMap((s) => s.topics.map((t) => t.id));
  assert.equal(keys.length, 104);
  assert.equal(new Set(keys).size, 104);
  const { resolved, unknown, ambiguous } = resolveKeys(keys, CIA2_PACK);
  assert.equal(resolved.size, 104);
  assert.deepEqual(unknown, []);
  assert.deepEqual(ambiguous, []);
  const { groups, unresolved } = groupKeysByPack(keys, [CIA2_PACK]);
  assert.equal(groups.get(CIA2_PACK.id).keys.length, 104);
  assert.deepEqual(unresolved, []);
});

test("legacy ids map deterministically through the catalog, not string guesses", () => {
  const map = legacyKeyMap(CIA2_PACK);
  assert.equal(map.get("de1"), "cia-2-2025-26:de:de1");
  assert.equal(map.get("py10"), "cia-2-2025-26:py:py10");
  assert.equal(map.get("uhv5"), "cia-2-2025-26:uhv:uhv5");
  // Every authored id has a mapping, and every mapping is a valid key.
  const authored = CIA2_PACK.subjects.flatMap((s) => s.topics.map((t) => t.rawId));
  assert.equal(map.size, authored.length);
  for (const [raw, key] of map) assert.ok(parseKey(key), `${raw} -> ${key}`);
});

test("legacy guest state upgrades idempotently and keeps unmapped ids", () => {
  const raw = {
    version: 1,
    start: "2026-11-14",
    status: { de1: "done", de2: "weak", mystery: "done" },
    notes: { de1: "my note" },
    reviews: { de2: 1700000000000 },
    missed: ["de3", "ghost"],
    lastTopic: "cpp1",
    quiz: { ids: ["de1", "py2", "unknown-q"], subject: "de", answers: [{ id: "de1", correct: true }] },
    longDrafts: { "la-alg-a": "draft text" },
    customPlan: {
      days: [{ day: 1, blocks: [{ id: "b1", topics: ["de1", "py1"] }] }],
      backlog: ["alg3"],
    },
    chat: [{ role: "assistant", text: "hi", contextTopicId: "de1", sources: ["de1", "nope"] }],
  };
  const first = upgradeGuestState(raw, CIA2_PACK, { now: 1760000000000 });
  assert.equal(first.state.status["cia-2-2025-26:de:de1"], "done");
  assert.equal(first.state.status["cia-2-2025-26:de:de2"], "weak");
  assert.equal(first.state.notes["cia-2-2025-26:de:de1"], "my note");
  assert.equal(first.state.reviews["cia-2-2025-26:de:de2"], 1700000000000);
  assert.deepEqual(first.state.missed, ["cia-2-2025-26:de:de3"]);
  assert.equal(first.state.lastTopic, "cia-2-2025-26:cpp:cpp1");
  assert.deepEqual(first.state.quiz.ids, ["cia-2-2025-26:de:de1", "cia-2-2025-26:py:py2"]);
  assert.equal(first.state.quiz.subject, "cia-2-2025-26:de");
  assert.equal(first.state.quiz.answers[0].id, "cia-2-2025-26:de:de1");
  assert.equal(first.state.customPlan.days[0].blocks[0].topics[0], "cia-2-2025-26:de:de1");
  assert.equal(first.state.chat[0].sources.length, 1);
  assert.deepEqual(first.state.unmapped.sort(), [
    "chat:nope",
    "missed:ghost",
    "mystery",
    "quiz:unknown-q",
  ]);
  assert.equal(first.state.migration.version, MIGRATION_VERSION);

  const second = upgradeGuestState(first.state, CIA2_PACK);
  assert.equal(JSON.stringify(second.state), JSON.stringify(first.state), "upgrade is idempotent");
});

test("guest migration keeps the original key, writes one backup and a marker", () => {
  const storage = memoryStorage({
    [LEGACY_STORAGE_KEY]: JSON.stringify({ version: 1, status: { de1: "done" }, notes: { de1: "n" } }),
  });
  const result = runGuestMigration(storage, CIA2_PACK, { validate: () => true });
  assert.equal(result.ran, true);
  const dump = storage.dump();
  assert.match(result.backupKey, /study-sprint:migration-backup:/);
  const backup = JSON.parse(dump[result.backupKey]);
  assert.deepEqual(backup.raw.status, { de1: "done" }, "backup holds the untouched original");
  assert.ok(dump[LEGACY_STORAGE_KEY].includes("cia-2-2025-26:de:de1"));
  assert.ok(dump["study-sprint:migrated"]);
  const again = runGuestMigration(storage, CIA2_PACK, { validate: () => true });
  assert.equal(again.ran, false);
  assert.equal(again.reason, "already-migrated");
});

test("a failed validation leaves the guest state untouched", () => {
  const previous = JSON.stringify({ version: 1, status: { de1: "done" } });
  const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: previous });
  const result = runGuestMigration(storage, CIA2_PACK, { validate: () => false });
  assert.equal(result.ran, false);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), previous);
  assert.equal(storage.getItem("study-sprint:migrated"), null);
});

test("legacy ids resolve deterministically from the same state", () => {
  const a = upgradeGuestState({ status: { de1: "learning" } }, CIA2_PACK);
  const b = upgradeGuestState({ status: { de1: "learning" } }, CIA2_PACK);
  assert.deepEqual(a.state.status, b.state.status);
});

test("import preview separates independent, overlapping and verified data", () => {
  const guest = {
    status: { "cia-2-2025-26:de:de1": "done", "cia-2-2025-26:de:de2": "weak" },
    notes: { "cia-2-2025-26:de:de1": "guest note" },
    reviews: {},
    completedAt: { "cia-2-2025-26:de:de1": 100, "cia-2-2025-26:de:de2": 200 },
  };
  const preview = planImport(guest, { topicKeys: ["cia-2-2025-26:de:de1"] }, CIA2_PACK);
  assert.equal(preview.total, 2);
  assert.equal(preview.overlapping, 1);
  assert.equal(preview.independent, 1);
  assert.deepEqual(preview.skipped, []);
  for (const record of preview.records) {
    assert.equal(record.verified, false, "imported progress is self-reported");
    assert.equal(record.source, "guest");
  }
  // Keys the pack cannot resolve are reported, never imported.
  const unknown = planImport({ status: { "not-a-pack:xx:topic": "done" } }, { topicKeys: [] }, CIA2_PACK);
  assert.equal(unknown.total, 0);
  assert.deepEqual(unknown.skipped, [{ key: "not-a-pack:xx:topic", reason: "unknown-key" }]);
  const local = { completedAt: 300 };
  const remote = { completedAt: 100 };
  assert.equal(chooseImportWinner(local, remote, "guest"), local);
  assert.equal(chooseImportWinner(local, remote, "cloud"), remote);
  assert.equal(chooseImportWinner(local, remote, "newer"), local);
});
