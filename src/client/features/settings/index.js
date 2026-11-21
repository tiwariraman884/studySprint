// Feature methods use the shared application context; no browser globals are added.
export function register(app) {
  app.openSettings = function openSettings() {
    const d = document.getElementById("settingsDialog");
    d.innerHTML = `<div class="dialog-head"><div><span class="label">MAKE IT YOURS</span><h2>Preferences & backups</h2></div><button class="icon-btn" data-action="close-settings" aria-label="Close settings">${app.icon("close")}</button></div><div class="dialog-body"><div class="field"><label class="flex"><input id="hinglishToggle" type="checkbox" ${app.s.hinglish ? "checked" : ""} style="width:auto"> Show simple Hinglish explanations</label></div><div class="banner">${app.icon("shield")}<div>Progress, long-answer drafts, quiz history and your custom plan are saved in this browser. Use export/import to move them to another device. No automatic cross-device sync.</div></div><div class="flex" style="flex-wrap:wrap"><button class="outline-btn" data-action="export">${app.icon("download")}Export progress</button><button class="outline-btn" data-action="import">${app.icon("upload")}Import backup</button><input type="file" id="importFile" accept="application/json" hidden></div><p class="small muted" style="margin-top:15px">Import replaces this browser’s progress with the selected backup. A previous-version backup is supported.</p><button class="text-btn" style="margin-top:20px" data-action="settings-plan">Change plan dates, days & hours ${app.icon("arrow")}</button></div><div class="dialog-actions"><button class="primary-btn" data-action="save-preferences">Save preferences</button></div>`;
    d.showModal();
  };

  app.exportProgress = function exportProgress() {
    const blob = new Blob(
      [
        JSON.stringify(
          { ...app.s, exportedAt: new Date().toISOString() },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "CIA2_Study_Progress.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    app.toast("Progress backup downloaded.");
  };

  app.downloadText = function downloadText(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  app.validateCoreBackup = function validateBackup(raw) {
    if (
      raw.version !== 1 ||
      !raw.status ||
      typeof raw.status !== "object" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(raw.start) ||
      isNaN(new Date(raw.start + "T12:00:00").getTime())
    )
      throw Error("This is not a valid Study Sprint backup.");
    const clean = structuredClone(app.defaults);
    clean.start = raw.start;
    clean.hinglish = raw.hinglish !== false;
    for (const t of app.TOPICS) {
      if (
        ["not-started", "learning", "done", "weak"].includes(raw.status[t.id])
      )
        clean.status[t.id] = raw.status[t.id];
      if (Number.isFinite(raw.completedAt?.[t.id]) && raw.completedAt[t.id] > 0)
        clean.completedAt[t.id] = raw.completedAt[t.id];
      if (Number.isFinite(raw.reviews?.[t.id]) && raw.reviews[t.id] > 0)
        clean.reviews[t.id] = raw.reviews[t.id];
      if (typeof raw.notes?.[t.id] === "string")
        clean.notes[t.id] = raw.notes[t.id].slice(0, 10000);
    }
    for (const b of app.PLAN.flatMap((p) => p.blocks)) {
      if (raw.blocks?.[b.id] === true) clean.blocks[b.id] = true;
      if (
        Number.isInteger(raw.durations?.[b.id]) &&
        raw.durations[b.id] >= 5 &&
        raw.durations[b.id] <= 240
      )
        clean.durations[b.id] = raw.durations[b.id];
    }
    clean.missed = Array.isArray(raw.missed)
      ? [...new Set(raw.missed.filter((id) => app.getTopic(id)))]
      : [];
    clean.history = Array.isArray(raw.history)
      ? raw.history
          .filter(
            (h) =>
              Number.isFinite(h.at) &&
              Number.isInteger(h.score) &&
              Number.isInteger(h.total) &&
              h.total > 0 &&
              h.total <= app.QUIZ_BANK.length &&
              h.score >= 0 &&
              h.score <= h.total &&
              typeof h.subject === "string",
          )
          .slice(0, 20)
      : [];
    if (app.getTopic(raw.lastTopic)) clean.lastTopic = raw.lastTopic;
    return clean;
  };

  app.validateStudyBackup = function (raw) {
    const clean = app.validateCoreBackup(raw);
    clean.scope = raw.scope === "full" ? "full" : "exam";
    const p = raw.planPrefs;
    clean.planPrefs =
      p && app.validPrefs(p)
        ? { ...p, subjects: p.subjects.filter((id) => app.getSubject(id)) }
        : {
            days: 4,
            hours: 7,
            start: clean.start,
            scope: "exam",
            subjects: app.SUBJECTS.map((x) => x.id),
            excludeDone: true,
          };
    clean.longDrafts = {};
    clean.longScores = {};
    clean.longDone = {};
    for (const l of app.LONG) {
      if (typeof raw.longDrafts?.[l.id] === "string")
        clean.longDrafts[l.id] = raw.longDrafts[l.id].slice(0, 50000);
      if (
        Number.isInteger(raw.longScores?.[l.id]) &&
        raw.longScores[l.id] >= 0 &&
        raw.longScores[l.id] <= 10
      )
        clean.longScores[l.id] = raw.longScores[l.id];
      if (raw.longDone?.[l.id]) clean.longDone[l.id] = true;
    }
    const cp = raw.customPlan;
    clean.customPlan = app.validCustomPlan(cp) ? cp : null;
    return clean;
  };

  app.validateBackup = function (raw) {
    const clean = app.validateStudyBackup(raw);
    clean.theme = raw.theme === "light" ? "light" : "dark";
    clean.questionDone = {};
    for (const q of app.SHORT_BANK)
      if (raw.questionDone?.[q.id]) clean.questionDone[q.id] = true;
    clean.chat = Array.isArray(raw.chat)
      ? raw.chat
          .filter(
            (m) =>
              ["user", "assistant"].includes(m.role) &&
              typeof m.text === "string",
          )
          .slice(-30)
          .map((m) => ({
            id: crypto.randomUUID(),
            role: m.role,
            text: m.text.slice(0, 15000),
            ...app.StudySearch.restoreMessage(
              {
                kind: m.kind,
                contextTopicId: m.contextTopicId,
                contextSubjectId: m.contextSubjectId,
                suggestions: m.suggestions,
              },
              app.TOPICS,
              app.SUBJECTS,
            ),
            mode: m.mode === "ai" ? "ai" : "search",
            sources: Array.isArray(m.sources)
              ? m.sources.filter((id) => app.TOPICS.some((t) => t.id === id))
              : [],
          }))
      : [];
    clean.lab = {
      language: ["python", "cpp", "javascript"].includes(raw.lab?.language)
        ? raw.lab.language
        : "python",
      drafts: {},
      inputs: {},
    };
    for (const lang of ["python", "cpp", "javascript"]) {
      if (typeof raw.lab?.drafts?.[lang] === "string")
        clean.lab.drafts[lang] = raw.lab.drafts[lang].slice(0, 30000);
      if (typeof raw.lab?.inputs?.[lang] === "string")
        clean.lab.inputs[lang] = raw.lab.inputs[lang].slice(0, 8000);
    }
    return clean;
  };
}
