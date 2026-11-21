// Stable client keys.
//
// Namespace:  <scope>:<subject>:<topic>          topic learning records
//             <scope>:<subject>:<topic>~<part>   question variants (unchanged)
//
// `scope` names the *curriculum namespace* an item belongs to, not an exam
// session and not a content revision. The first published namespace is
// "cia-2-2025-26" because that is what existing students' saved data already
// uses; a future namespace (e.g. "btech-cse-2027") is free-form. Identity rules:
//
//   * Identity is (namespace, subject, topic). Content version, syllabus review
//     status and "exam focus" never form part of an identity.
//   * A key is resolved within the selected pack version. Two different packs
//     cannot produce the same key because the namespace differs, and the
//     resolver rejects a key that matches more than one row rather than
//     guessing.
//   * A key that cannot be resolved (unknown namespace, removed topic, typo) is
//     reported and kept, never dropped.
//
// Pack-qualified keys used by the browser bundle are `<pack>:<subject>:<id>`;
// the pack and the namespace are the same string for the first pack.

export const KEY_SEPARATOR = ":";
export const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9_.-]*$/;
export const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
// Subject and topic parts use at least two characters so a one-letter typo such
// as "x" cannot look like a key.
export const SUBJECT_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;
export const TOPIC_PART_PATTERN = /^[a-z0-9][a-z0-9_.-]{1,63}$/;

export function makeKey(namespace, subject, topic) {
  for (const part of [namespace, subject, topic])
    if (!part || String(part).includes(KEY_SEPARATOR))
      throw new Error(`invalid key part: ${part}`);
  const key = `${namespace}${KEY_SEPARATOR}${subject}${KEY_SEPARATOR}${topic}`;
  if (
    !KEY_PATTERN.test(key) ||
    !NAMESPACE_PATTERN.test(namespace) ||
    !SUBJECT_PATTERN.test(subject) ||
    !TOPIC_PART_PATTERN.test(topic)
  )
    throw new Error(`invalid key: ${key}`);
  return key;
}

export function parseKey(key) {
  if (typeof key !== "string") return null;
  const [namespace, subject, topic, ...rest] = key.split(KEY_SEPARATOR);
  if (rest.length || !namespace || !subject || !topic) return null;
  if (!KEY_PATTERN.test(key)) return null;
  return { namespace, subject, topic, key };
}

/** True for a bare legacy id such as "de1" (no namespace). */
export function isLegacyId(value) {
  return typeof value === "string" && !value.includes(KEY_SEPARATOR);
}

/**
 * Resolve keys against the catalog of one pack.
 *
 * Returns { resolved: Map<key, topic>, unknown: string[], ambiguous: {key,
 * candidates}[] }. Nothing is dropped: unknown and ambiguous keys are returned
 * so callers can store them for later resolution.
 */
export function resolveKeys(keys, pack) {
  const byKey = new Map();
  const byRaw = new Map();
  for (const subject of pack?.subjects || []) {
    for (const topic of subject.topics) {
      if (byKey.has(topic.id)) {
        byKey.get(topic.id).ambiguous = true;
        continue;
      }
      byKey.set(topic.id, topic);
      if (topic.rawId) {
        byRaw.set(topic.rawId, (byRaw.get(topic.rawId) || 0) + 1);
      }
    }
  }
  const resolved = new Map();
  const unknown = [];
  const ambiguous = [];
  for (const key of keys) {
    const exact = byKey.get(key);
    if (exact && !exact.ambiguous) {
      resolved.set(key, exact);
      continue;
    }
    if (exact?.ambiguous) {
      ambiguous.push({ key, candidates: [] });
      continue;
    }
    // Legacy bare id: resolve through the explicit catalog mapping, and refuse
    // when a bare id would map to more than one subject.
    const hits = isLegacyId(key)
      ? [...byKey.values()].filter((t) => t.rawId === key && !t.ambiguous)
      : [];
    if (hits.length === 1) {
      resolved.set(key, hits[0]);
      continue;
    }
    if (hits.length > 1) {
      ambiguous.push({ key, candidates: hits.map((t) => t.id) });
      continue;
    }
    unknown.push(key);
  }
  return { resolved, unknown, ambiguous };
}

/**
 * Group keys by the pack they resolve in. Used before sync so a key only ever
 * goes to the pack that owns it.
 */
export function groupKeysByPack(keys, packs) {
  const groups = new Map();
  const unresolved = [];
  for (const key of keys) {
    const parsed = parseKey(key);
    const pack = packs.find((p) => p.id === parsed?.namespace);
    if (!parsed || !pack) {
      unresolved.push(key);
      continue;
    }
    if (!groups.has(pack.id)) groups.set(pack.id, { pack, keys: [] });
    groups.get(pack.id).keys.push(key);
  }
  return { groups, unresolved };
}
