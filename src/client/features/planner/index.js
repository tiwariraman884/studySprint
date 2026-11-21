// Feature methods use the shared application context; no browser globals are added.
export function register(app) {
  app.renderPlan = function renderPlan() {
    const p = app.s.customPlan,
      pref = app.s.planPrefs,
      d = p.days[app.selectedDay - 1] || p.days[0];
    return `${app.header("Your days. Your pace. Your plan.", "Set your start date, days and study hours. The planner shows honestly what fits.", "FLEXIBLE STUDY PLANNER")}<section class="card planner-controls"><div class="planner-fields"><div class="field"><label for="planStart">Start date</label><input id="planStart" type="date" value="${app.esc(pref.start)}"></div><div class="field"><label for="planDays">Number of days</label><input id="planDays" type="number" min="1" max="60" value="${pref.days}"></div><div class="field"><label for="planHours">Study hours / day</label><input id="planHours" type="number" min="1" max="12" step="0.5" value="${pref.hours}"></div><div class="field"><label for="planScope">Plan scope</label><select id="planScope"><option value="exam" ${pref.scope === "exam" ? "selected" : ""}>Exam focus</option><option value="full" ${pref.scope === "full" ? "selected" : ""}>Full syllabus</option></select></div></div><div class="subject-checks">${app.SUBJECTS.map((sub) => `<label><input type="checkbox" name="planSubject" value="${sub.id}" ${pref.subjects.includes(sub.id) ? "checked" : ""}>${sub.short}</label>`).join("")}<label class="exclude-done"><input type="checkbox" id="excludeDone" ${pref.excludeDone ? "checked" : ""}>Skip completed topics</label></div><div class="between" style="margin-top:18px"><p class="small muted">Reserve time for recall daily. Breaks and sleep are outside these hours.</p><button class="primary-btn" data-action="generate-plan">${app.icon("spark")}Generate my plan</button></div></section><div class="plan-summary"><div><strong>${p.topicCount - p.backlog.length}</strong><span>topics scheduled</span></div><div><strong>${p.backlog.length}</strong><span>still to schedule</span></div><div><strong>${app.duration(p.estimated)}</strong><span>estimated topic study</span></div><div><strong>${p.days.length} days</strong><span>${pref.scope === "full" ? "Full syllabus" : "Exam focus"}</span></div></div>${p.backlog.length ? `<div class="banner">${app.icon("info")}<div><strong>The full selected workload does not fit.</strong><p>${p.backlog.length} topics remain in the backlog below. Try approximately ${Math.ceil((p.estimated + 90) / (pref.hours * 60 - 20))} days at these hours, or select fewer subjects. These are planning estimates, not a promise of mastery.</p></div></div>` : ""}<div class="day-tabs scroll-tabs">${p.days.map((x) => `<button class="day-tab ${x.day === app.selectedDay ? "active" : ""}" data-action="day" data-day="${x.day}">Day ${x.day}<small>${app.esc(x.focus)}</small></button>`).join("")}</div><div class="card plan-intro"><div class="between"><div><h2>${app.esc(d.title)}</h2><p>${app.esc(d.focus)} · ${app.duration(d.blocks.reduce((n, b) => n + b.minutes, 0))} planned · ${d.blocks.filter((b) => p.completed[b.id]).length}/${d.blocks.length} sessions done</p></div><span class="tag medium">DAY ${d.day}</span></div></div>${d.blocks.map((b) => `<article class="plan-session"><div class="flex"><button class="check-button ${p.completed[b.id] ? "checked" : ""}" data-action="custom-block" data-id="${app.esc(b.id)}" aria-label="Complete session ${app.esc(b.title)}" aria-pressed="${!!p.completed[b.id]}">${p.completed[b.id] ? app.icon("check") : ""}</button>${app.subjectIcon(b.subject)}<div style="flex:1"><h3>${app.esc(b.title)}</h3><p class="small muted">${b.minutes} min · Session completion is separate from topic mastery</p></div></div><div class="session-topic-links">${b.topics.map((id) => `<button data-action="topic" data-id="${id}">${app.status(id) === "done" ? "✓ " : ""}${app.getTopic(id).title}</button>`).join("") || '<button data-action="nav" data-view="quiz">Custom quiz</button><button data-action="nav" data-view="long">Write a long answer</button><button data-action="nav" data-view="revision">Recall room</button>'}</div></article>`).join("")}${p.backlog.length ? `<details class="card" style="margin-top:20px"><summary>Unscheduled backlog · ${p.backlog.length} topics</summary><div class="session-topic-links" style="margin-top:15px">${p.backlog.map((id) => `<button data-action="topic" data-id="${id}">${app.getTopic(id).title}</button>`).join("")}</div></details>` : ""}`;
  };

  app.editBlock = function editBlock(id) {
    const b = app.PLAN.flatMap((p) => p.blocks).find((b) => b.id === id);
    const d = document.getElementById("settingsDialog");
    d.innerHTML = `<div class="dialog-head"><h2>Adjust this study block</h2><button class="icon-btn" data-action="close-settings" aria-label="Close settings">${app.icon("close")}</button></div><div class="dialog-body"><p style="margin-bottom:18px">${b.title}</p><div class="field"><label for="blockMinutes">Study time in minutes</label><input id="blockMinutes" type="number" min="5" max="240" step="5" value="${b.minutes}"><small>Choose 5–240 minutes. Breaks are extra.</small></div></div><div class="dialog-actions"><button class="primary-btn" data-action="save-block" data-id="${id}">Save duration</button></div>`;
    d.showModal();
  };

  app.buildCustomPlan = function buildCustomPlan(prefs) {
    const days = Number(prefs.days),
      capacity = Math.round(Number(prefs.hours) * 60);
    const queues = prefs.subjects.map((id) =>
      app.TOPICS.filter(
        (t) =>
          t.subject === id &&
          (prefs.scope === "full" || t.exam) &&
          (!prefs.excludeDone || app.status(t.id) !== "done"),
      ).sort(
        (a, b) =>
          (app.status(b.id) === "weak") - (app.status(a.id) === "weak") ||
          a.unit - b.unit,
      ),
    );
    let pool = [];
    while (queues.some((q) => q.length)) {
      for (const q of queues) if (q.length) pool.push(q.shift());
    }
    const original = pool.slice(),
      result = [],
      stamp = Date.now();
    for (let d = 1; d <= days; d++) {
      const reserve =
        d === days && days > 1
          ? Math.min(90, Math.floor(capacity / 3))
          : Math.min(20, Math.floor(capacity / 4));
      let remain = capacity - reserve,
        selected = [];
      while (pool.length) {
        const i = pool.findIndex((t) => t.minutes <= remain);
        if (i < 0) break;
        const t = pool.splice(i, 1)[0];
        selected.push(t);
        remain -= t.minutes;
      }
      const blocks = [];
      for (const sub of app.SUBJECTS) {
        const group = selected.filter((t) => t.subject === sub.id);
        if (group.length)
          blocks.push({
            id: `p${stamp}-${d}-${sub.id}`,
            subject: sub.id,
            title:
              group.length === 1
                ? group[0].title
                : `${sub.name} · ${group.length} focused topics`,
            minutes: group.reduce((n, t) => n + t.minutes, 0),
            topics: group.map((t) => t.id),
          });
      }
      blocks.push({
        id: `p${stamp}-${d}-recall`,
        subject: "mixed",
        title:
          d === days
            ? "Recall, long answers & weak-topic repair"
            : "Recall + short quiz",
        minutes: reserve,
        topics: [],
      });
      result.push({
        day: d,
        title:
          d === 1
            ? "Start with clarity"
            : d === days
              ? "Finish with recall"
              : "Build your momentum",
        focus: app.fmtPlanDate(prefs.start, d),
        blocks,
      });
    }
    return {
      created: stamp,
      prefs: { ...prefs },
      days: result,
      backlog: pool.map((t) => t.id),
      topicCount: original.length,
      estimated: original.reduce((n, t) => n + t.minutes, 0),
      completed: {},
    };
  };

  app.fmtPlanDate = function fmtPlanDate(start, n) {
    const d = new Date(start + "T12:00:00");
    d.setDate(d.getDate() + n - 1);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  app.planToday = function planToday() {
    return Math.max(
      1,
      Math.min(
        app.s.customPlan.days.length,
        Math.floor(
          (new Date(app.todayISO() + "T12:00:00") -
            new Date(app.s.customPlan.prefs.start + "T12:00:00")) /
            86400000,
        ) + 1,
      ),
    );
  };

  app.validPrefs = function validPrefs(p) {
    return (
      !!p &&
      Number.isInteger(+p.days) &&
      p.days >= 1 &&
      p.days <= 60 &&
      Number.isFinite(+p.hours) &&
      p.hours >= 1 &&
      p.hours <= 12 &&
      /^\d{4}-\d{2}-\d{2}$/.test(p.start) &&
      !isNaN(new Date(p.start + "T12:00:00").getTime()) &&
      ["exam", "full"].includes(p.scope) &&
      Array.isArray(p.subjects) &&
      p.subjects.length > 0 &&
      p.subjects.every((id) => app.getSubject(id))
    );
  };

  app.validCustomPlan = function validCustomPlan(p) {
    return (
      !!p &&
      app.validPrefs(p.prefs) &&
      Array.isArray(p.days) &&
      p.days.length === +p.prefs.days &&
      p.days.every(
        (d, i) =>
          d.day === i + 1 &&
          typeof d.title === "string" &&
          typeof d.focus === "string" &&
          Array.isArray(d.blocks) &&
          d.blocks.every(
            (b) =>
              typeof b.id === "string" &&
              (b.subject === "mixed" || app.getSubject(b.subject)) &&
              typeof b.title === "string" &&
              Number.isFinite(b.minutes) &&
              b.minutes >= 0 &&
              b.minutes <= 720 &&
              Array.isArray(b.topics) &&
              b.topics.every((id) => app.getTopic(id)),
          ),
      ) &&
      Array.isArray(p.backlog) &&
      p.backlog.every((id) => app.getTopic(id)) &&
      Number.isInteger(p.topicCount) &&
      Number.isFinite(p.estimated) &&
      p.completed &&
      typeof p.completed === "object"
    );
  };
}
