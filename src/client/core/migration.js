// Guest data migration.
//
// Two separate operations, deliberately:
//
//  1. upgradeGuestState() rewrites the browser's *guest* state from the legacy
//     layout (ids like "de1") to namespaced keys. It never touches the original
//     storage key, writes an immutable backup first, and is idempotent.
//  2. planImport()/applyImport() export guest records into an account. Nothing
//     is uploaded until the student reviews and confirms the preview.
//
// Identifier mapping is a deterministic table, not a guess: a legacy id is
// resolved against the authored catalog (the same mapping that produced
// "cia-2-2025-26:de:de1"). Unknown ids are kept in an `unmapped` bucket so they
// can be recovered later.

import { makeKey, resolveKeys, KEY_SEPARATOR } from "./keys.js";

export const LEGACY_STORAGE_KEY = "raman-cia2-sprint-v1";
export const CURRENT_STORAGE_KEY = LEGACY_STORAGE_KEY; // unchanged, existing data
export const MIGRATION_VERSION = 2;
export const BACKUP_KEY_PREFIX = "study-sprint:migration-backup:";
export const MIGRATION_MARKER = "study-sprint:migrated";

/** Which legacy field lists which record type. */
const TOPIC_FIELDS = [
  "status",
  "completedAt",
  "reviews",
  "confidence",
  "revisionNotes",
  "excluded",
  "notes",
  "notesSummary",
  "questionDone",
  "materialRead",
  "lastTopic",
];

/**
 * Deterministic legacy-id -> key map built from the catalog, once.
 * de1 -> cia-2-2025-26:de:de1  (namespace = pack id, subject = subject id)
 */
export function legacyKeyMap(pack) {
  const map = new Map();
  for (const subject of pack.subjects) {
    for (const topic of subject.topics) {
      if (topic.rawId) map.set(topic.rawId, topic.id);
    }
  }
  return map;
}

/** Build the deterministic key for a legacy id that is *not* in the catalog. */
export function legacyKeyFor(rawId, pack, subjectId) {
  if (!rawId) return null;
  const id = String(rawId);
  if (id.includes(":")) return id;
  const { resolved } = resolveKeys([id], pack);
  if (resolved.size === 1) return [...resolved.values()][0].id;
  if (subjectId) {
    try {
      return makeKey(pack.id, subjectId, id);
    } catch {
      return null;
    }
  }
  return null;
}

/** Legacy id -> key using only the explicit catalog map (no guessing). */
function resolveLegacy(rawId, pack) {
  const direct = legacyKeyMap(pack).get(rawId);
  if (direct) return direct;
  const { resolved, ambiguous } = resolveKeys([rawId], pack);
  if (resolved.size === 1 && !ambiguous.length) return [...resolved.values()][0].id;
  return null;
}

function migrateIdList(list, map, pack) {
  const out = [];
  const missing = [];
  for (const id of Array.isArray(list) ? list : []) {
    const mapped = map.get(id) || resolveLegacy(id, pack);
    if (mapped) out.push(mapped);
    else missing.push(id);
  }
  return { out: [...new Set(out)], missing };
}

/**
 * Rewrite one state object into the current layout. Returns
 * { state, report } where report lists every unmapped identifier so nothing is
 * silently lost. Pure: callers decide when to persist.
 */
