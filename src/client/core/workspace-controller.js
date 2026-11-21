// Workspace controller: connects auth, guest/cloud persistence, pack selection
// and the feature modules.
//
// Design rule: features keep calling app.save()/app.render() exactly as before.
// This controller makes those calls mean "persist through the right store" and
// rebuilds app.SUBJECTS / app.TOPICS / app.LONG when the subject selection
// changes, so every page honours the selection without per-page rewrites.

import { CONFIG } from "./config.js";
import { createAuthController, describeAuthError, AUTH_EVENTS } from "./auth.js";
import { buildPackView, packCatalogue, AUTH_STATUS_LABEL, SYNC_LABEL } from "./workspace.js";
import { normalizeProfile, normalizePreferences, initialsOf } from "./profile.js";
import { browserStorage, readAccountCache, writeAccountCache, clearAccountCache, createQueueStorage, accountStorageKey } from "./storage.js";
import {
  LEGACY_STORAGE_KEY,
  runGuestMigration,
  planImport,
  upgradeGuestState,
} from "./migration.js";
import { createRemoteStore } from "./remote.js";
import { resolveKeys } from "./keys.js";
import { localISODate } from "./dates.js";
import { PACKS, DEFAULT_PACK_ID } from "../../content/packs/index.js";
import { pendingEntry } from "./sync.js";

const DRAFT_DEBOUNCE_MS = 900;

