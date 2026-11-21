// Profile-driven labels shared by the shell and dashboard.
import { localISODate } from "../../core/dates.js";

// Feature methods use the shared application context; no browser globals are added.
export function register(app) {
  // The student's local calendar day. Planning must never shift an exam or a
  // study day through a UTC conversion.
  app.todayISO = function todayISO() {
    return localISODate();
  };

  app.dayDate = function dayDate(n) {
    let d = new Date(app.s.start + "T12:00:00");
    d.setDate(d.getDate() + n - 1);
    return d;
  };

  app.fmtDay = function fmtDay(n) {
    return app
      .dayDate(n)
      .toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  app.currentDay = function currentDay() {
    return Math.max(
      1,
      Math.min(
        4,
        Math.floor(
          (new Date(app.todayISO() + "T12:00:00") -
            new Date(app.s.start + "T12:00:00")) /
            86400000,
        ) + 1,
      ),
    );
  };

  app.save = function save() {
    try {
      localStorage.setItem(app.KEY, JSON.stringify(app.s));
      app.storageOK = true;
    } catch {
      app.storageOK = false;
      app.toast(
        "Storage is unavailable. Export a backup before closing this tab.",
      );
    }
  };

  app.toast = function toast(message) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(app.toastTimeout);
    app.toastTimeout = setTimeout(() => el.classList.remove("show"), 3500);
  };

  app.navigate = function navigate(v) {
    app.view = v;
    app.mobileOpen = false;
    app.render();
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  app.header = function header(
    title,
    subtitle,
    eyebrow = "YOUR STUDY SPACE",
    action = "",
  ) {
    return `<div class="page-heading"><div><div class="label">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
  };

  app.render = function render() {
    if (!app.s.customPlan)
      app.s.customPlan = app.buildCustomPlan(app.s.planPrefs);
    app.selectedDay = Math.max(
      1,
      Math.min(app.selectedDay, app.s.customPlan.days.length),
    );
    const focused = document.activeElement?.id,
      pos = document.activeElement?.selectionStart;
    app.themeApply();
    document.title = `${app.NAV.find((n) => n[0] === app.view)?.[2] || "Study Sprint"} · Study Sprint`;
    const renderer =
      {
        overview: app.renderOverview,
        plan: app.renderPlan,
        studymap: app.renderStudyMap,
        curriculum: app.renderCurriculumMatrix,
        practice: app.renderPractice,
        subjects: app.renderSubjects,
        materials: app.renderMaterials,
        syllabus: app.renderSyllabus,
        questions: app.renderQuestions,
        long: app.renderLong,
        quiz: app.renderQuiz,
        lab: app.renderLab,
        assistant: app.renderAssistant,
        revision: app.renderRevision,
        priority: app.renderPriority,
      }[app.view] || app.renderOverview;
    document.getElementById("app").innerHTML =
      `<div class="mobile-overlay ${app.mobileOpen ? "open" : ""}" data-action="menu"></div><aside id="sidebar" class="sidebar ${app.mobileOpen ? "open" : ""}"><a class="brand" href="#" data-action="nav" data-view="overview"><span class="brandmark">${app.icon("quiz")}</span><span><strong>study sprint.</strong><small>Make every session count.</small></span></a><div class="workspace-label label">${app.workspaceHeading()}</div><nav class="nav" aria-label="Main navigation">${app.NAV.map(([v, i, l], j) => `${j === 5 ? '<div class="nav-group label">PRACTISE & BUILD</div>' : j === 10 ? '<div class="nav-group label">RECALL & REFINE</div>' : ""}<button data-action="nav" data-view="${v}" class="${app.view === v ? "active" : ""}" ${app.view === v ? 'aria-current="page"' : ""}>${app.icon(i)}${l}${v === "lab" ? '<span class="pill-count">NEW</span>' : ""}</button>`).join("")}</nav><div class="sidebar-bottom"><button class="lastday-compact" data-action="lastday">${app.icon("sun")} Last-day revision ${app.icon("arrow")}</button><div class="profile"><span class="avatar" aria-hidden="true">${app.esc(app.initials || "ST")}</span><div><strong>${app.esc(app.profile?.displayName || "Student")}</strong><p>${app.workspaceSubtitle()}</p></div><button class="icon-btn" data-action="settings" aria-label="Open settings and account">${app.icon("settings")}</button></div></div></aside><div class="main-shell"><header class="topbar"><div class="flex"><button class="mobile-menu icon-btn" data-action="menu" aria-label="Toggle navigation">${app.icon("menu")}</button><div class="breadcrumb"><span>Your workspace</span>${app.icon("chevron")}<strong>${app.NAV.find((n) => n[0] === app.view)?.[2] || "Overview"}</strong></div></div><div class="top-right"><form class="search-box" id="globalSearchForm">${app.icon("search")}<input id="globalSearch" name="q" placeholder="Find a concept…" aria-label="Search all topics"><kbd>Ctrl K</kbd></form><button class="icon-btn" data-action="theme-toggle" aria-label="Switch to ${app.s.theme === "dark" ? "light" : "dark"} theme" title="Switch theme">${app.icon("sun")}</button><button class="sync-chip" id="syncChip" type="button" data-action="settings-tab" data-tab="account" data-state="local" aria-live="polite" title="Where your progress is saved">Saved in this browser</button><button class="icon-btn" data-action="settings" aria-label="Open settings and account">${app.icon("settings")}</button></div></header><main class="main" id="main"><div class="scope-strip"><span><span class="live-dot"></span> ${app.s.scope === "exam" ? "Exam-focus topics" : "Full selected syllabus"} <span class="scope-meta">· ${app.activeTopics().length} topic groups · ${app.SUBJECTS.length} subject${app.SUBJECTS.length === 1 ? "" : "s"}</span></span><div class="segmented"><button data-action="scope" data-scope="exam" class="${app.s.scope === "exam" ? "on" : ""}">Exam focus</button><button data-action="scope" data-scope="full" class="${app.s.scope === "full" ? "on" : ""}">Full syllabus</button></div></div>${renderer()}<footer class="footer-note"><span class="flex">${app.icon("shield")}${app.storageOK ? "Saved on this browser · Export a backup to take your progress with you." : "Storage unavailable · Export a backup before closing."}</span><button class="text-btn" data-action="settings">Backup & preferences ${app.icon("arrow")}</button></footer></main></div>${app.view !== "assistant" ? `<button class="assistant-fab" data-action="nav" data-view="assistant">${app.icon("spark")} Ask your study assistant</button>` : ""}`;
    if (focused && document.getElementById(focused)) {
      const el = document.getElementById(focused);
      el.focus();
      if (typeof pos === "number" && el.setSelectionRange)
        try {
          el.setSelectionRange(pos, pos);
        } catch {}
    }
    app.updateTimer();
    app.updateNavAccess();
    app.updateSyncChip?.();
    if (app.view === "assistant") app.scrollChat();
  };

  app.updateNavAccess = function updateNavAccess() {
    const el = document.getElementById("sidebar");
    if (el) el.inert = window.innerWidth <= 700 && !app.mobileOpen;
  };

  app.empty = function empty(title, desc) {
    return `<div class="empty"><h3>${title}</h3><p>${desc}</p><button class="outline-btn" data-action="clear-filters">Clear filters</button></div>`;
  };

  // "Good evening, Asha" — the greeting belongs to the student, not to the app
  // author. Guests keep the neutral product greeting.
  app.greeting = function greeting() {
    const signedIn = !!app.authState?.user;
    const name = app.profile?.displayName;
    if (!signedIn && (!name || name === "Student")) return "WELCOME · TRY A FIRST SESSION";
    const hour = new Date().getHours();
    const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    return `${part.toUpperCase()}, ${String(name || "Student").toUpperCase()}`;
  };

  // Profile-driven chrome. The sidebar shows the student's own workspace, never
  // a hardcoded identity; guests keep a neutral label.
  app.workspaceHeading = function workspaceHeading() {
    const name = app.profile?.displayName || "Student";
    const signedIn = !!app.authState?.user;
    const onboarded = !!app.profile?.onboardingCompletedAt;
    if (signedIn) return `${app.esc(name.toUpperCase())} · YOUR WORKSPACE`;
    return onboarded
      ? `${app.esc(name.toUpperCase())} · GUEST, SAVED ON THIS DEVICE`
      : "GUEST WORKSPACE · SAVED ON THIS DEVICE";
  };

  app.workspaceSubtitle = function workspaceSubtitle() {
    const count = app.SUBJECTS?.length || 0;
    const pack = app.PACK?.academicYear;
    const sync =
      app.workspace?.state.mode === "cloud"
        ? app.workspace.state.syncState === "offline"
          ? "Offline"
          : "Synced"
        : "Guest";
    return `${count} subject${count === 1 ? "" : "s"}${pack ? ` · ${app.esc(pack)}` : ""} · ${sync}`;
  };

  app.openAccount = function openAccount(mode = "signin") {
    if (app.openAuth) app.openAuth(mode);
  };

  app.themeApply = function themeApply() {
    document.documentElement.dataset.theme = app.s.theme;
    document.querySelector('meta[name="theme-color"]').content =
      app.s.theme === "dark" ? "#121714" : "#f5f7f1";
  };
}
