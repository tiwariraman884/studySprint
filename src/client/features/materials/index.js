// Feature methods use the shared application context; no browser globals are added.
export function register(app) {
  app.renderMaterials = function renderMaterials() {
    const selected = app.CURRICULUM.filter(
      (c) => app.materialSubject === "all" || c.id === app.materialSubject,
    );
    return `${app.header("Your chapter study room.", "Read the idea. Work an example. Close the notes and explain it back.", "NOTES + WORKED ANSWERS + PRIMARY READING")}<div class="toolbar"><select id="materialSubject" aria-label="Study material subject"><option value="all">All selected subjects</option>${app.SUBJECTS.map((x) => `<option value="${x.id}" ${app.materialSubject === x.id ? "selected" : ""}>${x.name}</option>`).join("")}</select><span class="small muted">chapters / exercises in your selection · independent of the focus filter</span></div>${selected
      .map(
        (c) =>
          `<section class="material-section"><div class="section-head"><div><h2>${c.name}</h2><p class="sub">${c.code} · ${c.units.length} ${c.id === "py" ? "exercises" : "chapters"}</p></div>${app.subjectIcon(c.id)}</div><div class="chapter-grid">${c.units
            .map((u) => {
              const ts = app.TOPICS.filter(
                  (t) => t.subject === c.id && t.unit === u.number,
                ),
                q = app.CHAPTER_BANK.find(
                  (q) =>
                    q.subject === c.id &&
                    q.unit === u.number &&
                    q.kind === "long",
                );
              return `<article class="card chapter-card"><div class="between"><span class="label">${app.chapterLabel(c.id, u.number)}</span><span class="tag ${(app.EXAM_UNITS[c.id] || []).includes(u.number) ? "done" : "medium"}">${app.EXAM_UNITS[c.id].includes(u.number) ? "EXAM FOCUS" : "FULL SYLLABUS"}</span></div><h3>${app.esc(ts[0]?.unitName || app.chapterLabel(c.id, u.number))}</h3><p>${app.esc(u.text.slice(0, 230))}${u.text.length > 230 ? "…" : ""}</p><div class="chapter-meta">${ts.length} topic guides · 2 new practice questions · 2 new MCQs</div><div class="flex"><button class="outline-btn" data-action="chapter-open" data-id="${c.id}" data-unit="${u.number}">Study chapter ${app.icon("arrow")}</button><button class="text-btn" data-action="chapter-quiz" data-id="${c.id}" data-unit="${u.number}">Quiz</button></div></article>`;
            })
            .join(
              "",
            )}</div><div class="resource-links">${app.RESOURCES[c.id].map(([t, url, d]) => `<a href="${url}" target="_blank" rel="noopener noreferrer"><strong>${t} ↗</strong><span>${d}</span></a>`).join("")}</div></section>`,
      )
      .join("")}`;
  };

  app.openChapter = function openChapter(sub, n) {
    const c = app.CURRICULUM.find((c) => c.id === sub),
      u = c.units.find((u) => u.number === n),
      ts = app.TOPICS.filter((t) => t.subject === sub && t.unit === n),
      d = document.getElementById("chapterDialog");
    d.innerHTML = `<div class="dialog-head"><div><span class="label">${c.name} · ${app.chapterLabel(sub, n)}</span><h2>Your chapter essentials</h2></div><button class="icon-btn" data-action="chapter-close" aria-label="Close chapter">${app.icon("close")}</button></div><div class="dialog-body"><div class="recall-box">${app.esc(u.text)}</div>${ts.map((t) => `<section class="chapter-note"><div class="between"><h3>${app.esc(t.title)}</h3>${app.tag(app.status(t.id))}</div><p>${app.esc(t.brief)}</p>${app.s.hinglish && t.hinglish ? `<p class="hinglish">${app.esc(t.hinglish)}</p>` : ""}<ul>${(t.points || []).map((p) => `<li>${app.esc(p)}</li>`).join("")}</ul><div class="recall-box">${app.esc(t.recall)}</div><button class="text-btn" data-action="chapter-topic" data-id="${t.id}">Worked example & personal notes ${app.icon("arrow")}</button></section>`).join("")}<h3>Write it to learn it</h3>${app.CHAPTER_BANK.filter(
      (q) => q.subject === sub && q.unit === n,
    )
      .map(
        (q) =>
          `<details class="worked-solution"><summary>${q.marks} marks · ${app.esc(q.title)}</summary><p>${app.esc(q.prompt)}</p><ol class="steps">${q.steps.map((x) => `<li>${app.esc(x)}</li>`).join("")}</ol><div class="recall-box">${app.esc(q.answer)}</div></details>`,
      )
      .join(
        "",
      )}</div><div class="dialog-actions"><button class="primary-btn" data-action="chapter-quiz" data-id="${sub}" data-unit="${n}">Quiz this chapter</button><button class="outline-btn" data-action="print">Print notes</button></div>`;
    d.showModal();
  };
}
