// Account UI behaviour: auth dialogs, onboarding, profile editor, conflict
// recovery and guest import. Rendering lives in ./render.js; this module owns
// interaction state and orchestration, and keeps every message honest.
import {
  renderAuth,
  renderOnboarding,
  renderProfileForm,
  renderSubjectEditor,
  renderImportPreview,
  renderAccountSettings,
  escapeAttr,
} from "./index.js";
import { validateProfile, normalizeProfile, normalizePreferences, validatePreferences } from "../../core/profile.js";
import { describeAuthError, classifyAuthError } from "../../core/auth.js";
import { buildPackView } from "../../core/workspace.js";
import { isDateString, localISODate, addDays } from "../../core/dates.js";

export function register(app) {
  const ui = {
    mode: "signin",
    busy: false,
    form: {},
    onboarding: null,
    importPreview: null,
  };

  const dialog = (id) => document.getElementById(id);

  app.openAuth = function openAuth(mode = "signin") {
    ui.mode = mode;
    ui.form = { ...ui.form, error: null, notice: null, fieldErrors: {} };
    const d = dialog("authDialog");
    d.innerHTML = renderAuth(app.ctxForAccount(), ui.mode);
    if (!d.open) d.showModal();
    document.getElementById("authEmail")?.focus();
  };

  app.ctxForAccount = function ctxForAccount() {
    return {
      authState: app.authState || { status: "idle", reason: "", user: null },
      authForm: ui.form,
      authBusy: ui.busy,
      onboarding: ui.onboarding || {},
      packCatalog: app.workspace.packCatalog,
      profile: app.s.profile || normalizeProfile({}),
      profileErrors: {},
      subjectSelection: app.SUBJECT_KEYS,
      activePackId: app.PACK_ID,
      syncState: app.syncLabel || "",
      queuedCount: app.workspace?.state.queuedCount || 0,
      importPreview: ui.importPreview,
    };
  };

  /** Re-render whatever account surface is currently open. */
  app.renderAccountChrome = function renderAccountChrome() {
    for (const [id, render] of [
      ["authDialog", () => (ui.onboarding?.open ? renderOnboarding(app.ctxForAccount()) : renderAuth(app.ctxForAccount(), ui.mode))],
      ["migrateDialog", () => (app.workspace ? renderImportPreview(app.ctxForAccount()) : "")],
    ]) {
      const d = dialog(id);
      if (d?.open) d.innerHTML = render();
    }
  };

  // ------------------------------------------------------------------ helpers

  async function perform(fn, { success } = {}) {
    ui.busy = true;
    ui.form.error = null;
    app.renderAccountChrome();
    try {
      const result = await fn();
      if (success) ui.form = { ...ui.form, notice: success, noticeKind: "success" };
      return result;
    } catch (error) {
      const line = classifyAuthError(error);
      ui.form = { ...ui.form, error: line, notice: null };
      return null;
    } finally {
      ui.busy = false;
      app.renderAccountChrome();
    }
  }

  function validateAuthFields(data, mode) {
    const errors = {};
    const email = String(data.get("authEmail") || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.authEmail = "Enter a valid email address.";
    if (mode !== "reset") {
      const password = String(data.get("authPassword") || "");
      if (password.length < 8) errors.authPassword = "Use at least 8 characters.";
      if (mode === "signup" && password !== String(data.get("authPasswordConfirm") || ""))
        errors.authPasswordConfirm = "The two passwords do not match.";
    }
    return { errors, email, password: String(data.get("authPassword") || "") };
  }

  // ------------------------------------------------------------------ actions

  app.submitAuth = async function submitAuth(mode, data) {
    const { errors, email, password } = validateAuthFields(data, mode);
    ui.form = { ...ui.form, values: { authEmail: email }, fieldErrors: errors, error: null };
    if (Object.keys(errors).length) return app.renderAccountChrome();
    const auth = app.authController;
    await perform(async () => {
      if (mode === "signup") {
        const result = await auth.signUp({ email, password });
        if (result.needsConfirmation) {
          ui.form = {
            ...ui.form,
            mode: "signin",
            notice: "Account created. Open the confirmation email, then sign in here.",
            noticeKind: "success",
            values: { authEmail: email },
          };
        } else {
          await app.workspace.enterCloud(auth.state.session);
          dialog("authDialog").close();
        }
      } else if (mode === "reset") {
        await auth.requestPasswordReset(email);
        ui.form = { ...ui.form, resetSent: true, resetEmail: email };
      } else {
        await auth.signIn({ email, password });
        await app.workspace.enterCloud(auth.state.session);
        dialog("authDialog").close();
        app.toast?.("Signed in. Your work will sync to this account.");
      }
    });
  };

  app.authSignOut = async function authSignOut() {
    const id = app.s.accountId;
    await perform(async () => {
      await app.authController.signOut({ scope: "local" });
      app.workspace.leaveCloud({ forget: false });
      app.s = { ...app.s, accountId: undefined };
      if (id) app.s = { ...app.s };
    }, { success: "Signed out. This device now shows guest progress." });
    // Never leave the previous student's records visible in this tab.
    if (app.workspace.state.mode === "guest") app.loadGuest();
    app.navigate?.("overview");
    app.toast?.("Signed out. Guest data stays on this device.");
    renderAccountChrome();
  };

  app.authResend = async function authResend() {
    const email = ui.form.values?.authEmail;
    if (!email) return;
    await perform(() => app.authController.resendConfirmation(email), {
      success: "Confirmation email sent again. Check your inbox and spam folder.",
    });
  };

  // ------------------------------------------------------------------ onboarding

  app.openOnboarding = function openOnboarding({ reason } = {}) {
    const pack = app.PACK;
    ui.onboarding = {
      open: true,
      step: 1,
      reason,
      profile: { ...app.s.profile },
      packId: app.PACK_ID,
      subjectKeys: app.SUBJECT_KEYS.length ? [...app.SUBJECT_KEYS] : pack.subjects.map((s) => s.subject.key),
      preferences: normalizePreferences(app.s.preferences || {}),
      exams: [{ title: "Internal assessment", examDate: "" }],
      errors: {},
    };
    const d = dialog("authDialog");
    d.innerHTML = renderOnboarding(app.ctxForAccount());
    if (!d.open) d.showModal();
  };

  app.onboardingBack = function onboardingBack() {
    const current = Number(document.querySelector(".stepper .step.current .step-number")?.textContent || 1);
    if (current <= 1) {
      if (app.workspace.state.mode === "guest") document.getElementById("authDialog").close();
      return;
    }
    app.setOnboardingStep(current - 1);
  };

  app.setOnboardingStep = function setOnboardingStep(step) {
    const state = app.onboardingState;
    if (!state) return;
    state.step = Math.max(1, Math.min(4, step));
    app.renderAccountChrome();
  };

  app.onboardingNext = async function onboardingNext(form, step) {
    const data = new FormData(form);
    const o = ui.onboarding;
    o.errors = {};
    if (step === 1) {
      const profile = normalizeProfile({
        displayName: data.get("displayName"),
        institution: data.get("institution"),
        programme: data.get("programme"),
        branch: data.get("branch"),
        semester: data.get("semester"),
        explanationLanguage: data.get("explanationLanguage"),
      });
      const errors = validateProfile(profile);
      if (errors.displayName) {
        o.errors = errors;
        return renderAccountChrome();
      }
      o.profile = profile;
      o.step = 2;
    } else if (step === 2) {
      const packId = data.get("packId") || o.packId;
      const keys = data.getAll("subjectKeys");
      if (!keys.length) {
        o.error = "Choose at least one subject.";
        return renderAccountChrome();
      }
      o.packId = packId;
      o.subjectKeys = keys;
      o.step = 3;
      o.view = undefined;
    } else if (step === 3) {
      const prefs = normalizePreferences({
        hoursPerDay: data.get("hoursPerDay"),
        planDays: data.get("planDays"),
        scope: data.get("scope"),
        studyDays: data.getAll("studyDays"),
      });
      const errors = validatePreferences(prefs);
      const examDate = String(data.get("examDate") || "");
      if (examDate && !isDateString(examDate)) errors.examDate = "Use a valid calendar date.";
      if (Object.keys(errors).length) {
        o.errors = { ...errors, exams: { examDate: errors.examDate } };
        return renderAccountChrome();
      }
      o.preferences = prefs;
      const title = String(data.get("examTitle") || "Internal assessment").slice(0, 120);
      o.exams = examDate ? [{ title, examDate }] : [];
      o.step = 4;
    }
    const pack = app.workspace.packCatalog.find((p) => p.id === o.packId) || app.workspace.packCatalog[0];
    o.view = { ...buildPackView({ packId: o.packId, subjectKeys: o.subjectKeys }), packTitle: pack.title };
    app.onboardingState = o;
    app.renderAccountChrome();
  };

  app.onboardingFinish = async function onboardingFinish() {
    const o = ui.onboarding;
    if (!o) return;
    o.busy = true;
    app.renderAccountChrome();
    try {
      // Guest (or local-first account): store profile, selection and prefs.
      const profile = { ...o.profile, onboardingCompletedAt: new Date().toISOString() };
      app.s.profile = profile;
      app.s.preferences = o.preferences;
      // The workspace owns the profile the sidebar and greeting read, so it
      // must see the finished one before the next render.
      if (app.workspace) {
        app.workspace.state.profile = profile;
        app.workspace.state.preferences = o.preferences;
      }
      app.initials = profile.displayName
        .trim()
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      // Persist the narrowed selection, not just the rendered view: a reload
      // must restore exactly the subjects the student chose.
      app.workspace.setSelection({ packId: o.packId, subjectKeys: o.subjectKeys }, { persist: true });
      app.s.subjectKeys = o.subjectKeys;
      if (app.workspace.state.mode === "cloud" && app.workspace.remote) {
        await app.workspace.remote.completeOnboarding({ displayName: profile.displayName, subjectKeys: o.subjectKeys });
        await app.workspace.remote.saveProfile({
          display_name: profile.displayName,
          institution: profile.institution || null,
          programme: profile.programme || null,
          branch: profile.branch || null,
          semester: profile.semester,
          explanation_language: profile.explanationLanguage,
          onboarding_completed_at: profile.onboardingCompletedAt,
        });
        const exam = o.exams?.[0];
        if (exam) {
          await app.workspace.remote
            .save("exams", { pack_id: o.packId, title: exam.title, exam_date: exam.examDate, subject_keys: o.subjectKeys })
            .catch(() => { });
        }
      }
      // Regenerate the plan for the chosen subjects/dates.
      const start = localISODate();
      app.s.start = start;
      app.s.planPrefs = {
        start,
        days: o.preferences.planDays,
        hours: o.preferences.hoursPerDay,
        scope: o.preferences.scope,
        subjects: o.subjectKeys,
        excludeDone: o.preferences.excludeDone,
      };
      app.s.customPlan = app.buildCustomPlan(app.s.planPrefs);
      app.save({ local: true });
      o.open = false;
      ui.onboarding = null;
      dialog("authDialog").close();
      app.navigate?.("overview");
      app.render();
      app.toast?.(`Welcome, ${profile.displayName}. Your first session is ready.`);
    } catch (error) {
      o.error = describeAuthError(classifyAuthError(error));
      app.renderAccountChrome();
    } finally {
      o.busy = false;
    }
  };

  // ------------------------------------------------------------------ settings

  app.openSettings = function openSettings(tab = "preferences") {
    const d = dialog("settingsDialog");
    d.innerHTML = settingsHtml(tab);
    if (!d.open) d.showModal();
  };

  function settingsHtml(tab) {
    const ctx = app.ctxForAccount();
    const tabs = [
      ["preferences", "Preferences"],
      ["profile", "Profile"],
      ["subjects", "Subjects"],
      ["account", "Account"],
    ];
    return `<div class="dialog-head"><div><span class="label">MAKE IT YOURS</span><h2>Settings</h2></div>
      <button class="icon-btn" data-action="close-settings" aria-label="Close settings">${app.icon("close")}</button></div>
      <div class="dialog-body">
        <div class="tabs" role="tablist" aria-label="Settings sections">${tabs
        .map(
          ([id, label]) =>
            `<button role="tab" id="tab-${id}" aria-selected="${tab === id}" aria-controls="panel-${id}" data-action="settings-tab" data-tab="${id}" class="${tab === id ? "active" : ""}" tabindex="${tab === id ? 0 : -1}">${label}</button>`,
        )
        .join("")}</div>
        ${tab === "preferences" ? preferencesPanel(ctx) : ""}
        ${tab === "profile" ? `<section role="tabpanel" id="panel-profile" aria-labelledby="tab-profile">${renderProfileForm(ctx)}</section>` : ""}
        ${tab === "subjects" ? `<section role="tabpanel" id="panel-subjects" aria-labelledby="tab-subjects">${renderSubjectEditor(ctx)}</section>` : ""}
        ${tab === "account" ? `<section role="tabpanel" id="panel-account" aria-labelledby="tab-account">${renderAccountSettings(ctx)}${backupSection()}</section>` : ""}
      </div>`;
  }

  function preferencesPanel(ctx) {
    const p = ctx.profile;
    return `<section role="tabpanel" id="panel-preferences" aria-labelledby="tab-preferences">
      <form data-profile-form="preferences">
        <div class="field"><label class="flex"><input id="hinglishToggle" type="checkbox" ${p.explanationLanguage === "hi-en" ? "checked" : ""}> Show simple Hinglish explanations</label>
          <small>Applies to topic notes and the assistant. You can also set this during onboarding.</small></div>
        <div class="field"><label for="startDate">Study plan start date</label>
          <input id="startDate" type="date" value="${escapeAttr(app.s.planPrefs?.start || localISODate())}" required>
          <small>Uses your device’s local calendar. Tomorrow is ${escapeAttr(addDays(localISODate(), 1))}.</small></div>
        <button class="text-btn" type="button" data-action="settings-plan">Change plan dates, days & hours ${app.icon("arrow")}</button>
        <div class="dialog-actions"><button class="primary-btn" type="submit">Save preferences</button></div>
      </form>
    </section>`;
  }

  function backupSection() {
    return `<section class="account-block">
      <h2>Your data</h2>
      <p class="small muted">Export a portable copy of the learning state on this device. A backup never contains your password or session token.</p>
      <div class="flex" style="flex-wrap:wrap">
        <button class="outline-btn" data-action="export">${app.icon("download")}Export this device’s progress</button>
        <button class="outline-btn" data-action="import">${app.icon("upload")}Restore from a backup file</button>
        <input type="file" id="importFile" accept="application/json" hidden>
      </div>
      <details style="margin-top:15px"><summary>Guest migration details</summary>
        <p class="small muted">Earlier saved progress is upgraded automatically and the original is kept as an immutable backup. Unmapped ids are preserved and listed in the browser storage key <code>study-sprint:migration-backup:2</code>.</p>
        <p class="small muted">Guest data is never uploaded unless you press “Import guest progress” in the Account tab.</p>
      </details>
    </section>`;
  }

  app.saveProfileForm = async function saveProfileForm(form, kind) {
    const data = new FormData(form);
    if (kind === "profile") {
      const profile = normalizeProfile({
        displayName: data.get("displayName"),
        institution: data.get("institution"),
        programme: data.get("programme"),
        branch: data.get("branch"),
        semester: data.get("semester"),
        explanationLanguage: data.get("explanationLanguage"),
        onboardingCompletedAt: app.s.profile?.onboardingCompletedAt || new Date().toISOString(),
      });
      const errors = validateProfile(profile);
      if (Object.keys(errors).length) {
        app.profileErrors = errors;
        app.openSettings("profile");
        return;
      }
      app.profileErrors = {};
      app.s.profile = profile;
      app.s.hinglish = profile.explanationLanguage === "hi-en";
      if (app.workspace.state.mode === "cloud" && app.workspace.remote) {
        await app.workspace.remote
          .saveProfile({
            display_name: profile.displayName,
            institution: profile.institution || null,
            programme: profile.programme || null,
            branch: profile.branch || null,
            semester: profile.semester,
            explanation_language: profile.explanationLanguage,
            onboarding_completed_at: profile.onboardingCompletedAt,
          })
          .catch(() => app.toast?.("Saved on this device. The profile could not sync yet."));
      }
    } else if (kind === "preferences") {
      app.s.hinglish = document.getElementById("hinglishToggle")?.checked ?? app.s.hinglish;
      app.s.profile = { ...app.s.profile, explanationLanguage: app.s.hinglish ? "hi-en" : "en" };
      const start = document.getElementById("startDate")?.value;
      if (start && isDateString(start)) {
        app.s.start = start;
        app.s.planPrefs = { ...app.s.planPrefs, start };
      }
    } else if (kind === "subjects") {
      const keys = data.getAll("subjectKeys");
      if (!keys.length) {
        app.toast?.("Keep at least one subject selected.");
        return;
      }
      const previous = new Set(app.SUBJECT_KEYS);
      app.workspace.setSelection({ packId: app.PACK_ID, subjectKeys: keys }, { persist: false });
      if (app.workspace.state.mode === "cloud" && app.workspace.remote) {
        await app.workspace.remote
          .completeOnboarding({ displayName: app.s.profile.displayName, subjectKeys: keys })
          .catch(() => app.toast?.("Subject change saved on this device and will sync when possible."));
      }
      const hidden = [...previous].filter((k) => !keys.includes(k));
      if (hidden.length) app.toast?.(`${hidden.length} subject(s) hidden. Their progress is kept.`);
    }
    app.save({ local: true });
    dialog("settingsDialog").close();
    app.render();
    app.toast?.("Settings saved.");
  };

  app.updateSyncChip = function updateSyncChip() {
    const chip = document.getElementById("syncChip");
    if (!chip || !app.workspace) return;
    const mode = app.workspace.state.mode;
    const label =
      mode === "cloud"
        ? app.syncLabel || (app.workspace.state.syncState === "saved" ? "Saved" : "Syncing…")
        : "Saved in this browser";
    chip.textContent = label;
    chip.dataset.state = mode === "cloud" ? app.workspace.state.syncState : "local";
    chip.title =
      mode === "cloud"
        ? "Cloud sync is managed by your account. Pending changes are kept on this device while offline."
        : app.authLabel || "Guest mode: progress is stored only in this browser.";
  };

  // ------------------------------------------------------------------ import

  app.openImport = async function openImport() {
    const d = dialog("migrateDialog");
    if (app.workspace.state.mode !== "cloud") {
      d.innerHTML = `<div class="dialog-head"><h2>Import guest progress</h2>
        <button class="icon-btn" data-action="close-import" aria-label="Close import dialog">${app.icon("close")}</button></div>
        <div class="dialog-body"><div class="banner info" role="note"><strong>Sign in first.</strong>
        <p>Guest progress is imported into a specific account, so nothing is attached to the wrong student.</p></div>
        <div class="dialog-actions"><button class="primary-btn" data-action="auth-open" data-mode="signin">Sign in</button></div></div>`;
      if (!d.open) d.showModal();
      return;
    }
    ui.importPreview = null;
    d.innerHTML = `<div class="dialog-body"><p>Reading your saved guest records…</p></div>`;
    if (!d.open) d.showModal();
    try {
      const payload = await app.workspace.remote.loadAll();
      ui.importPreview = app.workspace.buildImportPreview(payload);
      app.importPreview = ui.importPreview;
      d.innerHTML = renderImportPreview(app.ctxForAccount());
    } catch {
      d.innerHTML = `<div class="dialog-body"><div class="banner error" role="alert">Could not read your account. Check the connection and try again.</div>
        <div class="dialog-actions"><button class="outline-btn" data-action="close-import">Close</button></div></div>`;
    }
  };

  app.confirmImport = async function confirmImport() {
    const choice = document.querySelector('input[name="importChoice"]:checked')?.value || "newer";
    const button = document.querySelector('[data-action="confirm-import"]');
    if (button) {
      button.disabled = true;
      button.textContent = "Importing…";
    }
    try {
      const results = await app.workspace.importGuestData(choice);
      dialog("migrateDialog").innerHTML = `<div class="dialog-head"><h2>Import finished</h2>
        <button class="icon-btn" data-action="close-import" aria-label="Close import dialog">${app.icon("close")}</button></div>
        <div class="dialog-body"><div class="banner success" role="status">
          <strong>${results.imported} record(s) imported.</strong>
          <p>${results.skipped} kept as they were, ${results.failed} could not be sent and remain only on this device.</p>
          <p class="small">Imported progress is your own self-report, not a verified assessment result.</p></div>
        <div class="dialog-actions"><button class="outline-btn" data-action="close-import">Done</button></div></div>`;
      app.s.guestImport = { at: new Date().toISOString(), results, selfReported: true };
      app.applyView?.({ rerender: true });
    } catch (error) {
      app.toast?.(describeAuthError(classifyAuthError(error)));
    }
  };

  // ------------------------------------------------------------------ conflicts

  /**
   * A stale write is never thrown away. The queued edit stays in the conflict
   * list and the student chooses which version wins, so recovery is possible.
   */
  app.showConflict = function showConflict(conflicts) {
    app.pendingConflicts = conflicts.map(({ entry, error }) => ({ entry, error }));
    const d = dialog("authDialog");
    d.innerHTML = `<div class="dialog-head"><div><span class="label">SYNC</span><h2>Another device saved first</h2></div>
      <button class="icon-btn" data-action="close-auth" aria-label="Close">${app.icon("close")}</button></div>
    <div class="dialog-body">
      <p>Your change for <code>${escapeAttr(conflicts[0]?.entry?.recordKey || "a record")}</code> was not applied, because a newer version already exists in your account. Nothing was lost.</p>
      <div class="conflict-actions">
        <button class="primary-btn" data-action="conflict-keep" data-choice="remote">Keep the account version</button>
        <button class="outline-btn" data-action="conflict-keep" data-choice="local">Replace it with my change</button>
        <button class="text-btn" data-action="conflict-keep" data-choice="later">Decide later</button>
      </div>
      <p class="small muted">Choosing “Decide later” keeps your edit on this device until you reopen Account → Sync.</p>
    </div>`;
    if (!d.open) d.showModal();
  };

  app.resolveConflict = async function resolveConflict(choice) {
    const pending = app.pendingConflicts || [];
    if (choice === "later") {
      dialog("authDialog").close();
      return;
    }
    for (const { entry } of pending) {
      if (choice === "local") {
        await app.workspace.remote
          .save(entry.table, entry.payload, { baseRevision: null })
          .catch(() => { });
      }
    }
    app.pendingConflicts = [];
    dialog("authDialog").close();
    app.toast?.(choice === "local" ? "Your change was applied." : "The account version was kept.");
    app.render();
  };

  app.settingsHtml = settingsHtml;
}
