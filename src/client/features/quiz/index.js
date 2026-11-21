// Feature methods use the shared application context; no browser globals are added.
export function register(app) {
  app.renderQuiz = function renderQuiz() {
    if (app.s.quiz?.complete) return app.quizResults();
    if (app.s.quiz) return app.quizActive();
    const pool = app.quizPool();
    return `${app.header("Make practice personal.", "Pick a subject, chapter and question count. Understand every answer before moving on.", "176 QUESTIONS · CUSTOM CHAPTER QUIZZES")}<div class="quiz-shell"><section class="card quiz-setup"><h2>Build your next quiz</h2><p>Every missed question returns to revision and marks its related topic weak.</p><div class="quiz-subjects">${[{ id: "all", name: "Mixed subjects", icon: "layers" }, ...app.SUBJECTS].map((sub) => `<button class="quiz-subject ${app.quizSubject === sub.id ? "selected" : ""}" data-action="studio-quiz-subject" data-id="${sub.id}">${app.icon(sub.icon)}<strong>${sub.name}</strong><span>${app.QUIZ_BANK.filter((t) => (app.s.scope === "full" || t.exam) && (sub.id === "all" || t.subject === sub.id)).length} questions in scope</span></button>`).join("")}</div><div class="quiz-config"><div class="field"><label for="quizUnit">Chapter / exercise</label><select id="quizUnit"><option value="all">All chapters</option>${[
      ...new Set(
        app.QUIZ_BANK.filter(
          (t) =>
            (app.s.scope === "full" || t.exam) &&
            (app.quizSubject === "all" || t.subject === app.quizSubject),
        ).map((t) => t.unit),
      ),
    ]
      .sort((a, b) => a - b)
      .map(
        (n) =>
          `<option value="${n}" ${+app.quizUnit === n ? "selected" : ""}>${app.chapterLabel(app.quizSubject, n)}</option>`,
      )
      .join(
        "",
      )}</select></div><div class="field"><label for="quizScope">Question pool</label><select id="quizScope">${[
      ["all", "All in selection"],
      ["weak", "Weak topics only"],
      ["missed", "Previously missed"],
    ]
      .map(
        ([v, n]) =>
          `<option value="${v}" ${app.quizScope === v ? "selected" : ""}>${n}</option>`,
      )
      .join(
        "",
      )}</select></div><div class="field"><label for="quizCount">Number of questions</label><input id="quizCount" type="number" min="1" max="${Math.max(1, pool.length)}" value="${app.quizSize}"><small>Choose 1–${pool.length}. No duplicate questions.</small></div></div><div class="between"><span class="small muted">${pool.length} available in this selection</span><button class="primary-btn" data-action="custom-quiz-start" ${pool.length ? "" : "disabled"}>Start my quiz ${app.icon("arrow")}</button></div></section>${
      app.s.history.length
        ? `<section class="card card-sub"><h2>Recent practice</h2>${app.s.history
            .slice(0, 8)
            .map(
              (h) =>
                `<div class="history-row"><span>${app.esc(h.subject)}<small class="muted" style="display:block">${new Date(h.at).toLocaleDateString("en-IN")}</small></span><strong>${h.score}/${h.total} · ${Math.round((h.score / h.total) * 100)}%</strong></div>`,
            )
            .join("")}</section>`
        : ""
    }</div>`;
  };

  app.quizPool = function quizPool() {
    return app.QUIZ_BANK.filter(
      (t) =>
        (app.s.scope === "full" || t.exam) &&
        (app.quizSubject === "all" || t.subject === app.quizSubject) &&
        (app.quizUnit === "all" || t.unit === +app.quizUnit) &&
        (app.quizScope === "all" ||
          (app.quizScope === "weak" && app.status(t.id) === "weak") ||
          (app.quizScope === "missed" && app.s.missed.includes(t.id))),
    );
  };

  app.startQuiz = function startQuiz() {
    const pool = app.quizPool().map((t) => t.id);
    for (let i = pool.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    if (!pool.length) return;
    app.s.quiz = {
      ids: pool.slice(0, app.quizSize),
      index: 0,
      selected: null,
      checked: false,
      answers: [],
      subject: app.quizSubject,
      complete: false,
    };
    app.save();
    app.render();
  };

  app.quizActive = function quizActive() {
    const q = app.s.quiz,
      t = app.getTopic(q.ids[q.index]);
    return `${app.header("Take a breath. Trust what you know.", "Read each option carefully. There’s no timer on this quiz.", "PRACTICE QUIZ")}<div class="quiz-shell"><section class="card quiz-card"><div class="between"><span class="label">QUESTION ${q.index + 1} OF ${q.ids.length}</span><button class="text-btn" data-action="quiz-exit">Save & leave</button></div><div class="progress" style="margin-top:15px"><i style="width:${(q.index / q.ids.length) * 100}%"></i></div><p class="muted small" style="margin-top:20px">${app.getSubject(t.subject).name} · ${t.title}</p><h2>${t.mcq}</h2><div class="quiz-options">${t.options.map((opt, i) => `<button class="quiz-option ${q.selected === i ? "selected" : ""} ${q.checked && i === t.answer ? "correct" : ""} ${q.checked && q.selected === i && i !== t.answer ? "wrong" : ""}" data-action="quiz-answer" data-option="${i}" aria-pressed="${q.selected === i}" ${q.checked ? "disabled" : ""}><span class="letter">${"ABCD"[i]}</span><span>${app.esc(opt)}</span>${q.checked && i === t.answer ? app.icon("check") : ""}</button>`).join("")}</div>${q.checked ? `<div class="quiz-feedback ${q.selected !== t.answer ? "wrong" : ""}" role="status"><strong>${q.selected === t.answer ? "That’s right." : "A useful gap to catch."}</strong><p>${t.explanation}</p>${q.selected !== t.answer ? '<p class="small">Added to missed questions. Topic marked weak.</p>' : ""}</div>` : ""}<div class="between"><span class="small muted">${q.answers.filter((a) => a.correct).length} correct so far</span><button class="primary-btn" data-action="${q.checked ? "quiz-next" : "quiz-check"}" ${q.selected === null ? "disabled" : ""}>${q.checked ? (q.index === q.ids.length - 1 ? "See results" : "Next question") : "Check answer"} ${app.icon("arrow")}</button></div></section></div>`;
  };

  app.quizResults = function quizResults() {
    const q = app.s.quiz,
      score = q.answers.filter((a) => a.correct).length;
    return `${app.header("Every attempt moves you forward.", "Review the mistakes now, while the reasoning is still fresh.", "QUIZ COMPLETE")}<div class="quiz-shell"><section class="card quiz-card"><span class="tag done">PRACTICE COMPLETE</span><div class="result-big">${score}<span style="font-size:24px;color:#9ba38c"> / ${q.ids.length}</span></div><h2 style="margin:0 0 10px">${score === q.ids.length ? "A strong recall session." : "You know what to revisit next."}</h2><p class="muted">${q.ids.length - score} missed questions · ${Math.round((score / q.ids.length) * 100)}% correct</p><div class="flex" style="margin-top:23px;flex-wrap:wrap"><button class="primary-btn" data-action="quiz-new">New quiz ${app.icon("arrow")}</button><button class="outline-btn" data-action="missed-revision">Review missed questions</button></div></section><div class="stack" style="margin-top:20px">${q.answers
      .map((a) => {
        const t = app.getTopic(a.id);
        return `<article class="question-card"><span class="tag ${a.correct ? "done" : "weak"}">${a.correct ? "Correct" : "Revisit"}</span><h3>${t.mcq}</h3><p class="small muted">Your answer: ${app.esc(t.options[a.selected])}</p><p class="small" style="margin-top:4px">Correct answer: ${app.esc(t.options[t.answer])}</p><p style="margin-top:12px;font-size:13px;color:#647355">${t.explanation}</p><button class="text-btn" style="margin-top:15px" data-action="topic" data-id="${t.id}">Review ${t.title} ${app.icon("arrow")}</button></article>`;
      })
      .join("")}</div></div>`;
  };
}