export function upgradeGuestState(raw, pack, { now = Date.now() } = {}) {
  const state = structuredClone(raw || {});
  const map = legacyKeyMap(pack);
  const report = { unmapped: [], mapped: 0, alreadyCurrent: 0 };
  const unknown = [];
  const alreadyCurrent = [];

  const migrateTopicMap = (field) => {
    if (!state[field] || typeof state[field] !== "object") return;
    const out = {};
    for (const [legacyId, value] of Object.entries(state[field])) {
      if (legacyId.includes(":")) {
        // Already a namespaced key (or an earlier partial migration).
        out[legacyId] = value;
        alreadyCurrent.push(`${field}:${legacyId}`);
        continue;
      }
      const mapped = map.get(legacyId) || resolveLegacy(legacyId, pack);
      if (mapped && !(mapped in out)) out[mapped] = value;
      else unknown.push(legacyId);
    }
    state[field] = out;
  };

  for (const field of TOPIC_FIELDS) migrateTopicMap(field);

  // latest studied topic
  if (state.lastTopic && map.has(state.lastTopic)) {
    state.lastTopic = map.get(state.lastTopic);
  } else if (state.lastTopic && !String(state.lastTopic).includes(":")) {
    unknown.push(`lastTopic:${state.lastTopic}`);
    delete state.lastTopic;
  }

  // missed-question list
  const missed = migrateIdList(state.missed, map, pack);
  state.missed = missed.out;
  for (const id of missed.missing) unknown.push(`missed:${id}`);

  // Quiz attempt: question ids + subject
  if (state.quiz && Array.isArray(state.quiz.ids)) {
    const mappedQuiz = migrateIdList(state.quiz.ids, map, pack);
    state.quiz.ids = mappedQuiz.out;
    for (const id of mappedQuiz.missing) unknown.push(`quiz:${id}`);
    if (state.quiz.subject && !String(state.quiz.subject).includes(":")) {
      const legacySubject = pack.subjects.find((s) => s.subject.rawId === state.quiz.subject);
      state.quiz.subject = legacySubject ? legacySubject.subject.key : state.quiz.subject;
    }
    if (Array.isArray(state.quiz.answers)) {
      for (const answer of state.quiz.answers) {
        if (!answer?.id || String(answer.id).includes(":")) continue;
        const resolved = map.get(answer.id) || resolveLegacy(answer.id, pack);
        if (resolved) answer.id = resolved;
        else unknown.push(`attempt:${answer.id}`);
      }
    }
  }

  // Quiz history and long-answer practice
  if (Array.isArray(state.history)) {
    state.history = state.history.map((h) => {
      const subject = pack.subjects.find((s) => s.subject.rawId === h.subjectId);
      return { ...h, subjectId: subject ? subject.subject.key : h.subjectId ?? null };
    });
  }
  if (state.longDrafts || state.longScores || state.longDone) {
    const longMap = new Map();
    for (const entry of pack.long || []) {
      if (entry.rawId) longMap.set(entry.rawId, entry.id);
    }
    const migrateLong = (field) => {
      if (!state[field] || typeof state[field] !== "object") return;
      const out = {};
      for (const [legacyId, value] of Object.entries(state[field])) {
        if (legacyId.includes(":")) out[legacyId] = value;
        else {
          const mapped = longMap.get(legacyId);
          if (mapped && !(mapped in out)) out[mapped] = value;
          else unknown.push(legacyId);
        }
      }
      state[field] = out;
    };
    for (const field of ["longDrafts", "longScores", "longDone"]) migrateLong(field);
  }

  // Saved plan references: blocks keyed by plan block id and topic arrays
  if (state.customPlan && Array.isArray(state.customPlan.days)) {
    for (const day of state.customPlan.days) {
      for (const block of day.blocks || []) {
        if (Array.isArray(block.topics)) {
          const mapped = migrateIdList(block.topics, map, pack);
          block.topics = mapped.out;
          for (const id of mapped.missing) unknown.push(`plan:${id}`);
        }
      }
    }
    if (Array.isArray(state.customPlan.backlog)) {
      const mapped = migrateIdList(state.customPlan.backlog, map, pack);
      state.customPlan.backlog = mapped.out;
      for (const id of mapped.missing) unknown.push(`plan-backlog:${id}`);
    }
  }

  // Old chat attachment ids
  if (Array.isArray(state.chat)) {
    for (const message of state.chat) {
      if (message?.contextTopicId && map.has(message.contextTopicId))
        message.contextTopicId = map.get(message.contextTopicId);
      if (Array.isArray(message?.sources)) {
        const mappedSources = migrateIdList(message.sources, map, pack);
        message.sources = mappedSources.out;
        for (const id of mappedSources.missing) unknown.push(`chat:${id}`);
      }
    }
  }

  // Preserve every unresolved identifier for later recovery.
  const existingUnmapped = Array.isArray(state.unmapped) ? state.unmapped : [];
  state.unmapped = [...new Set([...existingUnmapped, ...unknown])];
  report.unmapped = state.unmapped;
  // "mapped" counts identifiers rewritten on this pass; an added migration
  // marker on its own must not count as new migration work.
  report.mapped = Math.max(0, state.unmapped.length - existingUnmapped.length) + report.alreadyCurrent;
  state.migration = {
    version: MIGRATION_VERSION,
    namespace: pack.id,
    migratedAt: raw?.migration?.migratedAt || new Date(now).toISOString(),
    upgradedAt: raw?.migration?.upgradedAt || new Date(now).toISOString(),
    unmappedCount: state.unmapped.length,
  };
  return { state, report };
}

/**
 * Immutable backup before the first change. Returns the backup key so callers
 * can tell the student where the original lives.
 */
export function backupKey() {
  return `${BACKUP_KEY_PREFIX}${MIGRATION_VERSION}`;
}

export function writeBackup(storage, raw) {
  const key = backupKey();
  // Write once: never overwrite an earlier backup with a partially migrated
  // state, even if the user reloads mid-way.
  if (!storage.getItem(key)) {
    storage.setItem(key, JSON.stringify({ takenAt: new Date().toISOString(), version: MIGRATION_VERSION, raw }));
  }
  return key;
}

