// Feature methods use the shared application context; no browser globals are added.
export function register(app) {
  app.chatText = function chatText(text) {
    return text
      .split(/(```[\s\S]*?```)/g)
      .map((p) =>
        p.startsWith("```")
          ? `<pre class="code"><code>${app.esc(p.replace(/^```[^\n]*\n?/, "").replace(/```$/, ""))}</code></pre>`
          : `<div class="chat-prose">${app.esc(p)}</div>`,
      )
      .join("");
  };

  app.renderAssistant = function renderAssistant() {
    return `${app.header("A study partner, at your pace.", "Ask about a concept, your plan, an exam answer or a piece of code.", "STUDY ASSISTANT · SEARCH + OPTIONAL ON-DEVICE AI")}<div class="assistant-grid"><section class="chat-card"><div class="chat-top"><div><span class="live-dot"></span><strong>${app.chatMode === "ai" ? "AI + syllabus" : "Syllabus search"}</strong><small>${app.chatMode === "ai" ? "Matching questions use study notes · open questions use AI drafts" : "Notes, worked examples and follow-up questions"}</small></div><button class="text-btn" data-action="chat-clear">Clear chat</button></div><div id="chatMessages" class="chat-messages">${app.s.chat.length ? app.s.chat.map((m) => `<article class="chat-message ${m.role}"><span class="chat-avatar">${m.role === "user" ? "RT" : app.icon("spark")}</span><div><div class="chat-role">${m.role === "user" ? "You" : m.mode === "ai" ? "On-device AI" : "Syllabus search"}</div>${app.chatText(m.text)}${m.suggestions?.length ? `<div class="chat-suggestions" aria-label="Continue this conversation">${m.suggestions.map((x) => `<button type="button" class="filter-chip" data-action="chat-prompt" data-prompt="${app.esc(x.prompt)}">${app.esc(x.label)}</button>`).join("")}</div>` : ""}${m.sources?.length ? `<div class="chat-sources">${m.sources.map((id) => `<button class="filter-chip" data-action="topic" data-id="${id}">${app.esc(app.getTopic(id)?.title || id)} ${app.icon("arrow")}</button>`).join("")}</div>` : ""}</div></article>`).join("") : `<div class="chat-empty">${app.icon("spark")}<h2>What are we figuring out today?</h2><p>Start with a chapter, a question, or your next study session.</p><div class="prompt-grid">${["Explore a subject", "What should I study next?", "Explain fan-out with an example", "Explain C++ templates"].map((t) => `<button data-action="chat-prompt" data-prompt="${t}">${t} ${app.icon("arrow")}</button>`).join("")}</div></div>`}</div><form id="chatForm" class="chat-compose"><textarea id="chatInput" maxlength="2000" aria-label="Ask a study question" placeholder="Ask a question… Shift + Enter for a new line" rows="2">${app.esc(app.chatDraft)}</textarea><div class="between"><select id="chatMode" aria-label="Assistant mode"><option value="search" ${app.chatMode === "search" ? "selected" : ""}>Syllabus search</option><option value="ai" ${app.chatMode === "ai" ? "selected" : ""} ${app.aiReady ? "" : "disabled"}>AI + syllabus</option></select><button class="primary-btn" type="submit" ${app.chatBusy ? "disabled" : ""}>${app.chatBusy ? "Thinking…" : "Send"} ${app.icon("arrow")}</button></div></form></section><aside class="stack assistant-side"><section class="card ai-card"><span class="tag medium">EXPERIMENTAL AI</span><h3>A model on your device.</h3><p>Load the model to ask open-ended questions and get code explanations without an API key.</p><div class="ai-state" id="aiStatus" role="status">${app.esc(app.aiStatus)}</div><button class="primary-btn" data-action="ai-enable" ${app.aiBusy || app.aiReady ? "disabled" : ""}>${app.aiReady ? "AI ready" : app.aiBusy ? "Loading…" : "Enable on-device AI"}</button><button class="text-btn" data-action="ai-stop" ${app.aiBusy || app.chatBusy ? "" : "disabled"}>Stop AI / download</button><small>Qwen2.5 Coder 0.5B · approximately 700 MB initial download. Uses browser memory; downloaded files may be cached. A desktop is recommended. Download speed and CPU affect response time. Answers and code fixes can be wrong; check them against your notes and test results.</small></section><section class="card"><h3>Grounded in your preparation</h3><p class="card-sub small muted">Matching syllabus questions use the authored notes directly. Open-ended questions and debugging use the local AI model. Planning answers use your current progress. Chat and code stay on this device in AI mode.</p><button class="text-btn card-sub" data-action="nav" data-view="plan">Review my plan ${app.icon("arrow")}</button></section></aside></div>`;
  };

  app.scrollChat = function scrollChat() {
    const el = document.getElementById("chatMessages");
    if (el) el.scrollTop = el.scrollHeight;
  };

  app.retrieve = function retrieve(q) {
    return app.StudySearch.retrieve(q, app.TOPICS);
  };

  app.planContext = function planContext() {
    const weak = app.TOPICS.filter((t) => app.status(t.id) === "weak"),
      next = app.priorityTopics().slice(0, 3);
    return `Your plan: ${app.s.customPlan.days.length} days, ${app.s.customPlan.prefs.hours} study hours/day. ${app.TOPICS.filter((t) => app.status(t.id) === "done").length}/${app.TOPICS.length} topic groups completed; ${weak.length} weak. ${app.s.customPlan.backlog.length} topics still need a slot. Next priorities: ${next.map((t) => t.title + " (" + app.getSubject(t.subject).short + ")").join("; ")}.`;
  };

  app.searchReply = function searchReply(q, route) {
    return app.StudySearch.reply(route, {
      topics: app.TOPICS,
      subjects: app.SUBJECTS,
      shortBank: app.SHORT_BANK,
      longBank: app.LONG,
      hinglish: app.s.hinglish,
      planText: app.planContext(),
      priorities: app.priorityTopics(),
    });
  };

  app.updateAIStatus = function updateAIStatus() {
    const el = document.getElementById("aiStatus");
    if (el) el.textContent = app.aiStatus;
  };

  app.createAIWorker = function createAIWorker() {
    if (app.aiWorker) return;
    app.aiWorker = new Worker("/workers/ai-worker.js", { type: "module" });
    app.aiWorker.onmessage = (e) => {
      const d = e.data;
      if (d.kind === "loading") {
        app.aiStatus = d.text;
        app.updateAIStatus();
      } else if (d.kind === "progress") {
        app.aiStatus = `Downloading ${d.file || "model"}${Number.isFinite(d.progress) ? " · " + Math.round(d.progress) + "%" : ""}`;
        app.updateAIStatus();
      } else if (d.kind === "ready") {
        app.aiReady = true;
        app.aiBusy = false;
        app.aiStatus = "Ready · model loaded on this device";
        if (app.aiJob?.type === "load") {
          clearTimeout(app.aiTimer);
          app.aiJob = null;
          app.chatMode = "ai";
          app.render();
        } else app.updateAIStatus();
      } else if (d.kind === "token" && app.aiJob?.type === "generate") {
        const m = app.s.chat.find((x) => x.id === app.aiJob.id);
        if (m) {
          m.text = d.text;
          app.updateChatStream(m);
        }
      } else if (d.kind === "done" && app.aiJob?.type === "generate") {
        const m = app.s.chat.find((x) => x.id === app.aiJob.id);
        if (m)
          m.text = d.text || "No answer was generated. Try a shorter question.";
        app.chatBusy = false;
        app.aiBusy = false;
        app.aiJob = null;
        clearTimeout(app.aiTimer);
        app.save();
        app.render();
      } else if (d.kind === "error")
        app.aiFail(
          d.message || d.text || "The model could not load or respond.",
        );
    };
    app.aiWorker.onerror = (e) =>
      app.aiFail(
        e.message ||
          "The AI worker could not start. Syllabus search remains available.",
      );
  };

  app.updateChatStream = function updateChatStream(m) {
    if (app.view !== "assistant") return;
    const msgs = document.getElementById("chatMessages");
    if (!msgs) return;
    const last = msgs.querySelector(".chat-message:last-child .chat-prose");
    if (last) last.textContent = m.text;
    app.scrollChat();
  };

  app.aiFail = function aiFail(message) {
    clearTimeout(app.aiTimer);
    if (app.aiJob?.type === "generate") {
      const m = app.s.chat.find((x) => x.id === app.aiJob.id);
      if (m)
        m.text =
          m.text === "Thinking…"
            ? `AI could not complete this answer: ${message}`
            : m.text + "\n\n[Generation stopped: " + message + "]";
    }
    app.aiWorker?.terminate();
    app.aiWorker = null;
    app.aiReady = false;
    app.aiBusy = false;
    app.chatBusy = false;
    app.aiJob = null;
    app.chatMode = "search";
    app.aiStatus = message;
    app.save();
    if (app.view === "assistant") app.render();
    else app.toast(message);
  };

  app.enableAI = function enableAI() {
    if (app.aiBusy || app.aiReady) return;
    app.createAIWorker();
    app.aiBusy = true;
    app.aiStatus = "Preparing model download…";
    app.aiJob = { type: "load" };
    app.aiWorker.postMessage({ action: "load", id: "load" });
    app.aiTimer = setTimeout(
      () =>
        app.aiFail(
          "Model loading took too long. Retry on a faster connection; cached files may be reused.",
        ),
      600000,
    );
    app.render();
  };

  app.sendChat = async function sendChat(prompt) {
    if (app.chatBusy) return;
    const q = (prompt || app.chatDraft).trim();
    if (!q) return;
    app.chatDraft = "";
    const route = app.StudySearch.resolve(q, app.s.chat, app.TOPICS),
      hits = route.hits;
    app.s.chat.push({ id: crypto.randomUUID(), role: "user", text: q });
    app.s.chat = app.s.chat.slice(-30);
    if (
      app.chatMode === "search" ||
      !app.aiReady ||
      !["unmatched", "code"].includes(route.kind)
    ) {
      const r = app.searchReply(q, route);
      app.s.chat.push({
        id: crypto.randomUUID(),
        role: "assistant",
        mode: "search",
        ...r,
      });
      app.save();
      app.render();
      return;
    }
    const id = crypto.randomUUID();
    app.s.chat.push({
      id,
      role: "assistant",
      mode: "ai",
      text: "Thinking…",
      sources: hits.map((t) => t.id),
    });
    app.chatBusy = true;
    app.aiBusy = true;
    app.aiJob = { id, type: "generate" };
    const context = hits
      .slice(0, 1)
      .map(
        (t) =>
          t.title +
          ": " +
          t.brief +
          "\n" +
          t.points.join("\n") +
          "\nWorked example: " +
          t.question +
          "\n" +
          t.steps.join("\n"),
      )
      .join("\n")
      .slice(0, 2300);
    const messages = [
      {
        role: "system",
        content:
          "You are a college study tutor. Answer in under 70 words. If reference notes are supplied, base your answer ONLY on those notes. Reuse their definitions and numerical example exactly. Do not invent a different example. Explain the requested concept only. For code questions, output the corrected code FIRST in a code block, then at most one sentence naming the bug. Do not claim you ran code. Say if unsure.\nStudy notes: " +
          context +
          (/plan|next|priorit|schedule|progress/i.test(q)
            ? "\n" + app.planContext()
            : ""),
      },
      { role: "user", content: q.slice(0, 2000) },
    ];
    app.aiWorker.postMessage({ action: "generate", id, messages });
    app.aiTimer = setTimeout(
      () =>
        app.aiFail(
          "Generation stopped after 3 minutes. Try a shorter question.",
        ),
      180000,
    );
    app.save();
    app.render();
  };
}
