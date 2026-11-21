// Mapping between the application's learning state and the normalised database
// rows. Kept pure so the same rules run in tests, in the guest-to-account
// migration preview and in the live sync path.
//
// One-way rule: the app talks in stable topic keys ("pack:subject:topic"), not
// database UUIDs, so a guest and a signed-in student use the same structures
// and migration can be computed before any UUID is known.

/** A row type: how the app field maps to columns and back. */
export const RECORD_TYPES = {
  topic_progress: {
    table: "topic_progress",
    key: (key) => key,
    fromApp(state, key) {
      return {
        topic_key: key,
        status: state.status?.[key] || "not-started",
        excluded: !!state.excluded?.[key],
        notes_summary: (state.notesSummary?.[key] || "").slice(0, 500),
        completed_at: state.completedAt?.[key] ? new Date(state.completedAt[key]).toISOString() : null,
      };
    },
    toApp(row) {
      return {
        status: row.status,
        excluded: row.excluded,
        notesSummary: row.notes_summary || "",
        completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
      };
    },
  },
  revision_records: {
    table: "revision_records",
    key: (key) => key,
    fromApp(state, key) {
      return {
        topic_key: key,
        revised_at: new Date(state.reviews?.[key] || Date.now()).toISOString(),
        confidence: state.confidence?.[key] ?? null,
        note: (state.revisionNotes?.[key] || "").slice(0, 1000),
      };
    },
    toApp(row) {
      return {
        reviews: { [row.topic_key]: new Date(row.revised_at).getTime() },
        confidence: row.confidence ?? undefined,
        revisionNotes: row.note || "",
      };
    },
  },
  notes: {
    table: "notes",
    key: (key) => key,
    fromApp(state, key) {
      return { topic_key: key, body: (state.notes?.[key] || "").slice(0, 10000) };
    },
    toApp(row) {
      return { [row.topic_key]: row.body || "" };
    },
  },
  long_answer_drafts: {
    table: "long_answer_drafts",
    key: (key) => key,
    fromApp(state, key) {
      return {
        answer_key: key,
        body: (state.longDrafts?.[key] || "").slice(0, 50000),
        self_score: Number.isInteger(state.longScores?.[key]) ? state.longScores[key] : null,
        practised: !!state.longDone?.[key],
      };
    },
    toApp(row) {
      return {
        drafts: { [row.answer_key]: row.body || "" },
        scores: row.self_score,
        done: row.practised,
      };
    },
  },
  code_drafts: {
    table: "code_drafts",
    key: (key) => key,
    fromApp(state, language) {
      return {
        language,
        code: (state.lab?.drafts?.[language] || "").slice(0, 30000),
        stdin: (state.lab?.inputs?.[language] || "").slice(0, 8000),
      };
    },
    toApp(row) {
      return { language: row.language, code: row.code || "", stdin: row.stdin || "" };
    },
  },
  quiz_attempts: {
    table: "quiz_attempts",
    key: (key) => key,
    fromApp(state, attemptId, meta = {}) {
      const attempt = state.quizHistory?.find?.((h) => h.id === attemptId) || meta.attempt || {};
      return {
        id: attemptId,
        subject_key: meta.subjectKey ?? attempt.subjectKey ?? null,
        started_at: attempt.startedAt ? new Date(attempt.startedAt).toISOString() : new Date().toISOString(),
        completed_at: attempt.at ? new Date(attempt.at).toISOString() : null,
        question_count: attempt.total ?? 0,
        correct_count: attempt.score ?? 0,
        answers: Array.isArray(attempt.answers) ? attempt.answers : [],
      };
    },
    toApp(row) {
      return {
        id: row.id,
        subjectKey: row.subject_key,
        score: row.correct_count,
        total: row.question_count,
        at: row.completed_at ? new Date(row.completed_at).getTime() : null,
      };
    },
  },
};

/** Collect the mapping for every record the student's state touches. */
export function planSyncRows(state, packId, topicKeys, questionKeys) {
  const rows = [];
  for (const key of topicKeys || []) {
    const status = state.status?.[key];
    const completedAt = state.completedAt?.[key];
    if (status || completedAt || state.notesSummary?.[key])
      rows.push({ type: "topic_progress", key, packId, payload: RECORD_TYPES.topic_progress.fromApp(state, key) });
    if (state.reviews?.[key])
      rows.push({ type: "revision_records", key, packId, payload: RECORD_TYPES.revision_records.fromApp(state, key) });
    if (state.notes?.[key])
      rows.push({ type: "notes", key, packId, payload: RECORD_TYPES.notes.fromApp(state, key) });
  }
  for (const key of questionKeys || []) {
    if (state.longDrafts?.[key] || state.longDone?.[key] || state.longScores?.[key] !== undefined)
      rows.push({ type: "long_answer_drafts", key, packId, payload: RECORD_TYPES.long_answer_drafts.fromApp(state, key) });
  }
  return rows;
}

/** A plain-text answer difference for a conflict dialog. */
export function describeConflict(local, remote, limit = 240) {
  const trim = (text) => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  return {
    local: trim(local),
    remote: trim(remote),
    identical: String(local ?? "") === String(remote ?? ""),
  };
}
