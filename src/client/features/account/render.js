// Account screens: sign in, create an account, confirmation help, password
// reset, edit profile, choose subjects and review guest-data import.
//
// These functions return HTML only; all actions go through data-action
// attributes handled in app/events.js. Every form has a label, a described
// error slot (aria-live) and a real submit button, so keyboard-only use works.

import { LANGUAGE_LABELS, STUDY_DAYS, initialsOf, validateProfile, validatePreferences } from "../../core/profile.js";
import { packCatalogue } from "../../core/workspace.js";
import { describeAuthError, AUTH_MESSAGES } from "../../core/auth.js";
import { isDateString } from "../../core/dates.js";

const field = ({ id, label, value = "", type = "text", required = false, hint = "", error = "", autocomplete, placeholder = "", maxlength = 120, extra = "" }) => `
  <div class="field ${error ? "invalid" : ""}">
    <label for="${id}">${label}${required ? ' <span class="req" aria-hidden="true">*</span>' : ' <span class="muted small">(optional)</span>'}</label>
    <input id="${id}" name="${id}" type="${type}" value="${escapeAttr(value)}" ${required ? "required" : ""}
      ${autocomplete ? `autocomplete="${autocomplete}"` : ""} ${placeholder ? `placeholder="${escapeAttr(placeholder)}"` : ""}
      maxlength="${maxlength}" aria-describedby="${id}-hint ${id}-error" aria-invalid="${error ? "true" : "false"}" ${extra}>
    <small id="${id}-hint">${hint}</small>
    <p class="field-error" id="${id}-error" role="alert">${error || ""}</p>
  </div>`;

const selectField = ({ id, label, options, value, required = false, hint = "", error = "" }) => `
  <div class="field ${error ? "invalid" : ""}">
    <label for="${id}">${label}${required ? ' <span class="req" aria-hidden="true">*</span>' : " <span class=\"muted small\">(optional)</span>"}</label>
    <select id="${id}" name="${id}" ${required ? "required" : ""} aria-describedby="${id}-hint ${id}-error" aria-invalid="${error ? "true" : "false"}">
      ${options.map(([v, l]) => `<option value="${v}" ${String(value ?? "") === String(v) ? "selected" : ""}>${l}</option>`).join("")}
    </select>
    <small id="${id}-hint">${hint}</small>
    <p class="field-error" id="${id}-error" role="alert">${error || ""}</p>
  </div>`;

