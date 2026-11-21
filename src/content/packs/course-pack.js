// Course pack contract and helpers.
//
// A course pack is *shared* academic content. It is versioned as a whole and
// identified by two stable strings: `id` (the pack) and `version` (the content
// version). Topic IDs inside a pack are prefixed with the pack id so two packs
// can never collide even when authors reuse short subject keys such as "de".
//
// This module is pure: it never touches the DOM or browser storage. The pack
// importer (server-side) and the client catalog both use the same validation
// so the browser and the database agree on what a valid pack looks like.

export const CONTENT_STATUSES = [
  "authored",
  "imported",
  "needs-review",
  "reviewed",
  "retired",
];

export const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
// Pack-qualified IDs: "<pack-id>:<part>(:<part>)*". The pack id itself is
// lowercase kebab-case, so a qualified ID can never collide across packs.
export const TOPIC_ID_PATTERN = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9:-]*$/;
export const SUBJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const VERSION_PATTERN = /^[0-9]+(\.[0-9]+){0,2}$/;

const LANGUAGE_NAMES = {
  python: "Python 3",
  cpp: "C++17",
  c: "C17",
  java: "Java 21",
  javascript: "JavaScript",
  sql: "SQL",
};

export function packTopicId(packId, subjectId, topicId) {
  const key = String(topicId ?? "");
  if (key.startsWith(packId + ":")) return key;
  return `${packId}:${subjectId}:${key}`;
}

export function subjectKey(packId, subjectId) {
  return `${packId}:${subjectId}`;
}

