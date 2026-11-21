// Feature methods use the shared application context; no browser globals are added.
export function register(app) {
  app.priorityTopics = function priorityTopics() {
    return app
      .activeTopics()
      .filter((t) => app.status(t.id) !== "done")
      .sort((a, b) => {
        const val = (t) =>
          (app.status(t.id) === "weak"
            ? 1000
            : app.status(t.id) === "not-started"
              ? 500
              : 300) +
          (t.priority === "high" ? 100 : 0) -
          t.unit;
        return val(b) - val(a);
      });
  };

  app.subjectOptions = function subjectOptions() {
    return `<option value="all">All subjects</option>${app.SUBJECTS.map((sub) => `<option value="${sub.id}" ${app.subjectFilter === sub.id ? "selected" : ""}>${sub.name}</option>`).join("")}`;
  };

  app.filters = function filters(withStatus = true) {
    const units = [
      ...new Set(
        app
          .activeTopics()
          .filter(
            (t) =>
              app.subjectFilter === "all" || t.subject === app.subjectFilter,
          )
          .map((t) => t.unit),
      ),
    ].sort((a, b) => a - b);
    return `<div class="toolbar"><select id="subjectFilter" aria-label="Filter by subject">${app.subjectOptions()}</select><select id="unitFilter" aria-label="Filter by unit or exercise"><option value="all">All units / exercises</option>${units.map((n) => `<option value="${n}" ${String(app.unitFilter) === String(n) ? "selected" : ""}>${app.subjectFilter === "py" ? "Exercise" : "Unit / module"} ${n}</option>`).join("")}</select>${withStatus ? `<select id="statusFilter" aria-label="Filter by topic status">${["all", "not-started", "learning", "weak", "done"].map((v) => `<option value="${v}" ${app.statusFilter === v ? "selected" : ""}>${v === "all" ? "All progress" : app.statusName(v)}</option>`).join("")}</select>` : ""}<input id="topicSearch" placeholder="Search topics or questions…" value="${app.esc(app.query)}" aria-label="Filter topics by text"><button class="text-btn" data-action="clear-all-filters">Clear</button></div>`;
  };

  app.filteredTopics = function filteredTopics() {
    return app
      .activeTopics()
      .slice()
      .sort(
        (a, b) =>
          app.SUBJECTS.findIndex((s) => s.id === a.subject) -
            app.SUBJECTS.findIndex((s) => s.id === b.subject) ||
          a.unit - b.unit,
      )
      .filter(
        (t) =>
          (app.subjectFilter === "all" || t.subject === app.subjectFilter) &&
          (app.unitFilter === "all" || t.unit === +app.unitFilter) &&
          (app.statusFilter === "all" ||
            app.status(t.id) === app.statusFilter) &&
          (!app.query ||
            [t.title, t.brief, t.question, t.recall]
              .join(" ")
              .toLowerCase()
              .includes(app.query.toLowerCase())),
      );
  };

  app.topicRow = function topicRow(t) {
    return `<div class="topic-row"><button class="check-button ${app.status(t.id) === "done" ? "checked" : ""}" data-action="complete" data-id="${t.id}" aria-label="${app.status(t.id) === "done" ? "Mark not started" : "Mark completed"}: ${app.esc(t.title)}" aria-pressed="${app.status(t.id) === "done"}">${app.status(t.id) === "done" ? app.icon("check") : ""}</button><div class="topic-main"><button class="topic-title" data-action="topic" data-id="${t.id}">${t.title}</button><div class="topic-meta"><span>${app.getSubject(t.subject).name}</span><span>·</span><span>${t.minutes} min</span><span>· ${t.unitName}</span>${t.legacy ? "<span>· Legacy note included</span>" : ""}</div></div>${app.tag(app.status(t.id))}<button class="weak-button ${app.status(t.id) === "weak" ? "selected" : ""}" data-action="weak" data-id="${t.id}" aria-label="${app.status(t.id) === "weak" ? "Unmark weak" : "Mark weak"}: ${app.esc(t.title)}" aria-pressed="${app.status(t.id) === "weak"}">${app.icon("flag")}</button><button class="outline-btn" data-action="topic" data-id="${t.id}">Study ${app.icon("arrow")}</button></div>`;
  };

  app.renderSubjects = function renderSubjects() {
    const ts = app.filteredTopics();
    return `${app.header("Six subjects. Every unit in view.", "Choose a subject, filter its units, then work through the topic groups.", "FULL SYLLABUS · PROGRESS CHECKLIST")}<div class="subject-tiles">${app.SUBJECTS.map(
      (sub) => {
        const st = app.activeTopics().filter((t) => t.subject === sub.id);
        return `<button class="subject-tile ${app.subjectFilter === sub.id ? "selected" : ""}" data-action="subject" data-id="${sub.id}">${app.subjectIcon(sub.id)}<strong>${sub.name}</strong><span>${app.CURRICULUM.find((c) => c.id === sub.id).code}</span><div class="progress"><i style="width:${app.fraction(st)}%"></i></div><small>${st.filter((t) => app.status(t.id) === "done").length}/${st.length} topics</small></button>`;
      },
    ).join(
      "",
    )}</div>${app.filters()}<div class="between" style="margin-bottom:12px"><span class="label">${ts.length} TOPIC GROUP${ts.length === 1 ? "" : "S"}</span><button class="text-btn" data-action="nav" data-view="syllabus">See exact extracted syllabus ${app.icon("arrow")}</button></div>${ts.length ? `<div class="topics-list">${ts.map(app.topicRow).join("")}</div>` : app.empty("No topics match this selection.", "Try Full syllabus or reset the subject/unit filters.")}`;
  };

  app.renderTopic = function renderTopic() {
    const t = app.getTopic(app.activeTopic),
      sub = app.getSubject(t.subject);
    const d = document.getElementById("topicDialog");
    d.innerHTML = `<div class="dialog-head"><div><div class="flex"><span class="label">${sub.name}</span>${app.tag(app.status(t.id))}</div><h2>${t.title}</h2><p class="small muted" style="margin-top:6px">${t.minutes} min · ${t.unitName} · ${t.priority === "high" ? "Core concept" : "Supporting concept"}</p></div><button class="icon-btn" data-action="close-topic" aria-label="Close topic">${app.icon("close")}</button></div><div class="dialog-body"><p>${t.brief}</p>${app.s.hinglish ? `<div class="language-note"><strong>Simple samjho:</strong> ${t.hinglish}</div>` : ""}${t.legacy ? '<div class="banner" style="margin-top:17px">' + app.icon("info") + "<div>Includes historical syllabus material. Note the C++ version differences in your answer.</div></div>" : ""}<h3>What to write in the exam</h3><ul class="note-list">${t.points.map((p) => `<li>${app.esc(p)}</li>`).join("")}</ul>${t.table ? `<table><thead><tr>${t.table.headers.map((h) => `<th>${app.esc(h)}</th>`).join("")}</tr></thead><tbody>${t.table.rows.map((row) => `<tr>${row.map((v) => `<td>${app.esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : ""}${t.code ? `<pre class="code"><code>${app.esc(t.code)}</code></pre>` : ""}<h3>Keep this in mind</h3><div class="recall-box">${app.esc(t.recall)}</div><h3>Try it yourself <span class="tag medium" style="margin-left:8px">${t.marks || 5} marks · practice</span></h3><p>${t.question}</p><details style="margin-top:17px"><summary style="font-weight:650;font-size:12px;color:#66814e;cursor:pointer">Reveal step-by-step solution</summary><ol class="steps">${t.steps.map((step) => `<li>${app.esc(step)}</li>`).join("")}</ol></details><h3>Your quick note</h3><div class="field"><textarea maxlength="10000" id="topicNote" data-id="${t.id}" aria-label="Personal note for ${app.esc(t.title)}" placeholder="A formula I forget, a doubt to ask, or one line in my own words…">${app.esc(app.s.notes[t.id] || "")}</textarea><small>Saved in this browser as you type.</small></div></div><div class="dialog-actions"><button class="primary-btn" data-action="topic-status" data-status="done" data-id="${t.id}">${app.icon("check")}${app.status(t.id) === "done" ? "Completed" : "Mark completed"}</button><button class="outline-btn" data-action="topic-status" data-status="weak" data-id="${t.id}">${app.icon("flag")}Mark weak</button><button class="outline-btn" data-action="topic-status" data-status="learning" data-id="${t.id}">In progress</button><button class="text-btn" data-action="reviewed" data-id="${t.id}">${app.icon("revision")}Revised</button></div>`;
  };

  app.setStatus = function setStatus(id, value) {
    app.s.status[id] = value;
    if (value === "done") app.s.completedAt[id] = Date.now();
    app.save();
    app.render();
    if (document.getElementById("topicDialog").open && app.activeTopic === id) {
      const d = document.getElementById("topicDialog"),
        scroll = d.scrollTop;
      app.renderTopic();
      d.scrollTop = scroll;
    }
  };

  app.activeTopics = function activeTopics() {
    return app.TOPICS.filter((t) => app.s.scope === "full" || t.exam);
  };

  app.renderSyllabus = function renderSyllabus() {
    const c = app.CURRICULUM.find((c) => c.id === app.syllabusSubject);
    return `${app.header("The syllabus. Straight from your PDF.", "All five theory subjects and CSP-005, organised without hiding the remaining units.", "25 THEORY UNITS · 11 LAB EXERCISES")}<div class="banner">${app.icon("info")}<div><strong>CIA 2 focus is a study filter, not a confirmed current exam boundary.</strong><p>The uploaded 2025–26 papers emphasize Units 4–5 for DE/OOP/DSA, Modules 4–5 for UHV and Units 3 & 5 for Discrete. Algebraic Structures (Unit 4) remains included because you previously shared it. Python includes all exercises. Full syllabus shows everything.</p></div></div><div class="toolbar">${app.SUBJECTS.map((sub) => `<button class="filter-chip ${sub.id === app.syllabusSubject ? "active" : ""}" data-action="syllabus-subject" data-id="${sub.id}">${sub.short}</button>`).join("")}</div><section class="card"><div class="between"><div><h2>${c.name}</h2><p class="small muted" style="margin-top:5px">${c.code} · syllabus PDF pages ${c.pdfPages.join(", ")} (printed ${c.printedPages.join(", ")})</p></div>${app.subjectIcon(c.id)}</div><p class="small muted" style="margin-top:15px">Extracted from your uploaded university syllabus. Line wrapping is normalised. Original wording/typos are retained here; study notes clarify “sunmonoid” as submonoid.</p></section><div class="stack" style="margin-top:18px">${c.units
      .map((u) => {
        const ts = app.TOPICS.filter(
          (t) => t.subject === c.id && t.unit === u.number,
        );
        return `<article class="card syllabus-unit"><div class="between"><span class="tag ${app.EXAM_UNITS[c.id].includes(u.number) ? "done" : "medium"}">${c.id === "py" ? "EXERCISE" : c.id === "uhv" ? "MODULE" : "UNIT"} ${u.number}${app.EXAM_UNITS[c.id].includes(u.number) ? " · FOCUS" : ""}</span><span class="small muted">${ts.filter((t) => app.status(t.id) === "done").length}/${ts.length} topic groups completed</span></div><p class="extracted-text">${app.esc(u.text)}</p><div class="session-topic-links">${ts.map((t) => `<button data-action="topic" data-id="${t.id}">${t.title} ${app.status(t.id) === "done" ? "✓" : ""}</button>`).join("")}</div></article>`;
      })
      .join("")}</div>`;
  };

  app.openTopicBase = function openTopic(id) {
    id = app.topicKey(id);
    const t = app.getTopic(id);
    if (!t) return;
    app.activeTopic = id;
    app.s.lastTopic = id;
    app.save();
    app.renderTopic();
    const d = document.getElementById("topicDialog");
    if (!d.open) d.showModal();
    d.scrollTop = 0;
  };

  app.openTopic = function (id) {
    app.openTopicBase(id);
    const t = app.getTopic(app.topicKey(id));
    if (t.code && ["cpp", "py"].includes(t.subject)) {
      const b = document.createElement("button");
      b.className = "outline-btn";
      b.dataset.action = "topic-to-lab";
      b.dataset.id = t.id;
      b.textContent = "Open code in lab";
      document.querySelector("#topicDialog .dialog-actions").append(b);
    }
  };
}