export function createWorkspace(app, { config = CONFIG, storage = browserStorage(), queueStorage = null, auth } = {}) {
  const packCatalog = packCatalogue(PACKS);
  const state = {
    mode: "guest", // guest | cloud
    profile: normalizeProfile({}),
    preferences: normalizePreferences({}),
    packId: DEFAULT_PACK_ID,
    subjectKeys: [],
    syncState: "idle",
    queuedCount: 0,
    authState: { status: "idle", reason: "", user: null, session: null, expired: false },
    cloudAvailable: config.enabled,
    unmapped: [],
  };

  const authController =
    auth ||
    createAuthController({
      config,
      loadSdk: config.enabled
        ? undefined
        : async () => {
          throw Object.assign(new Error(config.reason), { code: "not-configured" });
        },
    });

  let remote = null;
  let sync = null;
  let view = null;
  let guestSaveTimer = null;

  // ---------------------------------------------------------------- selection

  function applyView({ rerender = true } = {}) {
    view = buildPackView({ packId: state.packId, subjectKeys: state.subjectKeys, packs: PACKS });
    app.PACK = view.pack;
    app.PACK_ID = view.packId;
    app.SUBJECTS = view.subjects;
    app.TOPICS = view.topics;
    app.CURRICULUM = view.curriculum;
    app.LONG = view.long;
    app.CHAPTER_BANK = view.chapter;
    app.SHORT_BANK = view.short;
    app.QUIZ_BANK = view.quiz;
    app.SUBJECT_KEYS = view.subjectKeys;
    app.profile = state.profile;
    app.initials = initialsOf(state.profile.displayName);
    app.RESOURCES = Object.fromEntries(
      (view.pack.subjects || [])
        .filter((s) => view.subjectKeys.includes(s.subject.key))
        .map((s) => [s.subject.key, s.resources]),
    );
    app.EXAM_UNITS = Object.fromEntries(
      (view.pack.subjects || []).map((s) => [s.subject.key, s.curriculum?.examUnits || []]),
    );
    // Guard against a filter pointing at a subject the student just hid.
    if (app.subjectFilter !== "all" && !view.subjectKeys.includes(app.subjectFilter))
      app.subjectFilter = "all";
    if (rerender && app.render) app.render();
  }

  function setSelection({ packId, subjectKeys }, { persist = true } = {}) {
    state.packId = packId || state.packId;
    state.subjectKeys = subjectKeys;
    applyView();
    if (persist) persistSelection();
  }

  function persistSelection() {
    if (state.mode === "cloud" && remote) {
      remote
        .completeOnboarding({ displayName: state.profile.displayName, subjectKeys: state.subjectKeys })
        .catch((error) => app.toast?.(describeAuthError(error)));
    } else {
      const next = { ...app.s, packId: state.packId, subjectKeys: state.subjectKeys, profile: state.profile, preferences: state.preferences };
      app.s = next;
      app.save({ local: true });
    }
  }

  // ---------------------------------------------------------------- guest store

  function loadGuest() {
    let parsed = {};
    try {
      parsed = JSON.parse(storage.getItem(LEGACY_STORAGE_KEY) || "{}");
    } catch {
      parsed = {};
    }
    const pack = PACKS.find((p) => p.id === (parsed.packId || DEFAULT_PACK_ID)) || PACKS[0];
    const { state: upgraded, report } = upgradeGuestState(parsed, pack);
    state.unmapped = upgraded.unmapped || [];
    state.profile = normalizeProfile(upgraded.profile || {});
    state.preferences = normalizePreferences(upgraded.preferences || {});
    state.packId = upgraded.packId || pack.id;
    state.subjectKeys = Array.isArray(upgraded.subjectKeys)
      ? upgraded.subjectKeys.filter((k) => pack.subjects.some((s) => s.subject.key === k))
      : pack.subjects.map((s) => s.subject.key);
    if (!state.subjectKeys.length) state.subjectKeys = pack.subjects.map((s) => s.subject.key);
    app.s = { ...app.s, ...upgraded };
    app.s.packId = state.packId;
    app.s.subjectKeys = state.subjectKeys;
    app.s.profile = state.profile;
    app.s.preferences = state.preferences;
    if (report.unmapped.length && app.toast)
      app.toast(`${report.unmapped.length} saved item(s) use older ids and are kept for recovery.`);
    applyView({ rerender: false });
  }

  // ---------------------------------------------------------------- cloud store

  /** Turn cloud rows into the same `app.s` shape the features already use. */
  function stateFromCloud(payload) {
    const pack = PACKS.find((p) => p.id === state.packId) || PACKS[0];
    const s = { ...app.s };
    s.status = {};
    s.completedAt = {};
    s.notesSummary = {};
    s.excluded = {};
    for (const row of payload.progress || []) {
      s.status[row.topic_key] = row.status;
      if (row.completed_at) s.completedAt[row.topic_key] = new Date(row.completed_at).getTime();
      if (row.notes_summary) s.notesSummary[row.topic_key] = row.notes_summary;
      if (row.excluded) s.excluded[row.topic_key] = true;
    }
    s.reviews = {};
    s.confidence = {};
    s.revisionNotes = {};
    for (const row of payload.revisions || []) {
      s.reviews[row.topic_key] = new Date(row.revised_at).getTime();
      if (row.confidence) s.confidence[row.topic_key] = row.confidence;
      if (row.note) s.revisionNotes[row.topic_key] = row.note;
    }
    s.notes = {};
    for (const row of payload.notes || []) s.notes[row.topic_key] = row.body;
    s.longDrafts = {};
    s.longScores = {};
    s.longDone = {};
    for (const row of payload.longDrafts || []) {
      s.longDrafts[row.answer_key] = row.body;
      if (row.self_score !== null) s.longScores[row.answer_key] = row.self_score;
      if (row.practised) s.longDone[row.answer_key] = true;
    }
    s.lab = s.lab || { language: "python", drafts: {}, inputs: {} };
    s.lab.drafts = {};
    s.lab.inputs = {};
    for (const row of payload.code || []) {
      s.lab.drafts[row.language] = row.code;
      s.lab.inputs[row.language] = row.stdin;
    }
    s.history = (payload.attempts || []).map((row) => ({
      id: row.id,
      subjectId: row.subject_key,
      score: row.correct_count,
      total: row.question_count,
      at: row.completed_at ? new Date(row.completed_at).getTime() : new Date(row.started_at).getTime(),
    }));
    s.settingsRevision = payload.settings?.revision || "v1";
    return s;
  }

  async function enterCloud(session) {
    state.mode = "cloud";
    state.authState = { ...authController.state, user: session.user, session };
    // Everything is namespaced by account: logout or a switch cannot leak data.
    const cache = readAccountCache(storage, session.user.id, "state");
    if (cache) {
      app.s = { ...app.s, ...cache, accountId: session.user.id };
    }
    remote = createRemoteStore({ client: await getClient(), userId: session.user.id, packId: state.packId, onStatus: onSyncStatus });
    sync = remote.startQueue({ storage: queueStorage || createQueueStorage({ fallback: storage }), debounceMs: DRAFT_DEBOUNCE_MS });
    setSyncState(cache ? "saved" : "saving");
    let payload;
    try {
      payload = await remote.loadAll();
    } catch (error) {
      setSyncState("offline");
      app.toast?.("Could not reach your account. Showing saved work from this device.");
      applyView({ rerender: true });
      return;
    }
    if (!payload.profile?.onboarding_completed_at) {
      app.openOnboarding?.({ reason: "new-account" });
    } else {
      state.profile = normalizeProfile({
        displayName: payload.profile.display_name,
        institution: payload.profile.institution,
        programme: payload.profile.programme,
        branch: payload.profile.branch,
        semester: payload.profile.semester,
        explanationLanguage: payload.profile.explanation_language,
        onboardingCompletedAt: payload.profile.onboarding_completed_at,
      });
      const selected = (payload.subjects || []).filter((r) => r.selected).map((r) => r.subject_key);
      state.packId = (payload.packs || []).find((p) => p.id === (payload.plan?.pack_id || state.packId))?.id || state.packId;
      state.subjectKeys = selected.length ? selected : PACKS[0].subjects.map((s) => s.subject.key);
      state.preferences = normalizePreferences({
        hoursPerDay: payload.preferences?.hours_per_day,
        planDays: payload.preferences?.plan_days,
        scope: payload.preferences?.scope,
        studyDays: payload.preferences?.study_days,
        excludeDone: payload.preferences?.exclude_done,
      });
    }
    app.s = stateFromCloud(payload);
    app.s.profile = state.profile;
    app.s.preferences = state.preferences;
    app.s.packId = state.packId;
    app.s.subjectKeys = state.subjectKeys;
    app.s.accountId = session.user.id;
    applyView({ rerender: false });
    setSyncState("saved");
    if (app.render) app.render();
    // Offer the explicit import only when this account has guest data to offer.
    if (hasGuestProgress()) app.notifyGuestImport?.();
  }

  async function getClient() {
    // The auth controller owns the SDK instance; ask it for the same client so
    // the session and the data API never diverge.
    return authController.getClient ? authController.getClient() : null;
  }

  function leaveCloud({ forget = false } = {}) {
    const previous = app.s.accountId;
    state.mode = "guest";
    remote = null;
    sync = null;
    if (previous) {
      // Keep a cache for a fast return, but only under this account's namespace
      // and only if the student did not ask to forget it.
      if (!forget) writeAccountCache(storage, previous, "state", { ...app.s });
      else clearAccountCache(storage, previous);
    }
    app.s = { ...app.s };
    delete app.s.accountId;
    app.s.status ||= {};
    loadGuest();
  }

  function hasGuestProgress() {
    const s = app.s;
    const count = (o) => (o && typeof o === "object" ? Object.keys(o).filter((k) => k.includes(":")).length : 0);
    return count(s.status) + count(s.notes) + count(s.reviews) + count(s.longDrafts) > 0;
  }

  // ---------------------------------------------------------------- save path

  function queueCloudSave(patch) {
    if (!sync) return;
    for (const [table, recordKey, payload] of patch) {
      sync.queue.push(
        pendingEntry({ accountKey: authController.state.user.id, table, recordKey, payload, baseRevision: remote.revisionFor(table, recordKey) }),
      );
    }
    sync.schedule();
  }

  function onSyncStatus(status) {
    if (status.queued !== undefined) state.queuedCount = status.queued;
    if (status.state) setSyncState(status.state);
    if (status.conflicts?.length) app.showConflict?.(status.conflicts);
    app.updateSyncChip?.();
  }

  function setSyncState(next) {
    state.syncState = next;
    app.syncState = next;
    app.syncLabel = SYNC_LABEL[next] || "";
    app.updateSyncChip?.();
  }

  /**
   * app.save() replacement. Guest storage stays synchronous and local; in cloud
   * mode the *canonical* copy is the database, and the local copy is a cache.
   */
  function installSave() {
    const originalSave = app.save;
    app.save = function save(detail = {}) {
      if (state.mode === "guest" || detail.local) {
        originalSave();
        return;
      }
      // Cache immediately so a reload never loses typed text…
      writeAccountCache(storage, app.s.accountId, "state", { ...app.s });
      // …and persist through the queue with debouncing.
      setSyncState(sync?.queue.size ? "saving" : "saving");
      const pending = typeof app.collectPendingWrites === "function" ? app.collectPendingWrites(detail) : [];
      queueCloudSave(pending);
    };
  }

  /** Map an app-level write to database rows. Feature modules call this. */
  app.persistWrite = function persistWrite(kind, payload) {
    if (state.mode !== "cloud" || !remote) return;
    const packId = state.packId;
    const table = { progress: "topic_progress", note: "notes", revision: "revision_records", longDraft: "long_answer_drafts", code: "code_drafts", attempt: "quiz_attempts" }[kind];
    if (!table) return;
    let recordKey;
    let row;
    if (kind === "progress") {
      recordKey = payload.key;
      row = { topic_key: payload.key, status: payload.status, notes_summary: payload.notes || "", excluded: !!payload.excluded, completed_at: payload.completedAt ? new Date(payload.completedAt).toISOString() : null };
    } else if (kind === "note") {
      recordKey = payload.key;
      row = { pack_id: packId, topic_key: payload.key, body: String(payload.body || "").slice(0, 10000) };
    } else if (kind === "revision") {
      recordKey = payload.key;
      row = { topic_key: payload.key, revised_at: new Date(payload.at).toISOString(), confidence: payload.confidence ?? null, note: payload.note || "" };
    } else if (kind === "longDraft") {
      recordKey = payload.key;
      row = { pack_id: packId, answer_key: payload.key, body: String(payload.body || "").slice(0, 50000), self_score: payload.score ?? null, practised: !!payload.practised };
    } else if (kind === "code") {
      recordKey = payload.language;
      row = { pack_id: packId, language: payload.language, code: String(payload.code || "").slice(0, 30000), stdin: String(payload.stdin || "").slice(0, 8000) };
    } else if (kind === "attempt") {
      recordKey = payload.id;
      row = { id: payload.id, pack_id: packId, subject_key: payload.subjectKey || null, question_count: payload.total, correct_count: payload.score, completed_at: payload.at ? new Date(payload.at).toISOString() : null };
    }
    sync?.queue.push(pendingEntry({ accountKey: app.s.accountId, table, recordKey, payload: row, baseRevision: remote.revisionFor(table, recordKey) })).then(() => sync.schedule());
  };

  // ---------------------------------------------------------------- auth wiring

  authController.subscribe((authState, event) => {
    state.authState = authState;
    app.authState = authState;
    app.authLabel = labelFor(authState, state);
    if (event === AUTH_EVENTS.session && authState.session) enterCloud(authState.session);
    if (event === AUTH_EVENTS.ready && authState.session) enterCloud(authState.session);
    if (event === AUTH_EVENTS.signedOut && state.mode === "cloud") leaveCloud({ forget: false });
    app.updateSyncChip?.();
    app.renderAccountChrome?.();
  });

  function labelFor(authState, s) {
    if (!authState || authState.status === "unavailable") return AUTH_STATUS_LABEL.unconfigured;
    if (authState.status === "loading") return AUTH_STATUS_LABEL.loading;
    if (authState.expired) return AUTH_STATUS_LABEL.expired;
    if (authState.user) return s.syncState === "offline" ? AUTH_STATUS_LABEL.offline : AUTH_STATUS_LABEL.signedIn;
    return AUTH_STATUS_LABEL.guest;
  }

  // ---------------------------------------------------------------- migration

  function upgradeGuestStorage() {
    try {
      return runGuestMigration(storage, PACKS.find((p) => p.id === state.packId) || PACKS[0], {
        validate: (parsed) => !!parsed && typeof parsed === "object" && !!parsed.status,
      });
    } catch {
      return { ran: false, reason: "error" };
    }
  }

  function buildImportPreview(cloudPayload) {
    if (!remote) return null;
    const guest = app.s;
    const pack = PACKS.find((p) => p.id === state.packId) || PACKS[0];
    const topicKeys = new Set([...Object.keys(guest.status || {}), ...Object.keys(guest.notes || {})]);
    const { resolved } = resolveKeys([...topicKeys], pack);
    return planImport(
      guest,
      {
        topicKeys: (cloudPayload?.progress || []).map((r) => r.topic_key),
        noteKeys: (cloudPayload?.notes || []).map((r) => r.topic_key),
      },
      pack,
    );
  }

  /** Explicit, confirmed import. Never runs automatically. */
  async function importGuestData(choice = "newer") {
    if (state.mode !== "cloud" || !remote) throw new Error("Sign in before importing guest progress.");
    const preview = app.importPreview || buildImportPreview(await remote.loadAll());
    if (!preview) throw new Error("Nothing to import.");
    const results = { imported: 0, skipped: preview.skipped.length, failed: 0 };
    const now = new Date().toISOString();
    for (const record of preview.records) {
      try {
        if (record.overlap && choice === "cloud") {
          results.skipped++;
          continue;
        }
        const row = {
          topic_key: record.key,
          status: record.status || "not-started",
          notes_summary: record.note ? record.note.slice(0, 500) : "",
          completed_at: record.completedAt ? new Date(record.completedAt).toISOString() : null,
        };
        await remote.save("topic_progress", row, { baseRevision: null });
        if (record.note) {
          await remote.save("notes", { pack_id: state.packId, topic_key: record.key, body: record.note }).catch(() => { });
        }
        if (record.reviewedAt) {
          await remote.save("revision_records", { topic_key: record.key, revised_at: new Date(record.reviewedAt).toISOString() }).catch(() => { });
        }
        results.imported++;
      } catch (error) {
        results.failed++;
      }
    }
    writeAccountCache(storage, app.s.accountId, "import", { at: now, results });
    app.s.guestImport = { at: now, results, selfReported: true };
    writeAccountCache(storage, app.s.accountId, "state", { ...app.s });
    return results;
  }

  // ---------------------------------------------------------------- public API

  const workspace = {
    state,
    get view() {
      return view;
    },
    get remote() {
      return remote;
    },
    get auth() {
      return authController;
    },
    /** The SDK instance, once initialised (same object the session lives on). */
    getClient: () => authController.client?.() ?? null,
    packCatalog,
    applyView,
    setSelection,
    loadGuest,
    enterCloud,
    leaveCloud,
    installSave,
    upgradeGuestStorage,
    buildImportPreview,
    importGuestData,
    hasGuestProgress,
    labelFor,
    flush: async () => {
      if (sync) await sync.flush();
    },
    statusFor: () => labelFor(state.authState, state),
    async init() {
      const migrated = upgradeGuestStorage();
      loadGuest();
      installSave();
      if (migrated.ran && app.toast)
        app.toast("Your earlier saved progress was upgraded. The original is kept as a backup.");
      try {
        await authController.init();
      } catch (error) {
        // Authentication must never stop the study tools from working.
        console.warn("Authentication unavailable:", String(error?.message || error));
      }
      return workspace;
    },
    destroy() {
      authController.destroy?.();
    },
  };
  app.workspace = workspace;
  app.authController = authController;
  app.loadGuest = () => workspace.loadGuest();
  return workspace;
}