export function slug(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

/**
 * Builds a single pack object from the authored subject modules and question
 * banks. The authored modules stay in place; this function only describes them
 * as a versioned pack so the same source can be seeded into the database and
 * served to the browser without duplicating the academic text.
 */
export function buildCoursePack({
  meta,
  subjects,
  chapterBank,
  extraQuiz,
  longAnswers,
  labTemplates,
  examUnits,
  paperInfo,
  resources,
}) {
  const packId = meta.id;
  const subjectIds = subjects.map((s) => s.subject.id);
  const resourcesFor = (id) => resources?.[id] || [];

  const topicId = (subjectId, rawId) => packTopicId(packId, subjectId, rawId);
  const chapterId = (rawId) => `${packId}:${rawId}`;

  const packSubjects = subjects.map((s) => {
    // Authored subject modules export { subject, syllabus, topics, resources }.
    const curriculum = s.syllabus;
    const subjectTopics = s.topics.map((t) => ({
      ...t,
      id: topicId(s.subject.id, t.id),
      rawId: t.id,
      subject: subjectKey(packId, s.subject.id),
      rawSubject: s.subject.id,
      unit: t.unit,
      // "Exam units" are the pack's own preparation hint (e.g. a CIA-2 focus),
      // not a university-confirmed boundary. See docs/CONTENT.md.
      exam: (examUnits?.[s.subject.id] || []).includes(t.unit),
      subjectName: s.subject.name,
      subjectShort: s.subject.short,
      icon: s.subject.icon,
      color: s.subject.color,
    }));
    return {
      subject: {
        ...s.subject,
        key: subjectKey(packId, s.subject.id),
        rawId: s.subject.id,
        packId,
      },
      curriculum: {
        key: subjectKey(packId, s.subject.id),
        rawId: s.subject.id,
        packId,
        code: curriculum.code,
        pdfPages: curriculum.pdfPages || [],
        printedPages: curriculum.printedPages || [],
        examUnits: examUnits?.[s.subject.id] || [],
      },
      resources: resourcesFor(s.subject.id),
      topics: subjectTopics,
      units: curriculum.units.map((u) => ({
        number: u.number,
        text: u.text,
        title: subjectTopics.find((t) => t.unit === u.number)?.unitName || null,
        exam: (examUnits?.[s.subject.id] || []).includes(u.number),
      })),
    };
  });

  const allTopics = packSubjects.flatMap((s) => s.topics);
  const topicByRaw = new Map(allTopics.map((t) => [t.rawId, t]));

  const chapterQuestions = chapterBank.map((q) => ({
    ...q,
    id: chapterId(q.id),
    rawId: q.id,
    subject: subjectKey(packId, q.subject),
    rawSubject: q.subject,
    topicId: q.topicId ? topicId(q.subject, q.topicId) : null,
  }));

  const quiz = extraQuiz.map((q) => {
    const base = topicByRaw.get(q.topicId);
    return {
      ...base,
      ...q,
      id: chapterId(q.id),
      rawId: q.id,
      subject: subjectKey(packId, q.subject),
      rawSubject: q.subject,
      topicId: q.topicId ? topicId(q.subject, q.topicId) : null,
      unitName: base?.unitName || `Unit ${q.unit}`,
      exam: base?.exam ?? false,
    };
  });

  const long = longAnswers.map((l) => ({
    ...l,
    id: chapterId(l.id),
    rawId: l.id,
    subject: subjectKey(packId, l.subject),
    rawSubject: l.subject,
    related: (l.related || []).map((id) => topicId(l.subject, id)),
  }));

  const labs = labTemplates.map((t) => ({
    ...t,
    id: chapterId(t.id),
    rawId: t.id,
    languageName: LANGUAGE_NAMES[t.language] || t.language,
  }));

  return {
    id: packId,
    version: meta.version,
    title: meta.title,
    description: meta.description,
    institution: meta.institution ?? null,
    programme: meta.programme ?? null,
    branch: meta.branch ?? null,
    academicYear: meta.academicYear ?? null,
    syllabusVersion: meta.syllabusVersion ?? null,
    // Honest review status. "imported" means authored for one student and
    // re-packaged without institutional review; it is not an approval claim.
    publicationStatus: meta.publicationStatus || "imported",
    reviewedBy: meta.reviewedBy ?? null,
    reviewedAt: meta.reviewedAt ?? null,
    license: meta.license ?? "unlicensed",
    author: meta.author ?? "Repository contributors",
    subjects: packSubjects,
    chapterQuestions,
    quiz,
    long,
    labs,
    paperInfo: paperInfo ?? null,
    examUnits: examUnits ?? {},
    counts: {
      subjects: packSubjects.length,
      units: packSubjects.reduce((n, s) => n + s.units.length, 0),
      topics: allTopics.length,
      chapterQuestions: chapterQuestions.length,
      quiz: quiz.length,
      long: long.length,
      labs: labs.length,
    },
    subjectIds,
  };
}

/** Validation used by both the importer and the automated tests. */
export function validatePack(pack) {
  const errors = [];
  const fail = (message) => errors.push(message);
  if (!pack || typeof pack !== "object") return ["pack is not an object"];
  if (!PACK_ID_PATTERN.test(pack.id || "")) fail("invalid pack id");
  if (!VERSION_PATTERN.test(pack.version || "")) fail("invalid pack version");
  if (!pack.title || typeof pack.title !== "string") fail("missing title");
  if (!CONTENT_STATUSES.includes(pack.publicationStatus))
    fail("invalid publication status");
  if (!Array.isArray(pack.subjects) || !pack.subjects.length)
    fail("pack has no subjects");

  const subjectKeys = new Set();
  const topicIds = new Set();
  for (const s of pack.subjects || []) {
    if (!SUBJECT_ID_PATTERN.test(s.subject?.rawId || ""))
      fail(`invalid subject id ${s.subject?.rawId}`);
    if (s.subject?.key !== subjectKey(pack.id, s.subject.rawId))
      fail(`subject key mismatch ${s.subject?.key}`);
    if (subjectKeys.has(s.subject.key)) fail(`duplicate subject ${s.subject.key}`);
    subjectKeys.add(s.subject.key);
    for (const u of s.units || []) {
      if (!Number.isInteger(u.number)) fail(`bad unit number in ${s.subject.key}`);
    }
    for (const t of s.topics || []) {
      if (!TOPIC_ID_PATTERN.test(t.id)) fail(`invalid topic id ${t.id}`);
      if (!t.id.startsWith(pack.id + ":")) fail(`topic not namespaced ${t.id}`);
      if (t.subject !== s.subject.key) fail(`topic subject mismatch ${t.id}`);
      if (topicIds.has(t.id)) fail(`duplicate topic ${t.id}`);
      topicIds.add(t.id);
      if (!(t.minutes > 0)) fail(`topic ${t.id} has no minutes`);
      if (!Array.isArray(t.options) || t.options.length !== 4)
        fail(`topic ${t.id} needs four MCQ options`);
      if (!(Number.isInteger(t.answer) && t.answer >= 0 && t.answer < 4))
        fail(`topic ${t.id} has an invalid MCQ answer`);
    }
  }
  for (const q of pack.chapterQuestions || []) {
    if (!subjectKeys.has(q.subject)) fail(`question ${q.id} has unknown subject`);
    if (q.topicId && !topicIds.has(q.topicId))
      fail(`question ${q.id} references unknown topic`);
  }
  for (const q of pack.quiz || []) {
    if (!subjectKeys.has(q.subject)) fail(`quiz ${q.id} has unknown subject`);
    if (!Array.isArray(q.options) || q.options.length !== 4)
      fail(`quiz ${q.id} needs four options`);
  }
  for (const l of pack.long || []) {
    if (!subjectKeys.has(l.subject)) fail(`long answer ${l.id} has unknown subject`);
    for (const id of l.related || [])
      if (!topicIds.has(id)) fail(`long answer ${l.id} references unknown topic`);
  }
  const counts = pack.counts || {};
  if (counts.topics !== topicIds.size) fail("topic count mismatch");
  return errors;
}

/** A stable fingerprint so the importer can detect content changes. */
export function packFingerprint(pack) {
  const source = JSON.stringify({
    id: pack.id,
    version: pack.version,
    title: pack.title,
    publicationStatus: pack.publicationStatus,
    subjects: (pack.subjects || []).map((s) => ({
      key: s.subject.key,
      units: s.units,
      topics: s.topics,
    })),
    chapterQuestions: pack.chapterQuestions,
    quiz: pack.quiz,
    long: pack.long,
    labs: pack.labs,
  });
  // FNV-1a 32-bit. Deterministic and dependency-free; used only to detect drift.
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export const LANGUAGE_LABELS = LANGUAGE_NAMES;
