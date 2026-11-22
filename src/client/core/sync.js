// Sync queue and status machine.
//
// Responsibilities kept deliberately narrow and testable:
//   * queue pending writes per account, in memory, with a durable copy in
//     IndexedDB when the browser provides it;
//   * debounce frequent saves (drafts are typed into constantly);
//   * report honest states: saving, saved, offline, failed, conflict;
//   * keep one account's pending work away from another account's session.
//
// The actual transport is injected, so tests can simulate latency, failures,
// stale revisions and a connection drop without a browser.

export const SYNC_STATES = Object.freeze({
  idle: "idle",
  saving: "saving",
  saved: "saved",
  offline: "offline",
  failed: "failed",
  conflict: "conflict",
});

export const STATE_LABELS = Object.freeze({
  idle: "Not yet saved",
  saving: "Saving…",
  saved: "Saved",
  offline: "Offline — changes kept on this device",
  failed: "Sync failed — retry",
  conflict: "Conflicted — choose which version to keep",
});

/**
 * Detect whether a change should overwrite the queued value for the same
 * record or be appended. Last write wins per record: the newest typed text is
 * what the student sees, and the earlier draft never resurrects afterwards.
 */
export function mergePending(entries, next) {
  const rest = entries.filter((e) => !(e.accountKey === next.accountKey && e.table === next.table && e.recordKey === next.recordKey));
  return [...rest, next];
}

/** A single serialisable pending entry. */
export function pendingEntry({ accountKey, table, recordKey, op = "upsert", payload, id, baseRevision = null, at = Date.now() }) {
  if (!accountKey) throw new Error("pending entries must belong to an account");
  if (!table || !recordKey) throw new Error("pending entries need a table and record key");
  return {
    id: id || `${table}:${recordKey}:${at}`,
    accountKey,
    table,
    recordKey,
    op,
    payload,
    baseRevision,
    at,
  };
}

export function isConflictError(error) {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "");
  return (
    code === "40001" ||
    /stale update|stale_settings|23505.*revision|conflict/i.test(message)
  );
}

export function isOfflineError(error) {
  if (!error) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const message = String(error.message || error);
  return /failed to fetch|networkerror|load failed|network request failed|offline|ERR_INTERNET/i.test(message);
}

/**
 * Run queued work. `run(entry)` should resolve with the server result or throw.
 * Returns counts so the caller can surface an accurate status.
 */
export async function drainQueue(queue, run) {
  const results = { saved: 0, failed: 0, conflicts: [] };
  // Process oldest first and stop at the first network failure: order matters
  // when two edits touch the same record.
  const entries = [...queue.entries].sort((a, b) => a.at - b.at);
  for (const entry of entries) {
    if (!queue.has(entry)) continue;
    try {
      await run(entry);
      queue.remove(entry);
      results.saved++;
    } catch (error) {
      if (isConflictError(error)) {
        queue.remove(entry);
        results.conflicts.push({ entry, error });
        continue;
      }
      results.failed++;
      if (isOfflineError(error)) break;
    }
  }
  return results;
}

/**
 * Minimal queue. `storage` is optional: Supabase-style environments provide
 * IndexedDB; tests provide a memory stub. Every operation is scoped by
 * accountKey so switching accounts never drains somebody else's edits.
 */
export function createQueue({ accountKey, storage = null, now = () => Date.now() } = {}) {
  let entries = [];
  let loaded = false;
  let timer = null;
  const listeners = new Set();
  const key = accountKey ? `queue:${accountKey}` : null;

  function notify() {
    for (const fn of listeners) fn(snapshot());
  }

  function snapshot() {
    return {
      entries: entries.map((e) => ({ ...e })),
      size: entries.length,
      pending: entries.length > 0,
    };
  }

  async function load() {
    if (loaded) return;
    loaded = true;
    if (storage && key) {
      try {
        const stored = await storage.get(key);
        if (Array.isArray(stored)) {
          entries = stored.filter((e) => e && e.accountKey === accountKey);
          notify();
        }
      } catch {
        // A missing or blocked database must not block studying.
      }
    }
  }

  async function persist() {
    if (!storage || !key) return;
    try {
      await storage.set(key, entries);
    } catch {
      // Quota or private mode: the in-memory queue still works for this tab.
    }
  }

  const queue = {
    get size() {
      return entries.length;
    },
    get entries() {
      return entries;
    },
    has(entry) {
      return entries.some((e) => e.id === entry.id);
    },
    snapshot,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async push(entry) {
      if (!accountKey) return;
      await load();
      if (entry.accountKey !== accountKey) return;
      entries = mergePending(entries, entry);
      await persist();
      notify();
    },
    remove(entry) {
      const before = entries.length;
      entries = entries.filter((e) => e.id !== entry.id);
      if (entries.length !== before) {
        persist();
        notify();
      }
    },
    clear() {
      entries = [];
      persist();
      notify();
    },
    /** Replace the queue with another list (used by the migration preview). */
    async replace(list) {
      await load();
      entries = list.filter((e) => e.accountKey === accountKey);
      await persist();
      notify();
    },
    /** Debounced scheduling of a drain so typing does not hammer the server. */
    schedule(fn, delay = 900) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, delay);
      return timer;
    },
    cancelSchedule() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
    async flush() {
      queue.cancelSchedule();
      await load();
      return entries.length;
    },
    accountKey,
    now,
  };
  return queue;
}
