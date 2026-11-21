export function initializeState(app) {
  app.esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  app.KEY = "raman-cia2-sprint-v1";
  app.defaults = {
    version: 1,
    start: "2026-11-14",
    status: {},
    reviews: {},
    completedAt: {},
    notes: {},
    blocks: {},
    durations: {},
    history: [],
    missed: [],
    lastTopic: "de1",
    hinglish: true,
    timer: { remaining: 1500, running: false, end: 0 },
    quiz: null,
  };
  app.DEFAULT_DURATIONS = Object.fromEntries(
    app.PLAN.flatMap((p) => p.blocks).map((b) => [b.id, b.minutes]),
  );
  app.LAST_DAY_IDS = new Set([
    "de2",
    "de3",
    "de7",
    "cpp1",
    "cpp5",
    "cpp8",
    "alg3",
    "alg5",
    "alg9",
    "dsa2",
    "dsa6",
    "dsa11",
    "uhv1",
    "uhv3",
    "uhv5",
  ]);
  app.storageOK = true;
  app.s = undefined;
  try {
    app.s = {
      ...structuredClone(app.defaults),
      ...JSON.parse(localStorage.getItem(app.KEY) || "{}"),
    };
  } catch {
    app.s = structuredClone(app.defaults);
    app.storageOK = false;
  }
  app.view = "overview";
  app.selectedDay = 1;
  app.subjectFilter = "all";
  app.statusFilter = "all";
  app.query = "";
  app.revisionFilter = "due";
  app.quizSubject = "all";
  app.quizScope = "all";
  app.quizSize = 8;
  app.mobileOpen = false;
  app.toastTimeout = undefined;
  app.activeTopic = null;
  for (const b of app.PLAN.flatMap((p) => p.blocks)) {
    if (Number.isFinite(app.s.durations?.[b.id]))
      b.minutes = app.s.durations[b.id];
  }
  app.getTopic = (id) =>
    app.TOPICS.find((t) => t.id === id) ||
    app.QUIZ_BANK.find((t) => t.id === id);
  app.getSubject = (id) => app.SUBJECTS.find((x) => x.id === id);
  app.topicKey = (id) => app.getTopic(id)?.topicId || id;
  app.status = (id) => app.s.status[app.topicKey(id)] || "not-started";
  app.statusName = (v) =>
    ({
      "not-started": "Not started",
      learning: "In progress",
      done: "Completed",
      weak: "Weak",
    })[v];
  app.tag = (v) => `<span class="tag ${v}">${app.statusName(v) || v}</span>`;
  app.selectedDay = app.currentDay();
  app.duration = (n) =>
    `${Math.floor(n / 60) ? Math.floor(n / 60) + "h " : ""}${n % 60 ? (n % 60) + "m" : ""}`.trim();
  app.fraction = (items) =>
    items.length
      ? Math.round(
          (items.filter((t) => app.status(t.id) === "done").length /
            items.length) *
            100,
        )
      : 0;
  app.subjectIcon = (sub) => {
    const x = app.getSubject(sub);
    return `<span class="subject-icon ${x?.color || "mixed"}">${app.icon(x?.icon || "quiz")}</span>`;
  };
  app.unitFilter = "all";
  app.longSource = "all";
  app.longQuery = "";
  app.syllabusSubject = "de";
  app.activeLong = null;
  app.s.scope = app.s.scope || "exam";
  app.s.planPrefs = app.s.planPrefs || {
    days: 4,
    hours: 7,
    start: app.s.start,
    scope: "exam",
    subjects: app.SUBJECTS.map((x) => x.id),
    excludeDone: true,
  };
  app.s.longDrafts = app.s.longDrafts || {};
  app.s.longScores = app.s.longScores || {};
  app.s.longDone = app.s.longDone || {};
  for (const l of app.LONG.filter(
    (x) => x.subject === "py" && !x.id.startsWith("ch-"),
  ))
    l.code = l.related
      .map((id) => app.getTopic(id).code)
      .filter(Boolean)
      .join("\n\n# ── Next exercise ──\n\n");
  for (const id of ["py1", "py4", "py7", "py8", "py9", "py10"])
    app.LAST_DAY_IDS.add(id);
  if (!app.s.customPlan)
    app.s.customPlan = app.buildCustomPlan(app.s.planPrefs);
  app.selectedDay = app.planToday();
  app.longModal = document.getElementById("longDialog");
  app.s.theme = app.s.theme === "light" ? "light" : "dark";
  app.s.questionDone ||= {};
  app.s.materialRead ||= {};
  app.s.chat ||= [];
  app.s.lab ||= { language: "python", drafts: {}, inputs: {} };
  app.s.lab.drafts ||= {};
  app.s.lab.inputs ||= {};
  app.practiceMode = "all";
  app.quizUnit = "all";
  app.materialSubject = "all";
  app.materialUnit = null;
  app.chatDraft = "";
  app.chatBusy = false;
  app.chatMode = "search";
  app.labBusy = false;
  app.labOut = "";
  app.labErr = "";
  app.labStatus = "Ready to run";
  app.labRun = null;
  app.labAbort = null;
  app.labTimeout = null;
  app.labStarted = 0;
  app.aiWorker = null;
  app.aiReady = false;
  app.aiBusy = false;
  app.aiStatus = "Optional · runs on your device";
  app.aiJob = null;
  app.aiTimer = null;
  app.NAV = [
    ["overview", "grid", "Overview"],
    ["plan", "calendar", "Study plan"],
    ["subjects", "book", "My subjects"],
    ["materials", "layers", "Study materials"],
    ["syllabus", "layers", "Syllabus map"],
    ["questions", "question", "Short questions"],
    ["long", "code", "Long answers"],
    ["quiz", "quiz", "Practice quizzes"],
    ["lab", "code", "Smart lab"],
    ["assistant", "spark", "Study assistant"],
    ["revision", "revision", "Revision room"],
    ["priority", "flag", "Priority view"],
  ];
  app.chapterLabel = (sub, n) =>
    `${sub === "py" ? "Exercise" : sub === "uhv" ? "Module" : "Unit"} ${n}`;
  app.modeLabel = (x) =>
    ({ theory: "Theory", numerical: "Numerical / trace", code: "Programming" })[
      x
    ] || "All formats";
  app.frame = document.createElement("iframe");
  app.frame.sandbox = "allow-scripts";
  app.frame.srcdoc =
    "<html><body><script>" +
    app.LAB_FRAME_SOURCE.replace(/<\/script/gi, "<\\/script") +
    "</script></body></html>";
  app.frame.hidden = true;
  app.frame.title = "Isolated program runner";
  document.body.append(app.frame);
  app.frameReady = false;
}
