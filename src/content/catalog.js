// Pure catalog helpers.
//
// Everything here is a function of (pack, selected subject keys). No DOM and no
// storage, so the node test runner can exercise exactly what the browser runs.
// The legacy `src/content/index.js` exports remain for source compatibility and
// existing tests; the application uses this module so each student only sees
// their selected subjects.
import { DEFAULT_PACK_ID, PACKS } from "./packs/index.js";

export function packSubjects(pack) {
  return pack?.subjects || [];
}

/** Subject objects for the selected subject keys, preserving pack order. */
export function selectedSubjectList(pack, selectedKeys) {
  const selected = new Set(selectedKeys || []);
  return packSubjects(pack)
    .filter((s) => selected.has(s.subject.key))
    // Topic records carry the pack-qualified subject key, so the subject list
    // must use the same id. rawId keeps the short authored id for content rules.
    .map((s) => ({ ...s.subject, id: s.subject.key }));
}

/** All topic objects in the selected subjects. */
export function selectedTopics(pack, selectedKeys) {
  const selected = new Set(selectedKeys || []);
  return packSubjects(pack)
    .filter((s) => selected.has(s.subject.key))
    .flatMap((s) => s.topics);
}

export function filteredLongAnswers(pack, selectedKeys) {
  const selected = new Set(selectedKeys || []);
  return (pack?.long || []).filter((l) => selected.has(l.subject));
}

export function filteredChapterQuestions(pack, selectedKeys) {
  const selected = new Set(selectedKeys || []);
  return (pack?.chapterQuestions || []).filter((q) => selected.has(q.subject));
}

function questionMode(topic) {
  return topic.code
    ? "code"
    : /calculate|compute|simplify|find|evaluate|how many|convert|sort|trace/i.test(
      topic.question || "",
    )
      ? "numerical"
      : "theory";
}

export function questionModeOf(q) {
  return questionMode(q);
}

/** Short-question bank derived exactly as the legacy catalog derived it. */
export function shortBank(pack, selectedKeys) {
  const topics = selectedTopics(pack, selectedKeys);
  return [
    ...topics.map((t) => ({
      id: t.id,
      subject: t.subject,
      unit: t.unit,
      kind: "short",
      mode: questionMode(t),
      marks: t.marks || 5,
      title: t.title,
      prompt: t.question,
      steps: t.steps,
      answer: t.recall,
      code: t.code,
      topicId: t.id,
    })),
    ...filteredChapterQuestions(pack, selectedKeys).filter(
      (q) => q.kind === "short",
    ),
  ];
}

export function quizBank(pack, selectedKeys) {
  const topics = selectedTopics(pack, selectedKeys);
  const selected = new Set(selectedKeys || []);
  return [
    ...topics,
    ...(pack?.quiz || []).filter((q) => selected.has(q.subject)),
  ];
}

/**
 * Resolve the active pack. Cloud selection may reference a pack the browser
 * build does not ship; in that case we fall back to the bundled default and
 * tell the caller so the UI can be honest about what is shown.
 */
export function resolvePack(packId, packs = PACKS) {
  const found = packs.find((p) => p.id === packId);
  if (found) return { pack: found, fallback: false };
  return {
    pack: packs.find((p) => p.id === DEFAULT_PACK_ID) || packs[0],
    fallback: true,
  };
}

/** Which subject keys of a pack may be selected (all of them, for now). */
export function selectableSubjectKeys(pack) {
  return packSubjects(pack).map((s) => s.subject.key);
}

/** Keep only keys that still exist in the pack, preserving pack order. */
export function normalizeSelection(pack, keys) {
  if (!pack) return [];
  const available = selectableSubjectKeys(pack);
  if (!keys || !keys.length) return available;
  const wanted = new Set(keys);
  const ordered = available.filter((k) => wanted.has(k));
  return ordered.length ? ordered : available;
}

/** Group topics by subject key. Used by dashboards and subject tiles. */
export function groupTopicsBySubject(topics) {
  const byKey = new Map();
  for (const t of topics) {
    if (!byKey.has(t.subject)) byKey.set(t.subject, []);
    byKey.get(t.subject).push(t);
  }
  return byKey;
}