/**
 * Run the guest upgrade against a storage-like object ({getItem,setItem}).
 * Idempotent: a second run finds nothing to change and does not touch the
 * backup. Writes the marker only after the new state parses and validates.
 */
export function runGuestMigration(storage, pack, { validate = () => true } = {}) {
  const original = storage.getItem(LEGACY_STORAGE_KEY);
  if (!original) return { ran: false, reason: "no-saved-state" };
  let raw;
  try {
    raw = JSON.parse(original);
  } catch {
    return { ran: false, reason: "unreadable" };
  }
  const alreadyCurrent = raw.migration?.version === MIGRATION_VERSION;
  const { state, report } = upgradeGuestState(raw, pack);
  // Only left-over legacy identifiers are new work. Anything else means the
  // state is already in the current layout.
  const remainingLegacy = countLegacyIds(state);
  if (alreadyCurrent && !remainingLegacy) {
    storage.setItem(MIGRATION_MARKER, JSON.stringify({ version: MIGRATION_VERSION, at: state.migration.upgradedAt }));
    return { ran: false, reason: "already-migrated", report };
  }
  const key = writeBackup(storage, raw);
  // Validate before persisting; on failure the original is untouched.
  const serialized = JSON.stringify(state);
  const parsed = JSON.parse(serialized);
  if (!validate(parsed)) return { ran: false, reason: "validation-failed", backupKey: key };
  storage.setItem(LEGACY_STORAGE_KEY, serialized);
  storage.setItem(MIGRATION_MARKER, JSON.stringify({ version: MIGRATION_VERSION, at: state.migration.upgradedAt, backupKey: key }));
  return { ran: true, report, backupKey: key, state };
}

export function countLegacyIds(state) {
  // A bare identifier in one of the migrated positions that is not already a
  // key means the upgrade still has work to do. Only top-level map keys count:
  // note bodies, timestamps and values are data, not identifiers. Unmapped ids
  // that were preserved deliberately do not count, so the migration does not
  // rerun forever.
  const isLegacy = (value) => typeof value === "string" && !value.includes(KEY_SEPARATOR);
  let count = 0;
  for (const field of TOPIC_FIELDS) {
    const value = state[field];
    if (!value) continue;
    if (field === "lastTopic") {
      if (isLegacy(value)) count++;
    } else if (typeof value === "object" && !Array.isArray(value)) {
      count += Object.keys(value).filter(isLegacy).length;
    } else if (Array.isArray(value)) {
      count += value.filter(isLegacy).length;
    }
  }
  return count;
}

/**
 * Records the guest holds that an account does not. Used by the import preview.
 * Imported progress stays *self-reported*: it is stored as such and never
 * presented as verified assessment.
 */
export function planImport(guestState, cloud, pack) {
  const known = new Set([...(cloud?.topicKeys || []), ...(cloud?.noteKeys || [])]);
  // Only keys this pack can resolve are importable; anything else is reported
  // as skipped (and stays in the guest state for recovery).
  const guestKeys = new Set([
    ...Object.keys(guestState.status || {}),
    ...Object.keys(guestState.notes || {}),
    ...Object.keys(guestState.reviews || {}),
    ...Object.keys(guestState.completedAt || {}),
  ]);
  const { resolved, unknown, ambiguous } = resolveKeys([...guestKeys], pack);
  const records = [];
  const skipped = [
    ...unknown.map((key) => ({ key, reason: "unknown-key" })),
    ...ambiguous.map((a) => ({ key: a.key, reason: "ambiguous-key" })),
  ];
  for (const key of resolved.keys()) {
    const status = guestState.status?.[key];
    const note = guestState.notes?.[key];
    const review = guestState.reviews?.[key];
    const completedAt = guestState.completedAt?.[key];
    if (!status && !note && !review && !completedAt) continue;
    const overlap = known.has(key);
    records.push({
      key,
      status: status || null,
      note: note || "",
      reviewedAt: review || null,
      completedAt: completedAt || null,
      overlap,
      source: "guest",
      verified: false,
    });
  }
  return {
    total: records.length,
    overlapping: records.filter((r) => r.overlap).length,
    independent: records.filter((r) => !r.overlap).length,
    records,
    skipped,
    policy:
      "Independent records are added. Where the account already has progress for a topic, you choose which version to keep; the guest version is never applied silently. Imported progress is self-reported, not a verified assessment.",
  };
}

/**
 * Merge one previewed record according to the student's choice.
 * choice: "guest" | "cloud" | "newer"
 */
export function chooseImportWinner(local, remote, choice) {
  if (choice === "guest") return local;
  if (choice === "cloud") return remote;
  const localAt = local.completedAt || local.reviewedAt || 0;
  const remoteAt = remote.completedAt || remote.reviewedAt || 0;
  return localAt >= remoteAt ? local : remote;
}
