// Feature methods use the shared application context; no browser globals are added.
export function register(app) {
  app.renderQuestions = function renderQuestions() {
    const qs = app.SHORT_BANK.filter((q) => app.questionMatch(q, app.query));
    return `${app.header("Small questions. Strong foundations.", "Chapter-wise short answers with a clear method, a worked solution and a completion check.", "140 SHORT QUESTIONS · 36 CHAPTERS")}${app.practiceFilters(false)}<div class="between results-label"><span class="label">${qs.length} QUESTIONS IN THIS SELECTION</span><button class="text-btn" data-action="nav" data-view="long">Need a longer challenge? ${app.icon("arrow")}</button></div><div class="long-grid">${qs.map((q) => `<article class="question-card"><div class="between"><span class="tag medium">${q.marks} MARKS · ${app.modeLabel(q.mode)}</span><span class="small muted">${app.chapterLabel(q.subject, q.unit)}</span></div><p class="small muted card-sub">${app.getSubject(q.subject).name}</p><h3>${app.esc(q.title)}</h3><p class="long-prompt">${app.esc(q.prompt)}</p><details class="worked-solution"><summary>Reveal step-by-step solution</summary><ol class="steps">${q.steps.map((x) => `<li>${app.esc(x)}</li>`).join("")}</ol>${q.code ? `<pre class="code"><code>${app.esc(q.code)}</code></pre>` : ""}<div class="recall-box">${app.esc(q.answer)}</div>${q.trap ? `<p class="exam-trap"><strong>Common mistake:</strong> ${app.esc(q.trap)}</p>` : ""}</details><button class="text-btn practice-mark" data-action="question-done" data-id="${q.id}">${app.icon(app.s.questionDone[q.id] ? "check" : "question")}${app.s.questionDone[q.id] ? "Practised · unmark" : "Mark practised"}</button></article>`).join("")}</div>${qs.length ? "" : app.empty("No questions match.", "Try another format or switch to Full syllabus.")}`;
  };

  app.renderLong = function renderLong() {
    const qs = app.LONG.filter(
      (q) =>
        app.questionMatch(q, app.longQuery) &&
        (app.longSource === "all" || q.sourceType === app.longSource),
    );
    return `${app.header("Make every mark count.", "Build a complete answer: concept, method, working, and a checked conclusion.", "60 LONG ANSWERS · THEORY / NUMERICAL / PROGRAMMING")}<div class="paper-pattern"><div><span class="label">YOUR UPLOADED THEORY PAPER</span><h2>120 minutes. 60 marks.</h2><p>Q1: 4 × 5 · Q2: 4 × 5 · Q3: 2 × 10</p></div><div><strong>Q3: choose one of (a,b), one of (c,d).</strong><p>20 paper questions + 36 new chapter problems + 4 Python practicals.</p></div></div>${app.practiceFilters(true)}<p class="small muted results-label">${qs.length} questions shown · Chapter questions are authored practice, not predicted or official exam questions.</p><div class="long-grid">${qs.map((q) => `<article class="question-card long-card"><div class="between">${app.subjectIcon(q.subject)}<span class="tag ${q.sourceType === "paper" ? "high" : "medium"}">${q.sourceType === "paper" ? "UPLOADED PAPER" : q.sourceType === "chapter" ? "CHAPTER PRACTICE" : "LAB PRACTICE"}</span></div><p class="small muted card-sub">${app.getSubject(q.subject).name} · ${app.chapterLabel(q.subject, q.unit)} · ${app.modeLabel(q.mode)}</p><h3>${app.esc(q.title)}</h3><p class="long-prompt">${app.esc(q.prompt)}</p><div class="between card-sub"><span class="small muted">${app.s.longDone[q.id] ? "✓ Practised" : app.s.longDrafts[q.id] ? "Draft saved" : "10 marks · " + (q.minutes || 18) + " min"}${app.s.longScores[q.id] !== undefined ? " · " + app.s.longScores[q.id] + "/10" : ""}</span><button class="outline-btn" data-action="long-open" data-id="${q.id}">Write & solve ${app.icon("arrow")}</button></div></article>`).join("")}</div>${qs.length ? "" : app.empty("No questions match.", "Reset filters or switch to Full syllabus.")}`;
  };

  app.tableHTML = function tableHTML(t) {
    return `<div class="table-wrap"><table><thead><tr>${t.headers.map((h) => `<th>${app.esc(h)}</th>`).join("")}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((x) => `<td>${app.esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  };

  app.openLong = function openLong(id) {
    app.activeLong = id;
    const l = app.LONG.find((x) => x.id === id);
    const d = document.getElementById("longDialog");
    d.innerHTML = `<div class="dialog-head"><div><span class="label">${app.getSubject(l.subject).name} · ${l.ref}</span><h2>${l.title}</h2><p class="small muted" style="margin-top:7px">${l.source}${l.page ? " · page " + l.page : ""} · 10-mark practice</p></div><button class="icon-btn" data-action="long-close" aria-label="Close long answer">${app.icon("close")}</button></div><div class="dialog-body"><p class="long-question">${l.prompt}</p>${l.id === "la-alg-c" ? app.tableHTML(l.table) : l.id === "la-dsa-b" ? app.diagram("bfs") : ""}<div class="field" style="margin-top:20px"><label for="longDraft">Your answer / working notes</label><textarea maxlength="50000" id="longDraft" data-id="${l.id}" placeholder="Define the concept, show the method, work the example, and check your conclusion…">${app.esc(app.s.longDrafts[id] || "")}</textarea><small>Autosaved · practise handwriting on paper when preparing for the exam. No automatic grading.</small></div><details class="model-answer"><summary>Reveal the complete worked answer</summary>${l.sections.map(([h, b]) => `<section><h3>${h}</h3><p>${app.esc(b)}</p></section>`).join("")}${l.table ? app.tableHTML(l.table) : ""}${l.diagram ? app.diagram(l.diagram) : ""}${l.code ? `<div class="code-label"><span>${l.subject === "py" ? "Python 3 example" : "C++17 example"}</span><button class="text-btn" data-action="copy-long" data-id="${l.id}">Copy code</button></div><pre class="code"><code>${app.esc(l.code)}</code></pre>` : ""}${l.answer ? `<div class="recall-box" style="margin-top:20px">${l.answer}</div>` : ""}<div class="session-topic-links" style="margin-top:20px">${l.related.map((id) => `<button data-action="long-topic" data-id="${id}">Study: ${app.getTopic(id).title}</button>`).join("")}</div></details><h3>Check your answer against this rubric</h3>${l.rubric.map(([label, n]) => `<div class="rubric-row"><span>${label}</span><strong>${n} mark${n === 1 ? "" : "s"}</strong></div>`).join("")}<div class="field" style="margin-top:18px"><label for="longScore">Your self-score (0–10)</label><input type="number" id="longScore" data-id="${id}" min="0" max="10" step="1" value="${app.s.longScores[id] ?? ""}" placeholder="Not graded yet"></div></div><div class="dialog-actions"><button class="primary-btn" data-action="long-done" data-id="${id}">${app.icon("check")}${app.s.longDone[id] ? "Practised — click to unmark" : "Mark practised"}</button><button class="outline-btn" data-action="print">${app.icon("print")}Print question & notes</button></div>`;
    if (!d.open) d.showModal();
    d.scrollTop = 0;
  };

  app.copyCode = async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      app.toast("Code copied. Run it in your local editor.");
    } catch {
      app.toast("Select the code block and copy it with Ctrl+C.");
    }
  };

  app.practiceFilters = function practiceFilters(isLong) {
    return `<div class="toolbar"><select id="subjectFilter" aria-label="Filter by subject">${app.subjectOptions()}</select><select id="unitFilter" aria-label="Filter by chapter"><option value="all">All chapters</option>${Array.from({ length: app.subjectFilter === "py" ? 11 : 5 }, (_, i) => `<option value="${i + 1}" ${+app.unitFilter === i + 1 ? "selected" : ""}>${app.chapterLabel(app.subjectFilter, i + 1)}</option>`).join("")}</select><select id="practiceMode" aria-label="Question format">${["all", "theory", "numerical", "code"].map((x) => `<option value="${x}" ${app.practiceMode === x ? "selected" : ""}>${app.modeLabel(x)}</option>`).join("")}</select>${
      isLong
        ? `<select id="longSource" aria-label="Question source">${[
            ["all", "All sources"],
            ["paper", "Uploaded CIA 2 paper"],
            ["chapter", "Chapter practice"],
            ["lab", "Lab practice"],
          ]
            .map(
              ([v, n]) =>
                `<option value="${v}" ${app.longSource === v ? "selected" : ""}>${n}</option>`,
            )
            .join("")}</select>`
        : ""
    }<input id="${isLong ? "longSearch" : "topicSearch"}" aria-label="Search questions" value="${app.esc(isLong ? app.longQuery : app.query)}" placeholder="Find a question…"><button class="text-btn" data-action="practice-reset">Reset</button></div>`;
  };

  app.questionMatch = function questionMatch(q, text) {
    return (
      (app.subjectFilter === "all" || q.subject === app.subjectFilter) &&
      (app.unitFilter === "all" || q.unit === +app.unitFilter) &&
      (app.practiceMode === "all" || q.mode === app.practiceMode) &&
      (app.s.scope === "full" || app.EXAM_UNITS[q.subject].includes(q.unit)) &&
      (!text ||
        (q.title + " " + q.prompt).toLowerCase().includes(text.toLowerCase()))
    );
  };
}
