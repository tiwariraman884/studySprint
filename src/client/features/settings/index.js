// Feature methods use the shared application context; no browser globals are added.
export function register(app) {
  // Backups and preferences keep the same shape as before. The settings dialog
  // itself is built by the account feature (preferences, profile, subjects and
  // account tabs), so there is a single settings surface.

  app.exportProgress = function exportProgress() {
    const blob = new Blob(
      [JSON.stringify({ ...app.s, exportedAt: new Date().toISOString() }, null, 2)],
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
      if (["not-started", "learning", "done", "weak"].includes(raw.status[t.id]))
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
    // Preserve academic profile across backup restore.
    if (raw.academic && typeof raw.academic === "object") clean.academic = raw.academic;
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
