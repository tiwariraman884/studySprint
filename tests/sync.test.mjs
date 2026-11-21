import test from "node:test";
import assert from "node:assert/strict";
import {
  createQueue,
  pendingEntry,
  drainQueue,
  isConflictError,
  isOfflineError,
  mergePending,
} from "../src/client/core/sync.js";
import {
  createRemoteStore,
} from "../src/client/core/remote.js";
import {
  noteRevision,
  topicProgressRevision,
  fingerprint,
} from "../src/client/core/records.js";

const memory = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    get: async (k) => (map.has(k) ? JSON.parse(JSON.stringify(map.get(k))) : null),
    set: async (k, v) => map.set(k, JSON.parse(JSON.stringify(v))),
    delete: async (k) => map.delete(k),
    dump: () => Object.fromEntries(map),
  };
};

const networkError = () => Object.assign(new Error("Failed to fetch"), { name: "TypeError" });
const staleError = () =>
  Object.assign(new Error("stale update: another device saved this note first"), { code: "40001" });

test("the queue keeps only the newest edit per record", () => {
  const first = pendingEntry({ accountKey: "u1", table: "notes", recordKey: "k", payload: { body: "a" }, at: 1 });
  const second = pendingEntry({ accountKey: "u1", table: "notes", recordKey: "k", payload: { body: "ab" }, at: 2 });
  const other = pendingEntry({ accountKey: "u1", table: "notes", recordKey: "other", payload: {}, at: 3 });
  const merged = mergePending(mergePending([], first), second);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].payload.body, "ab");
  assert.equal(mergePending(merged, other).length, 2);
});

test("pending entries are partitioned per account", async () => {
  const storage = memory();
  const a = createQueue({ accountKey: "user-a", storage });
  const b = createQueue({ accountKey: "user-b", storage });
  await a.push(pendingEntry({ accountKey: "user-a", table: "notes", recordKey: "x", payload: { body: "A only" } }));
  await b.push(pendingEntry({ accountKey: "user-b", table: "notes", recordKey: "x", payload: { body: "B only" } }));
  const aAgain = createQueue({ accountKey: "user-a", storage });
  await aAgain.flush();
  assert.equal(aAgain.size, 1);
  assert.equal(aAgain.entries[0].payload.body, "A only");
  // A queue refuses an entry belonging to somebody else.
  await a.push(pendingEntry({ accountKey: "user-b", table: "notes", recordKey: "y", payload: {} }));
  assert.equal(a.size, 1);
});

test("queued work survives a reload (durable storage)", async () => {
  const storage = memory();
  const before = createQueue({ accountKey: "u", storage });
  await before.push(pendingEntry({ accountKey: "u", table: "long_answer_drafts", recordKey: "la", payload: { body: "x" } }));
  const after = createQueue({ accountKey: "u", storage });
  await after.flush();
  assert.equal(after.size, 1);
  assert.equal(after.entries[0].recordKey, "la");
});

test("a network failure keeps edits queued; a conflict is surfaced, not retried forever", async () => {
  const storage = memory();
  const queue = createQueue({ accountKey: "u", storage });
  await queue.push(pendingEntry({ accountKey: "u", table: "notes", recordKey: "ok", payload: {}, at: 1 }));
  await queue.push(pendingEntry({ accountKey: "u", table: "notes", recordKey: "conflict", payload: {}, at: 2 }));
  await queue.push(pendingEntry({ accountKey: "u", table: "notes", recordKey: "network", payload: {}, at: 3 }));
  const attempts = [];
  const run = async (entry) => {
    attempts.push(entry.recordKey);
    if (entry.recordKey === "conflict") throw staleError();
    if (entry.recordKey === "network") throw networkError();
  };
  const result = await drainQueue(queue, run);
  assert.equal(result.saved, 1);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].entry.recordKey, "conflict");
  assert.equal(result.failed, 1);
  // The network-failed entry stays queued for the next connection.
  assert.deepEqual(queue.entries.map((e) => e.recordKey), ["network"]);
  // Reconnecting drains it.
  await drainQueue(queue, async () => { });
  assert.equal(queue.size, 0);
});

test("error classification distinguishes stale writes from connectivity loss", () => {
  assert.equal(isConflictError(staleError()), true);
  assert.equal(isConflictError(Object.assign(new Error("stale_settings"), { code: "P0001" })), true);
  assert.equal(isConflictError(new Error("permission denied")), false);
  assert.equal(isOfflineError(networkError()), true);
  assert.equal(isOfflineError(new Error("Request failed")), false);
});

test("the remote store sends the revision it loaded and reports a stale write", async () => {
  const calls = [];
  const row = { user_id: "u", topic_key: "cia-2-2025-26:de:de1", status: "learning", notes_summary: "", excluded: false, completed_at: null };
  const client = {
    from(table) {
      const builder = {
        select() {
          calls.push({ table, op: "select" });
          return builder;
        },
        eq() {
          return builder;
        },
        then(resolve) {
          const data = table === "topic_progress" ? [row] : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
        upsert(payload) {
          calls.push({ table, op: "upsert", payload });
          const conflict = payload.status === "weak" ? { message: "stale update", code: "40001" } : null;
          return { select: async () => ({ data: conflict ? null : [{ ...row, ...payload }], error: conflict }) };
        },
      };
      return builder;
    },
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      if (name === "topic_ids_for_keys") {
        return {
          data: args.p_keys
            .filter((k) => k === "cia-2-2025-26:de:de1")
            .map((k) => ({ key: k, id: "11111111-1111-1111-1111-111111111111", ambiguous: false })),
          error: null,
        };
      }
      return { data: [{ revision: "deadbeef" }], error: null };
    },
  };
  const store = createRemoteStore({ client, userId: "u", packId: "cia-2-2025-26" });
  const loaded = await store.loadAll();
  assert.equal(loaded.progress.length, 1);
  assert.equal(store.revisionFor("topic_progress", "cia-2-2025-26:de:de1"), topicProgressRevision(row));
  assert.equal(noteRevision({ body: "abc" }), fingerprint(JSON.stringify({ body: "abc" })));

  const saved = await store.saveProgress({ topicKey: "cia-2-2025-26:de:de1", status: "done" });
  assert.equal(saved.status, "done");

  await assert.rejects(
    () => store.saveProgress({ topicKey: "cia-2-2025-26:de:de1", status: "weak" }),
    (error) => error.code === "40001",
  );

  const keys = await store.resolveKeys(["cia-2-2025-26:de:de1", "cia-2-2025-26:de:nope"]);
  assert.equal(keys.resolved.size, 1);
  assert.deepEqual(keys.unknown, ["cia-2-2025-26:de:nope"]);
  const settings = await store.saveSettings({ theme: "dark" }, "v1");
  assert.equal(settings.revision, "deadbeef");
  assert.ok(calls.some((c) => c.rpc === "save_student_settings"));
});

test("debounced scheduling collapses rapid typing into one drain", async () => {
  const storage = memory();
  const queue = createQueue({ accountKey: "u", storage });
  let drains = 0;
  for (let i = 0; i < 5; i++) {
    await queue.push(pendingEntry({ accountKey: "u", table: "notes", recordKey: "k", payload: { body: `v${i}` } }));
    queue.schedule(() => {
      drains++;
    }, 30);
  }
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(drains, 1);
  assert.equal(queue.size, 1);
  assert.equal(queue.entries[0].payload.body, "v4");
});
