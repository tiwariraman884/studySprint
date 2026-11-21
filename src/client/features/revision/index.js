// Feature methods use the shared application context; no browser globals are added.
export function register(app) {
  app.due = function due(t) {
    const status = app.status(t.id);
    const key = app.topicKey(t.id);
    const last = Math.max(
      app.s.reviews[key] || 0,
      app.s.completedAt[t.id] || 0,
    );
    if (status === "weak") return true;
    if (status !== "done") return false;
    const confidence = app.s.confidence?.[key];
    const interval = !confidence
      ? 86400000
      : confidence >= 2
        ? 2592000000
        : 1728000000;
    return Date.now() - last > interval;
  };

  app.setConfidence = function setConfidence(id, level) {
    const key = app.topicKey(id);
    app.s.confidence[key] = Math.max(0, Math.min(3, Number(level) || 0));
    app.s.reviews[key] = Date.now();
    app.persistWrite?.("revision", {
      key,
      at: app.s.reviews[key],
      confidence: app.s.confidence[key],
    });
    app.save();
    app.render();
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

  app.lastDayPlan = function lastDayPlan() {
    const pool = app
      .activeTopics()
      .filter((t) => app.isLastDay(t.id) || app.status(t.id) === "weak")
      .sort(
        (a, b) =>
          (app.status(b.id) === "weak" ? 1 : 0) - (app.status(a.id) === "weak" ? 1 : 0) ||
          a.unit - b.unit,
      );
    const budget = 90;
    const items = [];
    let used = 0;
    for (const t of pool) {
      const minutes = t.minutes || 5;
      if (used + minutes > budget) break;
      items.push(t);
      used += minutes;
    }
    if (!items.length && pool.length) items.push(pool[0]);
    return { items, budget, used: items.reduce((n, t) => n + (t.minutes || 5), 0) };
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
          (app.revisionFilter === "lastday" && app.isLastDay(t.id)) ||
          (app.revisionFilter === "notebook" && !!app.s.wrongAnswers?.[t.id]) ||
          (app.revisionFilter === "outlines" &&
            (app.LONG || []).some((l) => (l.related || []).includes(t.id)))),
    );
    ts.sort(
      (a, b) =>
        (app.status(b.id) === "weak" ? 1 : 0) - (app.status(a.id) === "weak" ? 1 : 0),
    );
    const isNotebook = app.revisionFilter === "notebook";
    const isOutline = app.revisionFilter === "outlines";
    const lastDay = app.revisionFilter === "lastday";
    const heading = lastDay
      ? "The essentials. One final pass."
      : isNotebook
        ? "The wrong-answer notebook."
        : isOutline
          ? "Long answer outlines."
          : "Turn “I read it” into “I know it”.";
    const sub = lastDay
      ? "Recall the key idea first. Open the answer only when you need it."
      : isNotebook
        ? "Write the answer before opening the explanation. Gaps you close become confidence."
        : isOutline
          ? "Long answers keep the exam structure: question, method, example, numbers, conclusion."
          : "Completed topics return after a spaced interval; weak topics stay here until you feel confident.";
    const chips = [
      ["due", "Due now"],
      ["weak", "Weak topics"],
      ["missed", "Missed questions"],
      ["lastday", "Last-day essentials"],
      ["notebook", "Wrong-answer notebook"],
      ["outlines", "Long outlines"],
      ["all", "All topics"],
    ]
      .map(
        ([v, l]) =>
          `<button class="filter-chip ${app.revisionFilter === v ? "active" : ""}" data-action="revision-filter" data-filter="${v}" aria-pressed="${app.revisionFilter === v}">${l}</button>`,
      )
      .join("");
    const empty =
      app.revisionFilter === "due"
        ? "Nothing due just yet."
        : isNotebook
          ? "Your wrong answers will appear here after a quiz mistake."
          : isOutline
            ? "Pick a long answer to outline."
            : "No topics in this selection.";
    const lastDayPlan = lastDay ? app.lastDayPlan() : null;
    return `${app.header(
      heading,
      sub,
      lastDay ? "LAST-DAY REVISION MODE" : "YOUR REVISION ROOM",
      `<button class="outline-btn heading-action" aria-label="Print revision" data-action="print">${app.icon("print")}<span>Print revision</span></button>`,
    )}${lastDay && lastDayPlan ? `<div class="banner">${app.icon("sun")}<div><strong>Last-day rescue pass</strong><p>A ${lastDayPlan.budget}-minute recall pass: ${lastDayPlan.items.length} essentials plus any weak topics. Start with a weak topic, say the answer aloud, then check.</p></div></div>` : ""}<div class="toolbar">${chips}</div><div class="between" style="margin-bottom:15px"><span class="small muted">${ts.length} topics in this view</span><span class="small muted">${Object.keys(app.s.reviews).length} topics revised at least once</span></div>${
      ts.length
        ? `<div class="revision-grid">${ts.map((t) => {
            const wrong = app.s.wrongAnswers?.[t.id];
            const long = (app.LONG || []).find((l) => (l.related || []).includes(t.id));
            return `<article class="revision-card"><div class="between"><span class="small muted">${app.getSubject(t.subject).name}</span>${app.tag(app.status(t.id))}</div>${
              isNotebook
                ? `<h3>${t.title}</h3><p class="small muted">Your answer: ${app.esc(wrong?.selected ?? "")}</p><p class="small muted">Correct: ${app.esc((app.QUIZ_BANK.find((q) => q.id === t.id) || t).options?.[t.answer] || "")}</p>`
                : isOutline
                  ? `<h3>${t.title}</h3><p class="small muted">${long?.question || t.title}</p>`
                  : `<h3>${t.title}</h3>`
            }<div class="recall-box">${app.esc(isNotebook ? wrong?.topicText || t.title : t.recall)}</div><details style="margin-top:15px"><summary class="small" style="cursor:pointer;color:#748563">Recall prompt & answer</summary><p style="font-size:12px;margin-top:12px">${app.revisionFilter === "missed" ? t.mcq : t.question}</p><ol class="steps">${(app.revisionFilter === "missed" ? [`Correct answer: ${t.options[t.answer]}`, t.explanation] : t.steps).map((x) => `<li>${app.esc(x)}</li>`).join("")}</ol></details><div class="between"><button class="text-btn" data-action="topic" data-id="${t.id}">Open notes ${app.icon("arrow")}</button>${
              lastDay
                ? `<button class="soft-btn" data-action="reviewed" data-id="${t.id}">${app.icon("check")} Revised</button>`
                : `<button class="soft-btn" data-action="confidence" data-id="${t.id}" data-level="2">${app.icon("check")} Confident</button>`
            }</div><p class="muted" style="font-size:9px;margin-top:10px">${app.s.reviews[app.topicKey(t.id)] ? "Last revised " + new Date(app.s.reviews[app.topicKey(t.id)]).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Not revised yet"}${app.status(t.id) === "weak" ? " · Mark completed in notes when confident." : ""}</p></article>`
          }).join("")}`
        : `<div class="empty"><h3>${empty}</h3><p>Mark topics completed or weak as you study. Or start with the last-day essentials.</p>${app.revisionFilter !== "lastday" ? `<button class="outline-btn" data-action="lastday">Open essentials ${app.icon("arrow")}</button>` : ""}</div>`}</div>`;
  };

  app.renderRevision = function renderRevision() {
    return app.renderRevisionBase();
  };
}