export function escapeAttr(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function statusBanner(ctx) {
  const auth = ctx.authState;
  if (auth.status === "unavailable" || auth.status === "error") {
    return `<div class="banner warn" role="status" data-auth-detail="${escapeAttr(auth.detail || "")}"><strong>Sign-in is unavailable on this deployment.</strong>
      <p>${escapeAttr(auth.reason || "Cloud accounts are not configured.")} ${escapeAttr(auth.detail || "")} Everything under “Continue as guest” still works.</p></div>`;
  }
  return "";
}

export function renderAuth(ctx, mode = "signin") {
  const { authState, authForm } = ctx;
  const loading = authState?.status === "loading";
  const notice = authForm?.notice
    ? `<div class="banner ${authForm.noticeKind || "info"}" role="status">${escapeAttr(authForm.notice)}</div>`
    : "";
  const error = authForm?.error ? `<div class="banner error" role="alert">${escapeAttr(describeAuthError(authForm.error))}</div>` : "";
  const busy = ctx.authBusy ? 'aria-busy="true"' : "";
  if (mode === "reset") {
    const done = authForm?.resetSent;
    return `
    <div class="dialog-head"><div><span class="label">ACCOUNT</span><h2>Reset your password</h2></div>
      <button class="icon-btn" data-action="close-auth" aria-label="Close account dialog">×</button></div>
    <div class="dialog-body">
      ${statusBanner(ctx)}${notice}${error}
      ${done ? `<div class="banner success" role="status">If an account exists for <strong>${escapeAttr(authForm.resetEmail)}</strong>, a recovery link is on its way. Open it on this device to choose a new password.</div>` : `
      <form id="authForm" data-auth-form="reset" ${busy} novalidate>
        ${field({ id: "authEmail", label: "Email", type: "email", required: true, autocomplete: "email", error: authForm?.fieldErrors?.authEmail, hint: "We’ll email a single-use recovery link." })}
        <div class="dialog-actions"><button class="text-btn" type="button" data-action="auth-mode" data-mode="signin">Back to sign in</button>
          <button class="primary-btn" type="submit" ${loading ? "disabled" : ""}>Send recovery link</button></div>
      </form>`}
    </div>`;
  }
  if (mode === "signup") {
    return `
    <div class="dialog-head"><div><span class="label">ACCOUNT</span><h2>Create your account</h2></div>
      <button class="icon-btn" data-action="close-auth" aria-label="Close account dialog">×</button></div>
    <div class="dialog-body">
      ${statusBanner(ctx)}${notice}${error}
      <p class="small muted">Your progress, notes and drafts will sync privately across your devices. You can still study as a guest.</p>
      <form id="authForm" data-auth-form="signup" ${busy} novalidate>
        ${field({ id: "authEmail", label: "Email", type: "email", required: true, autocomplete: "email", error: authForm?.fieldErrors?.authEmail })}
        ${field({ id: "authPassword", label: "Password", type: "password", required: true, autocomplete: "new-password", hint: "At least 8 characters. Use a password you don’t reuse.", error: authForm?.fieldErrors?.authPassword })}
        ${field({ id: "authPasswordConfirm", label: "Confirm password", type: "password", required: true, autocomplete: "new-password", error: authForm?.fieldErrors?.authPasswordConfirm })}
        <div class="dialog-actions"><button class="text-btn" type="button" data-action="auth-mode" data-mode="signin">I already have an account</button>
          <button class="primary-btn" type="submit" ${loading ? "disabled" : ""}>Create account</button></div>
      </form>
      <details class="account-help"><summary>Already signed up? Need to confirm an email?</summary>
        <p>Confirmation links expire. You can request a fresh one from the sign-in screen.</p></details>
    </div>`;
  }
  return `
    <div class="dialog-head"><div><span class="label">ACCOUNT</span><h2>Sign in</h2></div>
      <button class="icon-btn" data-action="close-auth" aria-label="Close account dialog">×</button></div>
    <div class="dialog-body">
      ${statusBanner(ctx)}${notice}${error}
      <form id="authForm" data-auth-form="signin" ${busy} novalidate>
        ${field({ id: "authEmail", label: "Email", type: "email", required: true, autocomplete: "email", value: authForm?.values?.authEmail, error: authForm?.fieldErrors?.authEmail })}
        ${field({ id: "authPassword", label: "Password", type: "password", required: true, autocomplete: "current-password", error: authForm?.fieldErrors?.authPassword })}
        <div class="dialog-actions"><button class="text-btn" type="button" data-action="auth-mode" data-mode="reset">Forgot password?</button>
          <button class="primary-btn" type="submit" ${loading ? "disabled" : ""}>Sign in</button></div>
      </form>
      <p class="small muted" style="margin-top:14px">No account yet? <button class="text-btn" data-action="auth-mode" data-mode="signup">Create one</button>
        ${authForm?.needsConfirmation ? ` · <button class="text-btn" data-action="auth-resend">Resend confirmation to ${escapeAttr(authForm.values.authEmail)}</button>` : ""}</p>
      <div class="guest-note" role="note"><strong>Continue as guest</strong><p>Guest progress stays on this device and can be imported after you create an account.</p>
        <button class="outline-btn" data-action="auth-guest">Continue as guest</button></div>
    </div>`;
}

/** One reusable onboarding form; `step` decides what is visible. */
export function renderOnboarding(ctx) {
  const { onboarding, packCatalog } = ctx;
  const profile = onboarding.profile || {};
  const errors = onboarding.errors || {};
  const step = onboarding.step || 1;
  const steps = [
    ["You", "Your name and what you’re studying"],
    ["Subjects", "Choose a course pack and subjects"],
    ["Time", "Exam dates and study time"],
    ["Review", "Check it and start"],
  ];
  const stepper = `<ol class="stepper" aria-label="Onboarding steps">${steps.map(([title, desc], i) => {
    const n = i + 1;
    const state = n < step ? "done" : n === step ? "current" : "todo";
    return `<li class="step ${state}" ${n === step ? 'aria-current="step"' : ""}><span class="step-number">${n}</span><div><strong>${title}</strong><span>${desc}</span></div></li>`;
  }).join("")}</ol>`;
  const notice = onboarding.notice ? `<div class="banner info" role="status">${escapeAttr(onboarding.notice)}</div>` : "";
  const error = onboarding.error ? `<div class="banner error" role="alert">${escapeAttr(onboarding.error)}</div>` : "";
  const busy = onboarding.busy ? 'aria-busy="true"' : "";

  if (step === 1) {
    return `${stepper}<form class="onboarding-card card" data-onboarding-form="profile" ${busy} novalidate>
      <h2>Let’s set up your workspace</h2>
      <p class="small muted">Only your display name is required. Everything else helps tailor plans and can be edited later.</p>
      ${notice}${error}
      ${field({ id: "displayName", label: "Display name", required: true, value: profile.displayName === "Student" ? "" : profile.displayName, autocomplete: "nickname", maxlength: 60, error: errors.displayName, hint: "Shown in your sidebar. Use whatever name you prefer." })}
      ${field({ id: "institution", label: "College or institution", value: profile.institution, error: errors.institution })}
      ${field({ id: "programme", label: "Programme", value: profile.programme, error: errors.programme })}
      ${field({ id: "branch", label: "Branch", value: profile.branch, error: errors.branch })}
      ${selectField({ id: "semester", label: "Semester", value: profile.semester ?? "", error: errors.semester, options: [["", "Not specified"], ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => [n, `Semester ${n}`])] })}
      ${selectField({ id: "explanationLanguage", label: "Explanation language", value: profile.explanationLanguage || "en", options: Object.entries(LANGUAGE_LABELS), hint: "For the simple explanations inside topics." })}
      <div class="dialog-actions"><button class="text-btn" type="button" data-action="onboarding-guest">Stay a guest for now</button>
        <button class="primary-btn" type="submit">Continue</button></div>
    </form>`;
  }

  if (step === 2) {
    const selected = new Set(onboarding.subjectKeys || []);
    const packId = onboarding.packId || packCatalog[0]?.id;
    const pack = packCatalog.find((p) => p.id === packId) || packCatalog[0];
    return `${stepper}<form class="onboarding-card card" data-onboarding-form="subjects" ${busy} novalidate>
      <div class="between"><h2>Choose a course pack</h2><span class="tag ${pack?.reviewed ? "done" : "medium"}">${pack?.reviewed ? "Reviewed" : "Authored, not institution-reviewed"}</span></div>
      <div class="pack-list">${packCatalog.map((p) => `<label class="pack-option ${p.id === packId ? "selected" : ""}">
        <input type="radio" name="packId" value="${p.id}" ${p.id === packId ? "checked" : ""}>
        <div><strong>${escapeAttr(p.title)}</strong><span>${escapeAttr(p.description)}</span>
          <small>${p.subjectCount} subjects · ${p.topicCount} topics${p.academicYear ? ` · ${escapeAttr(p.academicYear)}` : ""}</small></div></label>`).join("")}</div>
      <h2 style="margin-top:22px">Subjects in ${escapeAttr(pack?.title || "this pack")}</h2>
      <p class="small muted">Deselect anything you are not studying now. You can change this later without losing saved progress.</p>
      ${error}
      <div class="subject-selection">${(pack?.subjects || []).map((s) => `<label class="subject-choice ${selected.has(s.key) ? "selected" : ""}">
        <input type="checkbox" name="subjectKeys" value="${s.key}" ${selected.has(s.key) ? "checked" : ""}>
        <strong>${escapeAttr(s.name)}</strong><span>${s.topicCount} topics</span></label>`).join("")}</div>
      <div class="dialog-actions"><button class="text-btn" type="button" data-action="onboarding-back">Back</button>
        <button class="primary-btn" type="submit">Use these subjects</button></div>
    </form>`;
  }

  if (step === 3) {
    const prefs = onboarding.preferences || {};
    const exams = onboarding.exams || [];
    const examErrors = errors.exams || {};
    return `${stepper}<form class="onboarding-card card" data-onboarding-form="time" ${busy} novalidate>
      <h2>When does it get real?</h2>
      <p class="small muted">Exam dates use your device’s calendar day and are never converted from UTC.</p>
      ${notice}${error}
      ${field({ id: "examTitle", label: "Exam name", value: exams[0]?.title || "Internal assessment", maxlength: 120, error: examErrors.title, hint: "A short label such as “CIA 2” or “Unit test”." })}
      ${field({ id: "examDate", label: "Exam date", type: "date", required: true, value: exams[0]?.examDate || "", error: examErrors.examDate, hint: "Optional if your dates are not fixed yet." })}
      ${field({ id: "hoursPerDay", label: "Study hours per day", type: "number", value: prefs.hoursPerDay ?? 4, min: 0.5, max: 12, step: 0.5, error: errors.hoursPerDay, hint: "Realistic hours. Breaks and sleep are outside this.", extra: 'min="0.5" max="12" step="0.5"' })}
      ${field({ id: "planDays", label: "Plan length (days)", type: "number", value: prefs.planDays ?? 7, error: errors.planDays, hint: "1–60 days. You can regenerate the plan at any time.", extra: 'min="1" max="60" step="1"' })}
      <fieldset class="study-days"><legend>Study days</legend>${STUDY_DAYS.map((d) => `<label><input type="checkbox" name="studyDays" value="${d}" ${(prefs.studyDays || STUDY_DAYS).includes(d) ? "checked" : ""}> <span>${d[0].toUpperCase()}${d.slice(1)}</span></label>`).join("")}</fieldset>
      ${selectField({ id: "scope", label: "Plan scope", value: prefs.scope || "exam", options: [["exam", "Exam-focus topics only"], ["full", "Full selected syllabus"]], hint: "Exam focus is the pack author’s preparation hint, not an official boundary." })}
      <div class="dialog-actions"><button class="text-btn" type="button" data-action="onboarding-back">Back</button>
        <button class="primary-btn" type="submit">Continue</button></div>
    </form>`;
  }

  const view = onboarding.view;
  return `<div class="onboarding-card card">
    <h2>Ready, ${escapeAttr(profile.displayName || "Student")}?</h2>
    ${notice}
    <dl class="review-list">
      <div><dt>Course pack</dt><dd>${escapeAttr(view.pack.title)} · v${escapeAttr(view.pack.version)}</dd></div>
      <div><dt>Subjects</dt><dd>${view.subjectKeys.length} selected · ${view.topics.length} topics</dd></div>
      <div><dt>Study time</dt><dd>${(onboarding.preferences || {}).hoursPerDay ?? 4} h/day over ${(onboarding.preferences || {}).planDays ?? 7} days</dd></div>
      <div><dt>Exam</dt><dd>${onboarding.exams?.[0]?.examDate && isDateString(onboarding.exams[0].examDate) ? escapeAttr(onboarding.exams[0].title) + " · " + escapeAttr(onboarding.exams[0].examDate) : "Not scheduled"}</dd></div>
      <div><dt>Explanation language</dt><dd>${escapeAttr(LANGUAGE_LABELS[profile.explanationLanguage || "en"])}</dd></div>
    </dl>
    <div class="banner info" role="note">Your first session will be built from these choices. You can edit everything in Account → Profile.</div>
    <div class="dialog-actions"><button class="text-btn" type="button" data-action="onboarding-back">Back</button>
      <button class="primary-btn" type="submit" data-action="onboarding-finish" ${busy}>Start studying</button></div>
  </div>`;
}

export function renderProfileForm(ctx) {
  const { profile, profileErrors } = ctx;
  const errors = profileErrors || {};
  return `<form data-profile-form="profile" novalidate>
    ${field({ id: "displayName", label: "Display name", required: true, value: profile.displayName, error: errors.displayName, maxlength: 60 })}
    ${field({ id: "institution", label: "College or institution", value: profile.institution, error: errors.institution })}
    ${field({ id: "programme", label: "Programme", value: profile.programme, error: errors.programme })}
    ${field({ id: "branch", label: "Branch", value: profile.branch, error: errors.branch })}
    ${selectField({ id: "semester", label: "Semester", value: profile.semester ?? "", error: errors.semester, options: [["", "Not specified"], ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => [n, `Semester ${n}`])] })}
    ${selectField({ id: "explanationLanguage", label: "Explanation language", value: profile.explanationLanguage || "en", options: Object.entries(LANGUAGE_LABELS) })}
    <div class="dialog-actions"><button class="primary-btn" type="submit">Save profile</button></div>
  </form>`;
}

export function renderSubjectEditor(ctx) {
  const { subjectSelection, packCatalog, activePackId } = ctx;
  const selected = new Set(subjectSelection || []);
  const pack = packCatalog.find((p) => p.id === activePackId) || packCatalog[0];
  if (!pack) return `<p class="muted">No course pack is available in this build.</p>`;
  return `<form data-profile-form="subjects" novalidate>
    <p class="small muted">Kept topics stay in your history even after you hide them here.</p>
    <div class="subject-selection">${pack.subjects.map((s) => `<label class="subject-choice ${selected.has(s.key) ? "selected" : ""}">
      <input type="checkbox" name="subjectKeys" value="${s.key}" ${selected.has(s.key) ? "checked" : ""}>
      <strong>${escapeAttr(s.name)}</strong><span>${s.topicCount} topics</span></label>`).join("")}</div>
    <div class="dialog-actions"><button class="primary-btn" type="submit">Save subjects</button></div>
  </form>`;
}

export function renderImportPreview(ctx) {
  const preview = ctx.importPreview;
  if (!preview) return "";
  const rows = preview.records.slice(0, 200);
  return `
    <div class="dialog-head"><div><span class="label">GUEST DATA</span><h2>Import what you saved as a guest</h2></div>
      <button class="icon-btn" data-action="close-import" aria-label="Close import dialog">×</button></div>
    <div class="dialog-body">
      <div class="banner info" role="note"><strong>Nothing is uploaded until you confirm.</strong>
        <p>${escapeAttr(preview.policy)}</p></div>
      <dl class="review-list compact">
        <div><dt>Records found</dt><dd>${preview.total}</dd></div>
        <div><dt>New to this account</dt><dd>${preview.independent}</dd></div>
        <div><dt>Already in this account</dt><dd>${preview.overlapping}</dd></div>
        <div><dt>Cannot be mapped</dt><dd>${preview.skipped.length}</dd></div>
      </dl>
      ${preview.overlapping ? `<fieldset class="import-choice"><legend>For ${preview.overlapping} topic(s) your account already has, which version should win?</legend>
        <label><input type="radio" name="importChoice" value="newer" checked> Keep the most recently updated version</label>
        <label><input type="radio" name="importChoice" value="guest"> Keep the guest version</label>
        <label><input type="radio" name="importChoice" value="cloud"> Keep my account version</label></fieldset>` : ""}
      ${rows.length ? `<details><summary>Show ${rows.length} record(s)</summary>
        <ul class="import-rows">${rows.map((r) => `<li><code>${escapeAttr(r.key)}</code> <span>${r.status ? escapeAttr(r.status) : "note"}</span>${r.overlap ? ' <span class="tag medium">exists</span>' : ""}</li>`).join("")}</ul></details>` : ""}
      ${preview.skipped.length ? `<details><summary>${preview.skipped.length} record(s) cannot be mapped and will stay on this device</summary>
        <ul class="import-rows">${preview.skipped.slice(0, 100).map((s) => `<li><code>${escapeAttr(s.key)}</code> <span>${escapeAttr(s.reason)}</span></li>`).join("")}</ul></details>` : ""}
      <div class="dialog-actions"><button class="text-btn" type="button" data-action="close-import">Not now</button>
        <button class="primary-btn" type="button" data-action="confirm-import" ${preview.total ? "" : "disabled"}>Import ${preview.total} record(s)</button></div>
    </div>`;
}

export function renderAccountSettings(ctx) {
  const { authState, profile, syncState, queuedCount } = ctx;
  const signedIn = !!authState.user;
  return `<section class="account-block">
      <h2>Account</h2>
      ${statusBanner(ctx)}
      ${signedIn
      ? `<p class="account-email">Signed in as <strong>${escapeAttr(authState.email)}</strong>
             <span class="tag ${authState.emailVerified ? "done" : "medium"}">${authState.emailVerified ? "Email verified" : "Email not verified"}</span></p>
           <p class="small muted">Progress saves to your account and appears on your other devices. Sync status: ${escapeAttr(syncState || "Saved")}${queuedCount ? ` · ${queuedCount} pending` : ""}.</p>
           ${authState.expired ? '<div class="banner warn" role="status">Your session expired. <button class="text-btn" data-action="auth-open" data-mode="signin">Sign in again</button> to resume syncing.</div>' : ""}
           <div class="flex" style="flex-wrap:wrap">
             <button class="outline-btn" data-action="import-open">Import guest progress</button>
             <button class="outline-btn" data-action="auth-signout">Sign out</button>
           </div>`
      : `<p class="small muted">You are studying as a guest (${escapeAttr(profile?.displayName || "Student")}). Progress is saved in this browser only.</p>
           <div class="flex" style="flex-wrap:wrap">
             <button class="primary-btn" data-action="auth-open" data-mode="signin">Sign in</button>
             <button class="outline-btn" data-action="auth-open" data-mode="signup">Create an account</button>
             <button class="outline-btn" data-action="import-open">Import guest progress</button>
           </div>`}
    </section>`;
}
