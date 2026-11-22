// Cloud persistence for one signed-in student (Supabase JS data API).
//
// Responsibilities:
//   * load the student's profile, pack/subject selection, preferences, exams,
//     plan, progress, revision, notes, drafts, code and quiz attempts;
//   * save records with the revision the client loaded (optimistic
//     concurrency — the database refuses a stale write);
//   * resolve stable keys to topic UUIDs and report unknown/ambiguous keys;
//   * expose errors in a shape sync.js understands.
//
// Ownership is never sent: the database derives it from the session, and the
// policies reject a payload that claims another user.

import { createQueue, pendingEntry, drainQueue, isConflictError, isOfflineError } from "./sync.js";
import {
  topicProgressRevision,
  revisionRecordRevision,
  noteRevision,
  longAnswerDraftRevision,
  codeDraftRevision,
  quizAttemptRevision,
} from "./records.js";

export function createRemoteStore({ client, userId, packId, onStatus = () => { } }) {
  if (!client || !userId) throw new Error("remote store needs a client and a user");
  let queue = null;
  let revisions = new Map();

  /** PostgREST reports a refused statement through its error object. */
  function wrap(error) {
    const wrapped = new Error(error?.message || "request failed");
    wrapped.code = error?.code;
    wrapped.details = error?.details;
    wrapped.hint = error?.hint;
    wrapped.status = error?.status;
    return wrapped;
  }

  async function select(table, columns, extra = {}) {
    let query = client.from(table).select(columns);
    for (const [key, value] of Object.entries(extra)) query = query.eq(key, value);
    const { data, error } = await query;
    if (error) throw wrap(error);
    return data || [];
  }

  function recordKey(type, row) {
    if (type === "code_drafts") return row.language;
    if (type === "long_answer_drafts") return row.answer_key;
    if (type === "topic_progress" || type === "revision_records" || type === "notes") return row.topic_key;
    return row.id;
  }

  const store = {
    userId,
    packId,
    get pending() {
      return queue?.size || 0;
    },

    /** Resolve keys to UUIDs. Unknown and ambiguous keys are returned, not lost. */
    async resolveKeys(keys = []) {
      if (!keys.length) return { resolved: new Map(), unknown: [], ambiguous: [] };
      const { data, error } = await client.rpc("topic_ids_for_keys", { p_keys: keys });
      if (error) throw wrap(error);
      const resolved = new Map();
      const ambiguous = [];
      for (const row of data || []) {
        if (row.ambiguous) ambiguous.push(row.key);
        else resolved.set(row.key, row.id);
      }
      const unknown = keys.filter((k) => !resolved.has(k) && !ambiguous.includes(k));
      return { resolved, unknown, ambiguous };
    },

    /** Everything the dashboard needs for this student, in parallel. */
    async loadAll() {
      const [profile, packs, subjects, preferences, exams, plans, sessions, progress, revisions_, notes, drafts, code, attempts, answers, settings] =
        await Promise.all([
          select("profiles", "*"),
          select("course_pack_summaries", "*"),
          select("user_subjects", "*", { pack_id: packId }),
          select("study_preferences", "*", { pack_id: packId }),
          select("exams", "*", { pack_id: packId }),
          select("plans", "*", { pack_id: packId }),
          select("study_sessions", "*"),
          select("topic_progress", "*"),
          select("revision_records", "*"),
          select("notes", "*"),
          select("long_answer_drafts", "*"),
          select("code_drafts", "*"),
          select("quiz_attempts", "*"),
          select("quiz_answers", "*"),
          select("student_settings", "*"),
        ]);
      // Remember the revision of every row we loaded, so saves can prove which
      // version of a record they are based on.
      revisions = new Map();
      for (const row of progress) revisions.set(`topic_progress:${recordKey("topic_progress", row)}`, topicProgressRevision(row));
      for (const row of revisions_) revisions.set(`revision_records:${recordKey("revision_records", row)}`, revisionRecordRevision(row));
      for (const row of notes) revisions.set(`notes:${recordKey("notes", row)}`, noteRevision(row));
      for (const row of drafts) revisions.set(`long_answer_drafts:${recordKey("long_answer_drafts", row)}`, longAnswerDraftRevision(row));
      for (const row of code) revisions.set(`code_drafts:${recordKey("code_drafts", row)}`, codeDraftRevision(row));
      for (const row of attempts) revisions.set(`quiz_attempts:${recordKey("quiz_attempts", row)}`, quizAttemptRevision(row));

      const currentPlan = plans.find((p) => p.status === "active") || null;
      return {
        profile: profile[0] || null,
        packs,
        subjects,
        preferences: preferences[0] || null,
        exams,
        plan: currentPlan,
        sessions: currentPlan ? sessions.filter((s) => s.plan_id === currentPlan.id) : [],
        progress,
        revisions: revisions_,
        notes,
        longDrafts: drafts,
        code,
        attempts,
        answers,
        settings: settings[0] || null,
      };
    },

    revisionFor(table, key) {
      return revisions.get(`${table}:${key}`) ?? null;
    },

    /**
     * Save one record now. Throws the database error so sync.js can classify a
     * stale write (code 40001 / "stale update").
     */
    async save(table, payload, { baseRevision, upsert = true } = {}) {
      const rows = Array.isArray(payload) ? payload : [payload];
      const { data, error } = await client
        .from(table)
        .upsert(rows, { onConflict: onConflictFor(table), ignoreDuplicates: !upsert })
        .select("*");
      if (error) throw wrap(error);
      for (const row of data || [])
        revisions.set(`${table}:${recordKey(table, row)}`, revisionOf(table, row));
      return data;
    },

    /** Update a topic progress row using the revision the client holds. */
    async saveProgress({ topicKey, topicId, status, notes = "", excluded = false, completedAt = null }) {
      const revision = revisions.get(`topic_progress:${topicKey}`);
      const payload = {
        topic_key: topicKey,
        topic_id: topicId || null,
        status,
        notes_summary: notes.slice(0, 500),
        excluded,
        completed_at: completedAt ? new Date(completedAt).toISOString() : null,
      };
      const { data, error } = await client
        .from("topic_progress")
        .upsert(payload, { onConflict: "user_id,topic_key" })
        .select("*");
      if (error) throw wrap(error);
      if (data?.[0]) revisions.set(`topic_progress:${topicKey}`, topicProgressRevision(data[0]));
      return data?.[0] || null;
    },

    async saveSettings(settings, revision) {
      const { data, error } = await client.rpc("save_student_settings", {
        p_settings: settings,
        p_revision: revision || "v1",
      });
      if (error) throw wrap(error);
      return Array.isArray(data) ? data[0] : data;
    },

    async saveProfile(patch) {
      const { data, error } = await client.from("profiles").update(patch).select("*");
      if (error) throw wrap(error);
      return data?.[0] || null;
    },

    async completeOnboarding({ displayName, subjectKeys }) {
      const { data, error } = await client.rpc("complete_onboarding", {
        p_display_name: displayName,
        p_pack_id: packId,
        p_subject_keys: subjectKeys,
      });
      if (error) throw wrap(error);
      return data;
    },

    /** Queue a save and flush with debouncing; returns the current status. */
    enqueue({ table, recordKey: key, payload, baseRevision = null, kind = "upsert" }) {
      if (!queue) throw new Error("queue not started");
      return queue.push(
        pendingEntry({ accountKey: userId, table, recordKey: key, payload, baseRevision, op: kind }),
      );
    },

    startQueue({ storage, debounceMs = 900 } = {}) {
      queue = createQueue({ accountKey: userId, storage });
      queue.onChange((snapshot) => onStatus({ queued: snapshot.size }));
      const flush = async () => {
        if (!queue.size) return onStatus({ state: "idle" });
        onStatus({ state: "saving", queued: queue.size });
        const result = await drainQueue(queue, (entry) =>
          store.save(entry.table, entry.payload, { baseRevision: entry.baseRevision }),
        );
        if (result.conflicts.length) {
          onStatus({ state: "conflict", conflicts: result.conflicts });
          return;
        }
        onStatus({ state: queue.size ? "offline" : "saved", queued: queue.size });
      };
      return {
        queue,
        flush,
        schedule: () => queue.schedule(flush, debounceMs),
        /** Retry after the browser reports it is back online. */
        retry: flush,
      };
    },
  };
  return store;
}

function onConflictFor(table) {
  switch (table) {
    case "topic_progress":
    case "revision_records":
      return "user_id,topic_key";
    case "notes":
      return "user_id,topic_key";
    case "long_answer_drafts":
      return "user_id,answer_key";
    case "code_drafts":
      return "user_id,language";
    case "user_subjects":
      return "user_id,pack_id,subject_key";
    case "quiz_answers":
      return "user_id,attempt_id,question_key";
    default:
      return "id";
  }
}

function revisionOf(table, row) {
  switch (table) {
    case "topic_progress":
      return topicProgressRevision(row);
    case "revision_records":
      return revisionRecordRevision(row);
    case "notes":
      return noteRevision(row);
    case "long_answer_drafts":
      return longAnswerDraftRevision(row);
    case "code_drafts":
      return codeDraftRevision(row);
    case "quiz_attempts":
      return quizAttemptRevision(row);
    default:
      return null;
  }
}

export { isConflictError, isOfflineError };
