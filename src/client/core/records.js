// Record fingerprints used for optimistic concurrency.
//
// The browser computes the same value the database trigger compares against
// (see supabase/migrations/20261121000300_student_data.sql). The browser sends
// the revision it loaded; if the stored row has changed since, the update is
// refused and the UI offers a choice instead of silently overwriting.

/** FNV-1a 32-bit (hash ^= byte as a Number, then multiply), matching
 * private.fnv1a in PostgreSQL. Documents outside the BMP hash by code unit on
 * both sides, so the two implementations stay identical. */
export function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash = hash ^ text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function fingerprint(text) {
  return fnv1a(String(text ?? "")).toString(16).padStart(8, "0");
}

/** JSON with sorted object keys and no whitespace, as JSON.stringify emits it. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value ?? null);
}

/** Postgres timestamptz -> the ISO string a row round-trips through JSON. */
export function timestampKey(value) {
  if (!value) return "1970-01-01T00:00:00+00:00";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "1970-01-01T00:00:00+00:00" : d.toISOString();
}

/*
 * SQL function counterparts. Keep in sync with
 * public.topic_progress_fingerprint, public.revision_record_fingerprint,
 * public.quiz_attempt_fingerprint, public.note_fingerprint,
 * public.long_answer_draft_fingerprint and public.code_draft_fingerprint.
 * "completedAt" is deliberately absent from the progress fingerprint so a
 * status change is not masked by a timestamp the client does not manage.
 */
export function topicProgressRevision(row) {
  return fingerprint(
    canonicalJson({
      status: row.status ?? "",
      notes: row.notes_summary ?? "",
      excluded: row.excluded ?? false,
    }),
  );
}

export function revisionRecordRevision(row) {
  return fingerprint(
    canonicalJson({
      revisedAt: timestampKey(row.revised_at),
      confidence: row.confidence ?? 0,
      note: row.note ?? "",
    }),
  );
}

export function quizAttemptRevision(row) {
  return fingerprint(
    canonicalJson({
      completedAt: timestampKey(row.completed_at),
      questionCount: row.question_count ?? 0,
      correctCount: row.correct_count ?? 0,
    }),
  );
}

export function noteRevision(row) {
  return fingerprint(canonicalJson({ body: row.body ?? "" }));
}

export function longAnswerDraftRevision(row) {
  return fingerprint(
    canonicalJson({
      body: row.body ?? "",
      selfScore: row.self_score ?? 0,
      practised: row.practised ?? false,
    }),
  );
}

export function codeDraftRevision(row) {
  return fingerprint(canonicalJson({ code: row.code ?? "", stdin: row.stdin ?? "" }));
}
