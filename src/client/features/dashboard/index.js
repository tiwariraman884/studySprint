// Feature methods use the shared application context; no browser globals are added.
export function register(app) {
  app.renderOverview = function renderOverview() {
    const ts = app.activeTopics(),
      done = ts.filter((t) => app.status(t.id) === "done").length,
      weak = ts.filter((t) => app.status(t.id) === "weak").length,
      next = app.priorityTopics()[0] || ts[0],
      day = app.s.customPlan.days[app.selectedDay - 1];
    return `${app.header("Big syllabus. Small, focused steps.", "A fresh start, a clear priority, and everything you need to study today.", "WELCOME BACK, RAMAN", `<button class="outline-btn heading-action" data-action="nav" data-view="plan">${app.icon("calendar")}${app.s.customPlan.days.length}-day sprint</button>`)}<section class="hero studio-hero"><div><div class="eyebrow"><span class="live-dot"></span>YOUR NEXT BEST STEP</div><h2>Learn it. Practise it.<br><em>Make it stick.</em></h2><p>${done ? `${done} topic groups completed. Keep the momentum going.` : "No need to solve the entire syllabus at once."} Start with <strong>${app.esc(next.title)}</strong>, then test what you remember.</p><div class="hero-actions"><button class="primary-btn" data-action="topic" data-id="${next.id}">${app.icon("play")}Continue learning ${app.icon("arrow")}</button><button class="hero-link" data-action="nav" data-view="priority">View priorities</button></div></div><div class="hero-progress"><div class="progress-ring" style="--p:${app.fraction(ts)}%"><div class="ring-inner"><strong>${app.fraction(ts)}<small>%</small></strong><span>of your focus covered</span></div></div><div class="ring-sub">${done} / ${ts.length} topic groups</div></div></section><div class="studio-stats"><div><span>READY TO RECALL</span><strong>${done}<small>topics</small></strong><p>Completion you control</p></div><div><span>NEEDS YOUR ATTENTION</span><strong>${weak}<small>weak topics</small></strong><p>Move these to the front</p></div><div><span>WRITE YOUR WAY READY</span><strong>${Object.values(app.s.longDone).filter(Boolean).length}<small>/ ${app.LONG.length} long answers</small></strong><p>Theory, numerical & code</p></div><div><span>TEST YOUR UNDERSTANDING</span><strong>${app.QUIZ_BANK.length}<small>quiz questions</small></strong><p>Choose your own quiz size</p></div></div><div class="section-head"><div><h2>A toolkit for your next session</h2><p class="sub">Switch from reading to doing.</p></div></div><div class="launch-grid">${[
      [
        "materials",
        "book",
        "01",
        "Chapter study room",
        "Notes, worked examples and trusted reading.",
      ],
      [
        "lab",
        "code",
        "02",
        "Your smart coding lab",
        "Write, run, inspect errors and ask AI.",
      ],
      [
        "long",
        "question",
        "03",
        "The 10-mark answer studio",
        "Show your method. Strengthen your answer.",
      ],
      [
        "assistant",
        "spark",
        "04",
        "A little help, on demand",
        "Find a concept, shape a plan, clear a doubt.",
      ],
    ]
      .map(
        ([v, i, n, t, d]) =>
          `<button class="launch-card" data-action="nav" data-view="${v}"><div class="between">${app.icon(i)}<span class="label">${n}</span></div><h3>${t}</h3><p>${d}</p><span class="launch-arrow">${app.icon("arrow")}</span></button>`,
      )
      .join(
        "",
      )}</div><div class="dashboard-columns"><section><div class="section-head"><div><h2>Your next study blocks</h2><p class="sub">Day ${day.day} · ${app.esc(day.focus)}</p></div><button class="text-btn" data-action="nav" data-view="plan">Edit plan ${app.icon("arrow")}</button></div><div class="day-tabs scroll-tabs">${app.s.customPlan.days.map((d) => `<button class="day-tab ${d.day === app.selectedDay ? "active" : ""}" data-action="day" data-day="${d.day}">Day ${d.day}</button>`).join("")}</div><div class="plan-card">${day.blocks.map((b, i) => `<div class="session-row"><span class="session-number">${String(i + 1).padStart(2, "0")}</span>${app.subjectIcon(b.subject)}<div class="session-body"><h3>${app.esc(b.title)}</h3><p>${b.minutes} min · ${b.topics.length ? b.topics.length + " topic groups" : "Active recall"}</p></div><button class="row-arrow" data-action="${b.topics.length ? "topic" : "nav"}" ${b.topics.length ? `data-id="${b.topics.find((id) => app.status(id) !== "done") || b.topics[0]}"` : 'data-view="revision"'} aria-label="Open ${app.esc(b.title)}">${app.icon("arrow")}</button></div>`).join("")}</div>${app.s.customPlan.backlog.length ? `<div class="capacity-note">${app.icon("clock")}<div><strong>${app.s.customPlan.backlog.length} topics still need a slot.</strong><p>Extend your plan or narrow the subject selection.</p></div><button class="text-btn" data-action="nav" data-view="plan">Adjust</button></div>` : ""}<div class="section-head"><h2>Pick up where it matters</h2></div>${app
      .priorityTopics()
      .slice(0, 3)
      .map(
        (t) =>
          `<div class="priority-row">${app.subjectIcon(t.subject)}<div class="grow"><h3>${app.esc(t.title)}</h3><p>${app.getSubject(t.subject).name}</p></div>${app.tag(app.status(t.id))}<button class="row-arrow" data-action="topic" data-id="${t.id}" aria-label="Study ${app.esc(t.title)}">${app.icon("arrow")}</button></div>`,
      )
      .join(
        "",
      )}</section><aside class="stack right-column"><section class="card"><div class="card-title"><h2>Your six subjects</h2><span class="count">${app.TOPICS.length} topics</span></div>${app.SUBJECTS.map(
      (sub) => {
        const a = ts.filter((t) => t.subject === sub.id);
        return `<button class="subject-summary" data-action="subject" data-id="${sub.id}"><span class="flex">${app.subjectIcon(sub.id)}<strong>${sub.name}</strong><span class="percent">${app.fraction(a)}%</span></span><div class="progress"><i style="width:${app.fraction(a)}%"></i></div><span class="count-text">${a.filter((t) => app.status(t.id) === "done").length}/${a.length} in this scope</span></button>`;
      },
    ).join("")}</section>${app.timerCard()}</aside></div>`;
  };
}
