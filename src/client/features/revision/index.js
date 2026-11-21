// Feature methods use the shared application context; no browser globals are added.
export function register(app) {
  app.due = function due(t) {
    return (
      app.status(t.id) === "weak" ||
      (app.status(t.id) === "done" &&
        Date.now() -
          Math.max(
            app.s.reviews[app.topicKey(t.id)] || 0,
            app.s.completedAt[t.id] || 0,
          ) >
          86400000)
    );
  };

  app.renderPriority = function renderPriority() {
    let ts = app
      .priorityTopics()
      .filter(
        (t) =>
          (app.unitFilter === "all" || t.unit === +app.unitFilter) &&
          (app.subjectFilter === "all" || t.subject === app.subjectFilter) &&
          (!app.query ||
            t.title.toLowerCase().includes(app.query.toLowerCase())),
      );
    return `${app.header("Know what to study next.", "Your weak topics first, then unstudied foundations and the rest.", "LESS GUESSING · MORE FOCUS")}<div class="banner">${app.icon("flag")}<div><strong>${app.TOPICS.filter((t) => app.status(t.id) === "not-started").length} not started · ${app.TOPICS.filter((t) => app.status(t.id) === "weak").length} weak · ${app.TOPICS.filter((t) => app.status(t.id) === "learning").length} in progress</strong><p>Priority uses your progress, foundational importance and chapter order. It does not predict exam marks or question frequency.</p></div></div>${app.filters(false)}${ts.length ? `<div class="topics-list">${ts.map(app.topicRow).join("")}</div>` : app.empty("No remaining priorities in this view.", "Try another filter, or use Revision room to keep completed topics fresh.")}`;
  };

  app.renderRevisionBase = function renderRevision() {
    let ts = (
      app.revisionFilter === "missed" ? app.QUIZ_BANK : app.activeTopics()
    ).filter(
      (t) =>
        (app.subjectFilter === "all" || t.subject === app.subjectFilter) &&
        (app.revisionFilter === "all" ||
          (app.revisionFilter === "due" && app.due(t)) ||
          (app.revisionFilter === "weak" && app.status(t.id) === "weak") ||
          (app.revisionFilter === "missed" && app.s.missed.includes(t.id)) ||
          (app.revisionFilter === "lastday" &&
            (app.status(t.id) === "weak" || app.LAST_DAY_IDS.has(t.id)))),
    );
    ts.sort(
      (a, b) => (app.status(b.id) === "weak") - (app.status(a.id) === "weak"),
    );
    return `${app.header(app.revisionFilter === "lastday" ? "The essentials. One final pass." : "Turn “I read it” into “I know it”.", app.revisionFilter === "lastday" ? "Recall the key idea first. Open the answer only when you need it." : "Completed topics return after 24 hours; weak topics stay here until you feel confident.", app.revisionFilter === "lastday" ? "LAST-DAY REVISION MODE" : "YOUR REVISION ROOM", `<button class="outline-btn heading-action" aria-label="Print revision" data-action="print">${app.icon("print")}<span>Print revision</span></button>`)}${app.revisionFilter === "lastday" ? '<div class="banner">' + app.icon("sun") + "<div><strong>60-minute rescue pass</strong><p>15 min Digital Electronics · 15 min C++ · 10 min Algebra · 15 min DSA · 5 min UHV. Start with weak topics, say the answer aloud, then check. 15 selected essentials plus any weak topics. This is a final recall pass, not first-time coverage.</p></div></div>" : ""}<div class="toolbar">${[
      ["due", "Due now"],
      ["weak", "Weak topics"],
      ["missed", "Missed questions"],
      ["lastday", "Last-day essentials"],
      ["all", "All topics"],
    ]
      .map(
        ([v, l]) =>
          `<button class="filter-chip ${app.revisionFilter === v ? "active" : ""}" data-action="revision-filter" data-filter="${v}" aria-pressed="${app.revisionFilter === v}">${l}</button>`,
      )
      .join(
        "",
      )}<select id="subjectFilter" aria-label="Revision subject">${app.subjectOptions()}</select></div><div class="between" style="margin-bottom:15px"><span class="small muted">${ts.length} topics in this view</span><span class="small muted">${Object.keys(app.s.reviews).length} topics revised at least once</span></div>${ts.length ? `<div class="revision-grid">${ts.map((t) => `<article class="revision-card"><div class="between"><span class="small muted">${app.getSubject(t.subject).name}</span>${app.tag(app.status(t.id))}</div><h3>${t.title}</h3><div class="recall-box">${app.esc(t.recall)}</div><details style="margin-top:15px"><summary class="small" style="cursor:pointer;color:#748563">Recall prompt & answer</summary><p style="font-size:12px;margin-top:12px">${app.revisionFilter === "missed" ? t.mcq : t.question}</p><ol class="steps">${(app.revisionFilter === "missed" ? [`Correct answer: ${t.options[t.answer]}`, t.explanation] : t.steps).map((x) => `<li>${app.esc(x)}</li>`).join("")}</ol></details><div class="between"><button class="text-btn" data-action="topic" data-id="${t.id}">Open notes ${app.icon("arrow")}</button><button class="soft-btn" data-action="reviewed" data-id="${t.id}">${app.icon("check")} Revised</button></div><p class="muted" style="font-size:9px;margin-top:10px">${app.s.reviews[app.topicKey(t.id)] ? "Last revised " + new Date(app.s.reviews[app.topicKey(t.id)]).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Not revised yet"}${app.status(t.id) === "weak" ? " · Mark completed in notes when confident." : ""}</p></article>`).join("")}</div>` : `<div class="empty"><h3>${app.revisionFilter === "due" ? "Nothing due just yet." : "No topics in this selection."}</h3><p>Mark topics completed or weak as you study. Or start with the last-day essentials.</p><button class="outline-btn" data-action="lastday">Open essentials ${app.icon("arrow")}</button></div>`}`;
  };

  app.renderRevision = function () {
    let html = app.renderRevisionBase();
    return html
      .replace(
        "15 selected essentials plus any weak topics.",
        "Selected essentials across all six subjects, plus any weak topics.",
      )
      .replace("60-minute rescue pass", "75-minute rescue pass")
      .replace("10 min Algebra", "10 min Discrete")
      .replace("5 min UHV.", "5 min UHV · 15 min Python.");
  };
}
