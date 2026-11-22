// Account-scoped local storage helpers.
//
// Two rules, both testable:
//   1. Anything cached for a signed-in student lives under
//      `study-sprint:acct:<userId>:…`, so switching accounts cannot read the
//      previous student's cached work.
//   2. Guest state keeps its own keys and is never written into an account
//      namespace automatically. Import is an explicit, reviewed action.

export const ACCOUNT_PREFIX = "study-sprint:acct:";
export const GUEST_STATE_KEY = "raman-cia2-sprint-v1"; // unchanged, existing data
export const ANON_QUEUE_KEY = "study-sprint:queue:anon";

export function accountKey(userId) {
  if (!userId) throw new Error("accountKey needs a user id");
  return `${ACCOUNT_PREFIX}${userId}`;
}

export function accountStorageKey(userId, name) {
  return `${accountKey(userId)}:${name}`;
}

/** A tiny localStorage wrapper that never throws on quota/private mode. */
export function browserStorage(store = globalThis.localStorage) {
  const safe = {
    getItem(key) {
      try {
        return store?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        store?.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    removeItem(key) {
      try {
        store?.removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
    keys() {
      try {
        return store ? Object.keys(store) : [];
      } catch {
        return [];
      }
    },
  };
  return safe;
}

/** Read the cached snapshot for one account, or null. */
export function readAccountCache(storage, userId, name) {
  const raw = storage.getItem(accountStorageKey(userId, name));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeAccountCache(storage, userId, name, value) {
  return storage.setItem(accountStorageKey(userId, name), JSON.stringify(value));
}

/** Remove every cached key belonging to an account (used on sign-out). */
export function clearAccountCache(storage, userId) {
  const prefix = `${accountKey(userId)}:`;
  let removed = 0;
  for (const key of storage.keys()) {
    if (key.startsWith(prefix)) {
      storage.removeItem(key);
      removed++;
    }
  }
  return removed;
}

/** Which account, if any, owns a storage key. */
export function ownerOfKey(key) {
  if (!key?.startsWith(ACCOUNT_PREFIX)) return null;
  return key.slice(ACCOUNT_PREFIX.length).split(":")[0] || null;
}

/**
 * A durable queue store for sync.js. Prefers IndexedDB and falls back to the
 * browser store, so a pending edit survives a reload even where IndexedDB is
 * blocked.
 */
export function createQueueStorage({ idbFactory = globalThis.indexedDB, fallback } = {}) {
  const dbName = "study-sprint";
  const storeName = "pending";
  let dbPromise = null;

  function open() {
    if (!idbFactory) return Promise.reject(new Error("no-indexeddb"));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = idbFactory.open(dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function withStore(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const request = fn(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return {
    async get(key) {
      try {
        return (await withStore("readonly", (s) => s.get(key))) ?? null;
      } catch {
        const raw = fallback?.getItem(`idb:${key}`);
        return raw ? JSON.parse(raw) : null;
      }
    },
    async set(key, value) {
      try {
        await withStore("readwrite", (s) => s.put(value, key));
      } catch {
        fallback?.setItem(`idb:${key}`, JSON.stringify(value));
      }
    },
    async delete(key) {
      try {
        await withStore("readwrite", (s) => s.delete(key));
      } catch {
        fallback?.removeItem(`idb:${key}`);
      }
    },
  };
}
