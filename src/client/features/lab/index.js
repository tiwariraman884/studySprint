// Feature methods use the shared application context; no browser globals are added.
export function register(app) {
  app.labCode = function labCode() {
    return (
      app.s.lab.drafts[app.s.lab.language] ??
      app.LAB_TEMPLATES.find((t) => t.language === app.s.lab.language).code
    );
  };

  app.labInput = function labInput() {
    return (
      app.s.lab.inputs[app.s.lab.language] ??
      app.LAB_TEMPLATES.find((t) => t.language === app.s.lab.language).stdin
    );
  };

  app.renderLab = function renderLab() {
    const lang = app.s.lab.language;
    return `${app.header("Ideas in. Understanding out.", "A real code playground for your lab exercises, experiments and “why does this fail?” moments.", "SMART LAB · PYTHON / C++ / JAVASCRIPT")}<div class="lab-toolbar"><select id="labLanguage" aria-label="Programming language">${[
      ["python", "Python 3"],
      ["cpp", "C++17 · GCC 13.2"],
      ["javascript", "JavaScript"],
    ]
      .map(
        ([v, n]) =>
          `<option value="${v}" ${v === lang ? "selected" : ""}>${n}</option>`,
      )
      .join(
        "",
      )}</select><select id="labTemplate" aria-label="Load a code example"><option value="">Load an example…</option>${app.LAB_TEMPLATES.filter(
      (t) => t.language === lang,
    )
      .map((t) => `<option value="${t.id}">${t.name}</option>`)
      .join(
        "",
      )}</select><button class="outline-btn" data-action="lab-download">${app.icon("download")}Save code</button><button class="primary-btn" id="runCode" data-action="lab-run" ${app.labBusy ? "disabled" : ""}>${app.icon("play")}Run code</button><button class="outline-btn" id="stopCode" data-action="lab-stop" ${app.labBusy ? "" : "disabled"}>Stop</button></div><div class="lab-grid"><section class="editor-card"><div class="editor-heading"><span><i class="editor-dot"></i> ${lang === "python" ? "main.py" : lang === "cpp" ? "main.cpp" : "main.js"}</span><span>Autosaved · Ctrl / ⌘ + Enter to run</span></div><textarea id="codeEditor" maxlength="30000" aria-label="Code editor" spellcheck="false" autocapitalize="off" autocomplete="off">${app.esc(app.labCode())}</textarea><div class="stdin-panel"><label for="codeInput">STANDARD INPUT <span>One input value per line</span></label><textarea id="codeInput" maxlength="8000" aria-label="Program standard input" spellcheck="false" placeholder="Type input here before running…">${app.esc(app.labInput())}</textarea></div></section><div class="lab-side"><section class="output-card"><div class="between editor-heading"><strong>Terminal</strong><button class="text-btn" data-action="lab-clear">Clear</button></div><div class="terminal-status" id="labStatus" role="status">${app.esc(app.labStatus)}</div><pre id="labOutput" class="terminal-output" aria-label="Program output">${app.esc(app.labOut || "Your program output will appear here.")}</pre><pre id="labError" class="terminal-error" aria-label="Program errors">${app.esc(app.labErr)}</pre></section><section class="card debugger-card"><div class="between"><h3>${app.icon("spark")} Understand the error</h3><span class="tag medium">DEBUG</span></div><p id="debugHint">${app.esc(app.errorHint(app.labErr))}</p><button class="outline-btn" data-action="lab-ai">Ask AI to debug ${app.icon("arrow")}</button><small>Experimental on-device model. It can misdiagnose errors; verify suggestions by running tests.</small></section></div></div><div class="lab-footnote">${app.icon("shield")}<p>${lang === "cpp" ? "C++ code and standard input are sent to Compiler Explorer only when you press Run. The remote sandbox has execution limits." : "Python and JavaScript run in an isolated browser worker. Stop ends the worker; each run starts fresh."} ${lang === "python" ? "First run downloads Pyodide. NumPy and pandas can load on demand. Files are temporary; Flask servers and some network requests need a local Python installation." : lang === "javascript" ? "Use console.log(), readline() or stdin. DOM and Node.js APIs are unavailable." : ""} <a href="${lang === "cpp" ? "https://github.com/compiler-explorer/compiler-explorer/blob/main/docs/API.md" : lang === "python" ? "https://pyodide.org/en/stable/" : "https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers"}" target="_blank" rel="noopener noreferrer">Runtime details ↗</a></p></div>`;
  };

  app.errorHint = function errorHint(err) {
    if (/IndexError/.test(err))
      return "IndexError: a sequence index is outside its range. For n elements, valid positions are 0 through n−1. Check the loop stop and empty-list case.";
    if (/NameError|not defined/.test(err))
      return "A name is being used before it is defined. Check spelling, scope and the order in which variables are assigned.";
    if (/SyntaxError|expected|IndentationError/.test(err))
      return "Check the first reported line, then the line just before it. Look for missing punctuation, brackets, semicolons or indentation.";
    if (/EOFError/.test(err))
      return "The program requested more input than the standard-input box contains. Add one line for each input() call.";
    if (/ZeroDivisionError/.test(err))
      return "A denominator became zero. Validate it before dividing, and test zero as an explicit edge case.";
    if (/TypeError/.test(err))
      return "An operation received an incompatible type. Inspect the values and convert input text before arithmetic.";
    if (/time|stopped/i.test(err))
      return "Check loop conditions and whether each iteration makes progress. Use a small input while debugging.";
    return err
      ? "Read the first error carefully. Reproduce it with the smallest input, check the relevant line and test one change at a time."
      : "Run your code to see compiler or runtime diagnostics here. These instant hints are rule-based; the optional AI can explain your specific code.";
  };

  app.updateLab = function updateLab() {
    const out = document.getElementById("labOutput"),
      err = document.getElementById("labError"),
      st = document.getElementById("labStatus");
    if (out)
      out.textContent = app.labOut || "Your program output will appear here.";
    if (err) err.textContent = app.labErr;
    if (st) st.textContent = app.labStatus;
    const run = document.getElementById("runCode"),
      stop = document.getElementById("stopCode");
    if (run) run.disabled = app.labBusy;
    if (stop) stop.disabled = !app.labBusy;
    const hint = document.getElementById("debugHint");
    if (hint) hint.textContent = app.errorHint(app.labErr);
  };

  app.finishLab = function finishLab(msg) {
    app.frame.contentWindow.postMessage(
      { channel: "study-lab", action: "stop", id: app.labRun },
      "*",
    );
    clearTimeout(app.labTimeout);
    app.labBusy = false;
    app.labStatus = `${msg} · ${((performance.now() - app.labStarted) / 1000).toFixed(1)} s`;
    app.labRun = null;
    app.updateLab();
  };

  app.stopLab = function stopLab(msg = "Stopped by you.") {
    if (!app.labBusy) return;
    app.frame.contentWindow.postMessage(
      { channel: "study-lab", action: "stop", id: app.labRun },
      "*",
    );
    app.labAbort?.abort();
    app.labErr = msg;
    app.finishLab("Stopped");
  };

  app.runLab = async function runLab() {
    if (app.labBusy) return;
    app.labBusy = true;
    app.labOut = "";
    app.labErr = "";
    app.labStatus = "Starting…";
    app.labStarted = performance.now();
    app.labRun = crypto.randomUUID();
    const id = app.labRun,
      language = app.s.lab.language,
      code = app.labCode(),
      stdin = app.labInput();
    app.updateLab();
    if (language === "cpp") {
      app.labAbort = new AbortController();
      app.labTimeout = setTimeout(
        () => app.stopLab("Compilation / execution timed out."),
        35000,
      );
      try {
        const r = await fetch("/api/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, stdin }),
          signal: app.labAbort.signal,
        });
        const d = await r.json();
        if (app.labRun !== id) return;
        if (!r.ok)
          throw Error(
            d.error || "The compiler could not complete this request.",
          );
        app.labOut = d.stdout;
        app.labErr = d.stderr;
        app.finishLab(
          d.timedOut
            ? "Timed out"
            : !d.compiled
              ? "Compilation failed"
              : d.executed
                ? `Exited with code ${d.exitCode}`
                : "Compiled; not executed",
        );
      } catch (e) {
        if (app.labRun !== id) return;
        app.labErr = e.message;
        app.finishLab("Compiler unavailable");
      }
      return;
    }
    if (!app.frameReady) {
      app.labErr =
        "The isolated runner is still loading. Try Run again in a moment.";
      app.finishLab("Runner not ready");
      return;
    }
    app.labTimeout = setTimeout(
      () =>
        app.stopLab(
          "Runtime loading timed out. Check your connection and try again.",
        ),
      120000,
    );
    app.frame.contentWindow.postMessage(
      { channel: "study-lab", action: "run", id, language, code, stdin },
      "*",
    );
  };
}
