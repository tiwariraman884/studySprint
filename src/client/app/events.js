// Central event delegation. Registration order preserves existing actions and backups.
export function registerEvents(app) {
  window.addEventListener("resize", app.updateNavAccess);
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || el.disabled) return;
    const a = el.dataset.action,
      id = el.dataset.id;
    e.preventDefault();
    if (a === "nav") {
      app.navigate(el.dataset.view);
    } else if (a === "menu") {
      app.mobileOpen = !app.mobileOpen;
      app.render();
    } else if (a === "day") {
      app.selectedDay = +el.dataset.day;
      app.render();
    } else if (a === "topic") {
      app.openTopic(id);
    } else if (a === "close-topic") {
      document.getElementById("topicDialog").close();
    } else if (a === "close-settings") {
      document.getElementById("settingsDialog").close();
    } else if (a === "subject") {
      app.subjectFilter = id;
      app.statusFilter = "all";
      app.query = "";
      app.navigate("subjects");
    } else if (a === "complete") {
      app.setStatus(id, app.status(id) === "done" ? "not-started" : "done");
      app.toast(
        app.status(id) === "done"
          ? "Topic completed. Keep going!"
          : "Topic moved back to Not started.",
      );
    } else if (a === "weak") {
      app.setStatus(id, app.status(id) === "weak" ? "not-started" : "weak");
      app.toast(
        app.status(id) === "weak"
          ? "Added to your priority list."
          : "Weak mark removed.",
      );
    } else if (a === "topic-status") {
      app.setStatus(id, el.dataset.status);
      app.toast(`Marked ${app.statusName(el.dataset.status).toLowerCase()}.`);
    } else if (a === "reviewed") {
      const key = app.topicKey(id);
      app.s.reviews[key] = Date.now();
      app.persistWrite?.("revision", {
        key,
        at: app.s.reviews[key],
        confidence: app.s.confidence?.[key] ?? null,
      });
      app.save();
      app.render();
      app.toast(
        "Revision recorded. Keep using recall to check your confidence.",
      );
    } else if (a === "block") {
      app.s.blocks[id] = !app.s.blocks[id];
      app.save();
      app.render();
    } else if (a === "edit-block") {
      app.editBlock(id);
    } else if (a === "save-block") {
      const n = Number(document.getElementById("blockMinutes").value);
      if (!Number.isInteger(n) || n < 5 || n > 240) {
        app.toast("Choose a duration between 5 and 240 minutes.");
        return;
      }
      const b = app.PLAN.flatMap((p) => p.blocks).find((b) => b.id === id);
      b.minutes = n;
      app.s.durations[id] = n;
      app.save();
      document.getElementById("settingsDialog").close();
      app.render();
      app.toast("Study block duration updated.");
    } else if (a === "settings") {
      app.openSettings();
    } else if (a === "save-settings") {
      const value = document.getElementById("startDate").value;
      if (!value) {
        app.toast("Choose a valid start date.");
        return;
      }
      app.s.start = value;
      app.s.hinglish = document.getElementById("hinglishToggle").checked;
      app.save();
      app.selectedDay = app.currentDay();
      document.getElementById("settingsDialog").close();
      app.render();
      app.toast("Study settings saved.");
    } else if (a === "lastday") {
      app.revisionFilter = "lastday";
      app.subjectFilter = "all";
      app.navigate("revision");
    } else if (a === "revision-filter") {
      app.revisionFilter = el.dataset.filter;
      app.render();
    } else if (a === "clear-filters") {
      app.subjectFilter = "all";
      app.statusFilter = "all";
      app.query = "";
      app.render();
    } else if (a === "timer") {
      if (app.s.timer.running) {
        app.s.timer.remaining = Math.max(
          0,
          Math.ceil((app.s.timer.end - Date.now()) / 1000),
        );
        app.s.timer.running = false;
      } else {
        if (app.s.timer.remaining <= 0) app.s.timer.remaining = 1500;
        app.s.timer.running = true;
        app.s.timer.end = Date.now() + app.s.timer.remaining * 1000;
      }
      app.save();
      app.render();
    } else if (a === "timer-reset") {
      app.s.timer = { remaining: 1500, running: false, end: 0 };
      app.save();
      app.render();
    } else if (a === "subject-quiz") {
      app.quizSubject = id;
      app.navigate("quiz");
    } else if (a === "quiz-subject") {
      app.quizSubject = id;
      app.render();
    } else if (a === "quiz-start") {
      app.startQuiz();
    } else if (a === "quiz-answer") {
      if (!app.s.quiz.checked) {
        app.s.quiz.selected = +el.dataset.option;
        app.save();
        app.render();
      }
    } else if (a === "quiz-check") {
      const q = app.s.quiz;
      if (q.selected === null || q.checked) return;
      const t = app.getTopic(q.ids[q.index]),
        correct = q.selected === t.answer;
      q.checked = true;
      q.answers.push({ id: t.id, selected: q.selected, correct });
      if (!correct) {
        app.s.status[app.topicKey(t.id)] = "weak";
        if (!app.s.missed.includes(t.id)) app.s.missed.push(t.id);
      } else {
        app.s.missed = app.s.missed.filter((x) => x !== t.id);
      }
      app.save();
      app.render();
    } else if (a === "quiz-next") {
      const q = app.s.quiz;
      if (!q.checked) return;
      if (q.index < q.ids.length - 1) {
        q.index++;
        q.selected = null;
        q.checked = false;
      } else {
        q.complete = true;
        const attemptId =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `attempt-${Date.now()}`;
        const score = q.answers.filter((x) => x.correct).length;
        app.s.history.unshift({
          id: attemptId,
          at: Date.now(),
          subject: app.getSubject(q.subject)?.name || "Mixed subjects",
          subjectId: q.subject,
          score,
          total: q.ids.length,
        });
        app.persistWrite?.("attempt", {
          id: attemptId,
          subjectKey: q.subject === "all" ? null : q.subject,
          score,
          total: q.ids.length,
          at: Date.now(),
        });
        app.s.history = app.s.history.slice(0, 20);
      }
      app.save();
      app.render();
      window.scrollTo({ top: 0, behavior: "instant" });
    } else if (a === "quiz-new") {
      app.s.quiz = null;
      app.save();
      app.render();
    } else if (a === "quiz-exit") {
      app.save();
      app.navigate("overview");
      app.toast("Quiz saved. Return to Practice quiz to continue.");
    } else if (a === "missed-revision") {
      app.revisionFilter = "missed";
      app.subjectFilter = "all";
      app.navigate("revision");
    } else if (a === "print") {
      window.print();
    } else if (a === "export") {
      app.exportProgress();
    } else if (a === "import") {
      document.getElementById("importFile").click();
    } else if (a === "settings-tab") {
      app.settingsTab = el.dataset.tab || "preferences";
      app.openSettings(app.settingsTab);
    } else if (a === "auth-open") {
      app.openAuth(el.dataset.mode || "signin");
    } else if (a === "auth-mode") {
      app.openAuth(el.dataset.mode || "signin");
    } else if (a === "close-auth") {
      document.getElementById("authDialog").close();
    } else if (a === "auth-guest") {
      document.getElementById("authDialog").close();
      app.toast("You’re in guest mode. Progress stays on this device until you sign in.");
    } else if (a === "auth-signout") {
      app.authSignOut();
    } else if (a === "auth-resend") {
      app.authResend();
    } else if (a === "onboarding-guest") {
      if (app.workspace?.state.mode === "guest") {
        document.getElementById("authDialog").close();
        app.onboarding = null;
      }
    } else if (a === "onboarding-back") {
      app.onboardingBack();
    } else if (a === "onboarding-finish") {
      app.onboardingFinish();
    } else if (a === "import-open") {
      app.openImport();
    } else if (a === "close-import") {
      document.getElementById("migrateDialog").close();
    } else if (a === "confirm-import") {
      app.confirmImport();
    } else if (a === "conflict-keep") {
      app.resolveConflict(el.dataset.choice);
    } else if (a === "sync-retry") {
      app.workspace?.flush().then(() => app.toast("Retried queued changes."));
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "topicSearch") {
      app.query = e.target.value;
      app.render();
    }
    if (e.target.id === "topicNote") {
      app.s.notes[e.target.dataset.id] = e.target.value;
      app.save();
    }
  });
  document.addEventListener("change", async (e) => {
    if (e.target.id === "subjectFilter") {
      app.subjectFilter = e.target.value;
      app.render();
    }
    if (e.target.id === "statusFilter") {
      app.statusFilter = e.target.value;
      app.render();
    }
    if (e.target.id === "quizScope") {
      app.quizScope = e.target.value;
      app.render();
    }
    if (e.target.id === "quizSize") {
      app.quizSize = +e.target.value;
      app.render();
    }
    if (e.target.id === "importFile" && e.target.files[0]) {
      try {
        if (e.target.files[0].size > 5e6)
          throw Error("Backup file is too large.");
        app.s = app.validateBackup(JSON.parse(await e.target.files[0].text()));
        for (const b of app.PLAN.flatMap((p) => p.blocks)) {
          b.minutes = app.s.durations[b.id] || app.DEFAULT_DURATIONS[b.id];
        }
        app.save();
        document.getElementById("settingsDialog").close();
        app.render();
        app.toast("Progress restored. Start a new quiz when ready.");
      } catch (err) {
        app.toast(err.message || "Could not read this backup.");
      }
    }
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id === "globalSearchForm") {
      e.preventDefault();
      app.query = document.getElementById("globalSearch").value;
      app.unitFilter = "all";
      app.subjectFilter = "all";
      app.statusFilter = "all";
      app.navigate("subjects");
      document.getElementById("topicSearch")?.focus();
    }
  });
  // Account, onboarding and profile forms. Each one has a visible error slot;
  // nothing here relies on a toast alone for validation.
  document.addEventListener("submit", (e) => {
    const authForm = e.target.closest("[data-auth-form]");
    const onboarding = e.target.closest("[data-onboarding-form]");
    const profile = e.target.closest("[data-profile-form]");
    if (!authForm && !onboarding && !profile) return;
    e.preventDefault();
    if (authForm) {
      if (app.authBusy) return;
      const data = new FormData(authForm);
      if (authForm.dataset.authForm === "signup") app.submitAuth("signup", data);
      else if (authForm.dataset.authForm === "reset") app.submitAuth("reset", data);
      else app.submitAuth("signin", data);
      return;
    }
    if (onboarding) {
      // The stepper's current step is the authoritative one for the form.
      const step = Number(document.querySelector(".stepper .step.current .step-number")?.textContent || 1);
      app.onboardingNext(onboarding, step);
      return;
    }
    if (profile) app.saveProfileForm(profile, profile.dataset.profileForm);
  });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      document.getElementById("globalSearch")?.focus();
    }
  });
  for (const id of ["topicDialog", "settingsDialog"]) {
    const d = document.getElementById(id);
    d.addEventListener("click", (e) => {
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          d.close();
      }
    });
  }
  setInterval(app.updateTimer, 1000);
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || el.disabled) return;
    const a = el.dataset.action,
      id = el.dataset.id;
    if (a === "scope") {
      app.s.scope = el.dataset.scope;
      app.unitFilter = "all";
      app.save();
      app.render();
    } else if (a === "generate-plan") {
      const p = {
        start: document.getElementById("planStart").value,
        days: +document.getElementById("planDays").value,
        hours: +document.getElementById("planHours").value,
        scope: document.getElementById("planScope").value,
        subjects: [
          ...document.querySelectorAll('input[name="planSubject"]:checked'),
        ].map((x) => x.value),
        excludeDone: document.getElementById("excludeDone").checked,
      };
      if (!app.validPrefs(p)) {
        app.toast(
          "Choose a valid date, 1–60 days, 1–12 hours and at least one subject.",
        );
        return;
      }
      app.s.planPrefs = p;
      app.s.customPlan = app.buildCustomPlan(p);
      app.selectedDay = 1;
      app.save();
      app.render();
      app.toast("Plan generated. Your topic progress is unchanged.");
    } else if (a === "custom-block") {
      app.s.customPlan.completed[id] = !app.s.customPlan.completed[id];
      app.save();
      app.render();
    } else if (a === "syllabus-subject") {
      app.syllabusSubject = id;
      app.render();
    } else if (
      a === "clear-all-filters" ||
      a === "subject" ||
      a === "clear-filters"
    ) {
      app.unitFilter = "all";
      if (a !== "subject") {
        app.subjectFilter = "all";
        app.statusFilter = "all";
        app.query = "";
      }
      app.render();
    } else if (a === "long-open") {
      app.openLong(id);
    } else if (a === "long-close") {
      document.getElementById("longDialog").close();
    } else if (a === "long-topic") {
      document.getElementById("longDialog").close();
      app.openTopic(id);
    } else if (a === "long-done") {
      app.s.longDone[id] = !app.s.longDone[id];
      app.save();
      el.innerHTML =
        app.icon("check") +
        (app.s.longDone[id] ? "Practised — click to unmark" : "Mark practised");
      app.render();
      app.toast("Writing practice updated.");
    } else if (a === "copy-long") {
      app.copyCode(app.LONG.find((l) => l.id === id).code);
    } else if (a === "custom-quiz-start") {
      const n = Number(document.getElementById("quizCount").value),
        max = app.quizPool().length;
      if (!Number.isInteger(n) || n < 1 || n > max) {
        app.toast(`Enter a whole number from 1 to ${max}.`);
        return;
      }
      app.quizSize = n;
      app.startQuiz();
    } else if (a === "save-preferences") {
      app.s.hinglish = document.getElementById("hinglishToggle").checked;
      app.save();
      document.getElementById("settingsDialog").close();
      app.render();
      app.toast("Preferences saved.");
    } else if (a === "save-academic-profile") {
      app.saveAcademicProfile();
    } else if (a === "settings-plan") {
      document.getElementById("settingsDialog").close();
      app.navigate("plan");
    } else if (a === "practice-tab") {
      app.practiceTab = el.dataset.tab;
      app.render();
    } else if (a === "studymap-branch") {
      app.activeBranchId = el.dataset.id;
      app.render();
    } else if (a === "studymap-semester") {
      app.activeSemester = +el.dataset.sem;
      app.render();
    } else if (a === "studymap-group") {
      app.activeFirstYearGroup = el.dataset.group;
      app.render();
    } else if (a === "studymap-tab") {
      app.studymapTab = el.dataset.tab;
      app.render();
    } else if (a === "studymap-bridge") {
      app.activeBridgeCourse = !app.activeBridgeCourse;
      app.render();
    } else if (a === "curriculum-matrix") {
      app.navigate("curriculum");
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "longScore") {
      const n = Number(e.target.value);
      if (e.target.value !== "" && Number.isInteger(n) && n >= 0 && n <= 10)
        app.s.longScores[e.target.dataset.id] = n;
      else delete app.s.longScores[e.target.dataset.id];
      app.save();
    }
    if (e.target.id === "quizCount") app.quizSize = +e.target.value;
    if (e.target.id === "longDraft") {
      app.s.longDrafts[e.target.dataset.id] = e.target.value;
      app.save();
    }
    if (e.target.id === "longSearch") {
      app.longQuery = e.target.value;
      app.render();
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "unitFilter") {
      app.unitFilter = e.target.value;
      app.render();
    }
    if (e.target.id === "subjectFilter") {
      app.unitFilter = "all";
      app.render();
    }
    if (e.target.id === "longSource") {
      app.longSource = e.target.value;
      app.render();
    }
    if (e.target.id === "longScore") {
      const n = Number(e.target.value);
      if (e.target.value === "" || !Number.isInteger(n) || n < 0 || n > 10) {
        delete app.s.longScores[e.target.dataset.id];
        if (e.target.value !== "") app.toast("Use a self-score from 0 to 10.");
      } else app.s.longScores[e.target.dataset.id] = n;
      app.save();
    }
  });
  app.longModal.addEventListener("click", (e) => {
    if (e.target === app.longModal) {
      const r = app.longModal.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        app.longModal.close();
    }
  });
  window.addEventListener("message", (e) => {
    if (e.source !== app.frame.contentWindow || e.data?.channel !== "study-lab")
      return;
    const d = e.data;
    if (d.kind === "frame-ready") {
      app.frameReady = true;
      return;
    }
    if (!app.labRun || d.id !== app.labRun) return;
    if (d.kind === "status" || d.kind === "running") {
      app.labStatus = d.text;
      if (d.kind === "running") {
        clearTimeout(app.labTimeout);
        app.labTimeout = setTimeout(
          () => app.stopLab("Execution stopped after 15 seconds."),
          15000,
        );
      }
    } else if (d.kind === "stdout")
      app.labOut = (app.labOut + d.text).slice(0, 32000);
    else if (d.kind === "stderr")
      app.labErr = (app.labErr + d.text).slice(0, 32000);
    else if (d.kind === "error") {
      app.labErr = d.text;
      app.finishLab("Runtime error");
    } else if (d.kind === "done") app.finishLab("Finished");
    app.updateLab();
  });
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || el.disabled) return;
    const a = el.dataset.action,
      id = el.dataset.id;
    if (a === "scope" || a === "subject-quiz") {
      app.quizUnit = "all";
      app.render();
    } else if (a === "theme-toggle") {
      app.s.theme = app.s.theme === "dark" ? "light" : "dark";
      app.save();
      app.render();
    } else if (a === "practice-reset") {
      app.practiceMode = "all";
      app.subjectFilter = "all";
      app.unitFilter = "all";
      app.longSource = "all";
      app.longQuery = "";
      app.query = "";
      app.render();
    } else if (a === "question-done") {
      app.s.questionDone[id] = !app.s.questionDone[id];
      app.save();
      el.innerHTML =
        app.icon(app.s.questionDone[id] ? "check" : "question") +
        (app.s.questionDone[id] ? "Practised · unmark" : "Mark practised");
    } else if (a === "chapter-open") app.openChapter(id, +el.dataset.unit);
    else if (a === "chapter-close")
      document.getElementById("chapterDialog").close();
    else if (a === "chapter-topic") {
      document.getElementById("chapterDialog").close();
      app.openTopic(id);
    } else if (a === "chapter-quiz") {
      document.getElementById("chapterDialog").close();
      if (app.s.quiz && !app.s.quiz.complete) {
        app.navigate("quiz");
        app.toast(
          "Your current quiz is saved. Finish it before starting a chapter quiz.",
        );
        return;
      }
      app.quizSubject = id;
      app.quizUnit = el.dataset.unit;
      app.quizScope = "all";
      app.s.scope = "full";
      app.s.quiz = null;
      app.quizSize = Math.min(8, app.quizPool().length);
      app.save();
      app.navigate("quiz");
    } else if (a === "studio-quiz-subject") {
      app.quizSubject = id;
      app.quizUnit = "all";
      app.quizSize = Math.min(app.quizSize, app.quizPool().length) || 1;
      app.render();
    } else if (a === "lab-run") app.runLab();
    else if (a === "lab-stop") app.stopLab();
    else if (a === "lab-clear") {
      app.labOut = "";
      app.labErr = "";
      app.updateLab();
    } else if (a === "lab-download")
      app.downloadText(
        app.s.lab.language === "python"
          ? "main.py"
          : app.s.lab.language === "cpp"
            ? "main.cpp"
            : "main.js",
        app.labCode(),
      );
    else if (a === "lab-ai") {
      app.chatMode = app.aiReady ? "ai" : "search";
      app.chatDraft = `Help me debug this ${app.s.lab.language} code. Return corrected code FIRST in a code block, then name the bug in one short sentence. ${app.labCode().length > 1400 ? "This is a code excerpt (first 1400 characters)." : ""}\n\n${app.labCode().slice(0, 1400)}\n\nOutput / error:\n${(app.labErr || app.labOut || "Not run yet").slice(0, 400)}`;
      app.navigate("assistant");
      app.toast(
        app.aiReady
          ? "Review the prompt and press Send."
          : "Enable on-device AI to analyse this code, then press Send.",
      );
    } else if (a === "chat-prompt") app.sendChat(el.dataset.prompt);
    else if (a === "chat-clear") {
      if (app.chatBusy) {
        app.toast("Stop the AI response before clearing chat.");
        return;
      }
      app.s.chat = [];
      app.save();
      app.render();
    } else if (a === "ai-enable") app.enableAI();
    else if (a === "ai-stop")
      app.aiFail(
        "Stopped by you. Downloaded model files may remain in the browser cache.",
      );
  });
  document.addEventListener("change", (e) => {
    const id = e.target.id,
      v = e.target.value;
    if (id === "practiceMode") {
      app.practiceMode = v;
      app.render();
    } else if (id === "materialSubject") {
      app.materialSubject = v;
      app.render();
    } else if (id === "quizUnit") {
      app.quizUnit = v;
      app.quizSize = Math.min(app.quizSize, app.quizPool().length) || 1;
      app.render();
    } else if (id === "labLanguage") {
      app.stopLab();
      app.s.lab.language = v;
      app.save();
      app.render();
    } else if (id === "labTemplate" && v) {
      app.stopLab();
      const t = app.LAB_TEMPLATES.find((t) => t.id === v);
      app.s.lab.drafts[t.language] = t.code;
      app.s.lab.inputs[t.language] = t.stdin;
      app.labOut = "";
      app.labErr = "";
      app.labStatus = "Example loaded";
      app.save();
      app.render();
    } else if (id === "chatMode") {
      app.chatMode = v;
      app.render();
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "codeEditor") {
      app.s.lab.drafts[app.s.lab.language] = e.target.value;
      app.save();
    } else if (e.target.id === "codeInput") {
      app.s.lab.inputs[app.s.lab.language] = e.target.value;
      app.save();
    } else if (e.target.id === "chatInput") app.chatDraft = e.target.value;
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id === "chatForm") {
      e.preventDefault();
      app.sendChat();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.id === "codeEditor") {
      if (e.key === "Tab") {
        e.preventDefault();
        const el = e.target,
          start = el.selectionStart,
          end = el.selectionEnd;
        el.setRangeText("    ", start, end, "end");
        app.s.lab.drafts[app.s.lab.language] = el.value;
        app.save();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        app.runLab();
      }
    }
    if (e.target.id === "chatInput" && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      app.sendChat();
    }
  });
  document.addEventListener("click", (e) => {
    const el = e.target.closest('[data-action="topic-to-lab"]');
    if (!el) return;
    const t = app.getTopic(el.dataset.id),
      lang = t.subject === "py" ? "python" : "cpp";
    app.stopLab();
    app.s.lab.language = lang;
    app.s.lab.drafts[lang] = t.code;
    app.s.lab.inputs[lang] = "";
    app.save();
    document.getElementById("topicDialog").close();
    app.navigate("lab");
    app.toast(
      "Code loaded. Add any input or missing program setup, then press Run.",
    );
  });
}

