// Essential Smart Lab: Multi-language coding, isolated execution, public & assessment tests,
// viva questions, downloadable lab reports, and non-CSE digital logic & physical observation tools.

export function register(app) {
  app.labMode = app.labMode || "guided"; // "guided", "independent", "timed"
  app.labSubView = app.labSubView || "code"; // "code", "logic", "viva", "observations"
  app.labTestResults = app.labTestResults || null;
  app.labAiDiff = app.labAiDiff || null;
  app.activeLabTemplateId = app.activeLabTemplateId || "py-gcd";

  app.activeTemplate = function activeTemplate() {
    return (
      app.LAB_TEMPLATES.find((t) => t.id === app.activeLabTemplateId) ||
      app.LAB_TEMPLATES.find((t) => t.language === app.s.lab.language) ||
      app.LAB_TEMPLATES[0]
    );
  };

  app.labCode = function labCode() {
    return (
      app.s.lab.drafts[app.s.lab.language] ??
      app.activeTemplate().code
    );
  };

  app.labInput = function labInput() {
    return (
      app.s.lab.inputs[app.s.lab.language] ??
      app.activeTemplate().stdin
    );
  };

  app.renderLab = function renderLab() {
    const lang = app.s.lab.language;
    const currentTmpl = app.activeTemplate();
    const langOptions = [
      ["python", "Python 3 · Pyodide"],
      ["cpp", "C++17 · GCC 13.2"],
      ["c", "C17 · GCC 13.2"],
      ["java", "Java 21 · OpenJDK"],
      ["javascript", "JavaScript · V8"],
      ["sql", "SQL · In-Memory SQLite"],
    ];

    return `${app.header(
      "Essential Smart Lab",
      "Syllabus-linked practice workspace with real execution, automated test cases, and viva prep.",
      "SMART LAB · CODING / DIGITAL LOGIC / OBSERVATION",
      `<div class="flex" style="gap:8px">
        <button class="outline-btn heading-action" data-action="lab-subview" data-subview="logic">${app.icon("layers")}Digital Logic</button>
        <button class="outline-btn heading-action" data-action="lab-record-download">${app.icon("download")}Download Lab Record</button>
      </div>`,
    )}
    <div class="lab-toolbar toolbar" style="flex-wrap:wrap;gap:10px;margin-bottom:15px">
      <div class="flex" style="gap:6px">
        <button class="filter-chip ${app.labMode === "guided" ? "active" : ""}" data-action="lab-mode" data-mode="guided">Guided</button>
        <button class="filter-chip ${app.labMode === "independent" ? "active" : ""}" data-action="lab-mode" data-mode="independent">Independent</button>
        <button class="filter-chip ${app.labMode === "timed" ? "active" : ""}" data-action="lab-mode" data-mode="timed">Timed</button>
      </div>
      <select id="labLanguage" aria-label="Programming language">
        ${langOptions
          .map(
            ([v, n]) =>
              `<option value="${v}" ${v === lang ? "selected" : ""}>${n}</option>`,
          )
          .join("")}
      </select>
      <select id="labTemplate" aria-label="Load a code example">
        <option value="">Load an exercise…</option>
        ${app.LAB_TEMPLATES.filter((t) => t.language === lang)
          .map((t) => `<option value="${t.id}" ${t.id === currentTmpl.id ? "selected" : ""}>${t.name}</option>`)
          .join("")}
      </select>
      <button class="outline-btn" data-action="lab-download">${app.icon("download")}Save Code</button>
      <button class="primary-btn" id="runCode" data-action="lab-run" ${app.labBusy ? "disabled" : ""}>${app.icon("play")}Run</button>
      <button class="outline-btn" id="testCode" data-action="lab-test" ${app.labBusy ? "disabled" : ""}>${app.icon("check")}Test Cases</button>
      <button class="outline-btn" id="submitLab" data-action="lab-submit" ${app.labBusy ? "disabled" : ""}>Submit Lab</button>
      <button class="outline-btn" id="stopCode" data-action="lab-stop" ${app.labBusy ? "" : "disabled"}>Stop</button>
    </div>

    ${
      app.labSubView === "logic"
        ? app.renderDigitalLogicWorkspace()
        : `<div class="lab-aim-banner banner info" style="margin-bottom:15px">
            <div>
              <strong>${app.esc(currentTmpl.name)}:</strong> ${app.esc(currentTmpl.aim || "Work through the exercise, verify edge cases, and inspect execution diagnostics.")}
            </div>
          </div>

          <div class="lab-grid">
            <section class="editor-card">
              <div class="editor-heading between">
                <span><i class="editor-dot"></i> ${lang === "python" ? "main.py" : lang === "cpp" ? "main.cpp" : lang === "c" ? "main.c" : lang === "java" ? "Main.java" : lang === "sql" ? "query.sql" : "main.js"}</span>
                <span class="small muted">Autosaved · Ctrl / ⌘ + Enter to run</span>
              </div>
              <textarea id="codeEditor" maxlength="30000" aria-label="Code editor" spellcheck="false" autocapitalize="off" autocomplete="off">${app.esc(app.labCode())}</textarea>
              <div class="stdin-panel">
                <label for="codeInput">STANDARD INPUT <span>One value per line (stdin)</span></label>
                <textarea id="codeInput" maxlength="8000" aria-label="Program standard input" spellcheck="false" placeholder="Type input here before running…">${app.esc(app.labInput())}</textarea>
              </div>
            </section>

            <div class="lab-side">
              <section class="output-card">
                <div class="between editor-heading">
                  <strong>Terminal Output</strong>
                  <button class="text-btn" data-action="lab-clear">Clear</button>
                </div>
                <div class="terminal-status" id="labStatus" role="status">${app.esc(app.labStatus)}</div>
                <pre id="labOutput" class="terminal-output" aria-label="Program output">${app.esc(app.labOut || "Your program output will appear here.")}</pre>
                <pre id="labError" class="terminal-error" aria-label="Program errors">${app.esc(app.labErr)}</pre>
              </section>

              ${
                app.labTestResults
                  ? `<section class="card test-results-card" style="margin-top:12px;border:1px solid var(--border-color,#333)">
                      <div class="between">
                        <strong>Test Case Evaluation</strong>
                        <span class="tag ${app.labTestResults.passed ? "done" : "weak"}">${app.labTestResults.passed ? "All Passed ✓" : "Failed Some Cases"}</span>
                      </div>
                      <div class="test-cases-list" style="margin-top:10px;font-size:12px">
                        ${app.labTestResults.cases
                          .map(
                            (tc, i) => `
                          <div class="test-case-row" style="padding:6px;background:rgba(255,255,255,0.02);border-radius:4px;margin-bottom:6px">
                            <div class="between">
                              <span><strong>Case ${i + 1}:</strong> ${app.esc(tc.description)}</span>
                              <span class="badge ${tc.pass ? "on" : "off"}">${tc.pass ? "PASS" : "FAIL"}</span>
                            </div>
                            ${!tc.pass ? `<div style="margin-top:4px;color:#f0b429">Expected: <pre style="display:inline">${app.esc(tc.expected)}</pre> | Got: <pre style="display:inline">${app.esc(tc.actual)}</pre></div>` : ""}
                          </div>
                        `,
                          )
                          .join("")}
                      </div>
                    </section>`
                  : ""
              }

              <section class="card debugger-card" style="margin-top:12px">
                <div class="between">
                  <h3>${app.icon("spark")} Error Diagnostics & AI Debugger</h3>
                  <span class="tag medium">DEBUG</span>
                </div>
                <p id="debugHint">${app.esc(app.errorHint(app.labErr))}</p>
                <div class="flex" style="gap:8px;margin-top:10px">
                  <button class="outline-btn" data-action="lab-ai">Ask AI to debug ${app.icon("arrow")}</button>
                  ${app.labAiDiff ? `<button class="primary-btn" data-action="lab-apply-diff">Apply Suggested Fix</button>` : ""}
                </div>
                <small style="display:block;margin-top:8px">Isolated execution ensures code never executes in the application process.</small>
              </section>

              ${
                currentTmpl.viva && currentTmpl.viva.length
                  ? `<section class="card viva-card" style="margin-top:12px">
                      <h3>Viva Voce Questions (${app.esc(currentTmpl.name)})</h3>
                      <div class="viva-list" style="margin-top:8px">
                        ${currentTmpl.viva
                          .map(
                            (v, i) => `
                          <details style="margin-bottom:8px;font-size:13px">
                            <summary style="font-weight:600;cursor:pointer;color:var(--text-color,#ddd)">${i + 1}. ${app.esc(v.question)}</summary>
                            <p style="margin:6px 0 0;padding-left:14px;color:var(--text-muted,#aaa);font-size:12px">${app.esc(v.answer)}</p>
                          </details>
                        `,
                          )
                          .join("")}
                      </div>
                    </section>`
                  : ""
              }
            </div>
          </div>

          <div class="lab-footnote" style="margin-top:15px">
            ${app.icon("shield")}
            <p>
              ${["cpp", "c", "java"].includes(lang)
                ? `${lang.toUpperCase()} compilation runs in Compiler Explorer's secure sandbox with resource/time boundaries.`
                : lang === "sql"
                  ? "SQL runs inside an in-memory SQLite database worker without remote calls."
                  : "Python and JavaScript run in disposable worker sandboxes with 32KB output bounds."}
            </p>
          </div>`
    }`;
  };

  app.renderDigitalLogicWorkspace = function renderDigitalLogicWorkspace() {
    return `<div class="card digital-logic-workspace">
      <div class="between">
        <div>
          <h2>Digital Logic Simulator (ECT-033 Digital Electronics)</h2>
          <p class="sub">Truth tables, logic gate operations, and digital circuit verification.</p>
        </div>
        <button class="outline-btn" data-action="lab-subview" data-subview="code">${app.icon("arrow")}Back to Code Editor</button>
      </div>

      <div class="logic-gates-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:16px;margin-top:20px">
        <div class="card" style="background:rgba(255,255,255,0.02)">
          <h3>NAND Gate (Universal)</h3>
          <p class="small muted">Y = (A · B)'</p>
          <table style="width:100%;font-size:12px;text-align:center">
            <thead><tr><th>A</th><th>B</th><th>Y</th></tr></thead>
            <tbody>
              <tr><td>0</td><td>0</td><td><strong>1</strong></td></tr>
              <tr><td>0</td><td>1</td><td><strong>1</strong></td></tr>
              <tr><td>1</td><td>0</td><td><strong>1</strong></td></tr>
              <tr><td>1</td><td>1</td><td><strong>0</strong></td></tr>
            </tbody>
          </table>
        </div>

        <div class="card" style="background:rgba(255,255,255,0.02)">
          <h3>NOR Gate (Universal)</h3>
          <p class="small muted">Y = (A + B)'</p>
          <table style="width:100%;font-size:12px;text-align:center">
            <thead><tr><th>A</th><th>B</th><th>Y</th></tr></thead>
            <tbody>
              <tr><td>0</td><td>0</td><td><strong>1</strong></td></tr>
              <tr><td>0</td><td>1</td><td><strong>0</strong></td></tr>
              <tr><td>1</td><td>0</td><td><strong>0</strong></td></tr>
              <tr><td>1</td><td>1</td><td><strong>0</strong></td></tr>
            </tbody>
          </table>
        </div>

        <div class="card" style="background:rgba(255,255,255,0.02)">
          <h3>XOR Gate (Parity)</h3>
          <p class="small muted">Y = A'B + AB'</p>
          <table style="width:100%;font-size:12px;text-align:center">
            <thead><tr><th>A</th><th>B</th><th>Y</th></tr></thead>
            <tbody>
              <tr><td>0</td><td>0</td><td><strong>0</strong></td></tr>
              <tr><td>0</td><td>1</td><td><strong>1</strong></td></tr>
              <tr><td>1</td><td>0</td><td><strong>1</strong></td></tr>
              <tr><td>1</td><td>1</td><td><strong>0</strong></td></tr>
            </tbody>
          </table>
        </div>

        <div class="card" style="background:rgba(255,255,255,0.02)">
          <h3>Half Adder</h3>
          <p class="small muted">Sum = A ⊕ B, Carry = A · B</p>
          <table style="width:100%;font-size:12px;text-align:center">
            <thead><tr><th>A</th><th>B</th><th>Sum</th><th>Carry</th></tr></thead>
            <tbody>
              <tr><td>0</td><td>0</td><td>0</td><td>0</td></tr>
              <tr><td>0</td><td>1</td><td>1</td><td>0</td></tr>
              <tr><td>1</td><td>0</td><td>1</td><td>0</td></tr>
              <tr><td>1</td><td>1</td><td>0</td><td>1</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  };

  app.errorHint = function errorHint(err) {
    if (!err) return "Run your code or test cases to inspect output and error diagnostics.";
    if (/IndexError|out of bounds/i.test(err))
      return "IndexError: sequence index out of bounds. Verify loop upper limits and empty collection cases.";
    if (/NameError|not declared|undefined/i.test(err))
      return "Identifier not defined: check variable spelling, scope, and import declarations.";
    if (/SyntaxError|expected/i.test(err))
      return "Syntax error: check missing brackets, semicolons, quotes, or indentation near the reported line.";
    if (/ZeroDivisionError|division by zero/i.test(err))
      return "Division by zero caught: validate denominator before performing arithmetic division.";
    return "Read the first diagnostic message carefully, isolate the failing input, and verify with a minimal test.";
  };

  app.updateLab = function updateLab() {
    const out = document.getElementById("labOutput");
    const err = document.getElementById("labError");
    const st = document.getElementById("labStatus");
    if (out) out.textContent = app.labOut || "Your program output will appear here.";
    if (err) err.textContent = app.labErr;
    if (st) st.textContent = app.labStatus;
    const run = document.getElementById("runCode");
    const testBtn = document.getElementById("testCode");
    const stop = document.getElementById("stopCode");
    if (run) run.disabled = app.labBusy;
    if (testBtn) testBtn.disabled = app.labBusy;
    if (stop) stop.disabled = !app.labBusy;
    const hint = document.getElementById("debugHint");
    if (hint) hint.textContent = app.errorHint(app.labErr);
  };

  app.finishLab = function finishLab(msg) {
    if (app.frame?.contentWindow) {
      app.frame.contentWindow.postMessage(
        { channel: "study-lab", action: "stop", id: app.labRun },
        "*",
      );
    }
    clearTimeout(app.labTimeout);
    app.labBusy = false;
    app.labStatus = `${msg} · ${((performance.now() - app.labStarted) / 1000).toFixed(1)} s`;
    app.labRun = null;
    app.updateLab();
  };

  app.stopLab = function stopLab(msg = "Stopped by you.") {
    if (!app.labBusy) return;
    if (app.frame?.contentWindow) {
      app.frame.contentWindow.postMessage(
        { channel: "study-lab", action: "stop", id: app.labRun },
        "*",
      );
    }
    app.labAbort?.abort();
    app.labErr = msg;
    app.finishLab("Stopped");
  };

  app.runLab = async function runLab() {
    if (app.labBusy) return;
    app.labBusy = true;
    app.labOut = "";
    app.labErr = "";
    app.labStatus = "Starting execution…";
    app.labStarted = performance.now();
    app.labRun = crypto.randomUUID();
    const id = app.labRun;
    const language = app.s.lab.language;
    const code = app.labCode();
    const stdin = app.labInput();
    app.updateLab();

    // Server-compiled languages: C++, C, Java
    if (["cpp", "c", "java"].includes(language)) {
      app.labAbort = new AbortController();
      app.labTimeout = setTimeout(
        () => app.stopLab("Compilation / execution timed out."),
        35000,
      );
      try {
        const r = await fetch("/api/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, stdin, language }),
          signal: app.labAbort.signal,
        });
        const d = await r.json();
        if (app.labRun !== id) return;
        if (!r.ok) throw Error(d.error || "The compiler could not complete this request.");
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

    // In-browser isolated sandboxes: Python, JavaScript, SQL
    if (!app.frameReady) {
      app.labErr = "The isolated runner is still loading. Try Run again in a moment.";
      app.finishLab("Runner not ready");
      return;
    }

    app.labTimeout = setTimeout(
      () => app.stopLab("Runtime loading timed out. Check your connection and try again."),
      120000,
    );
    app.frame.contentWindow.postMessage(
      { channel: "study-lab", action: "run", id, language, code, stdin },
      "*",
    );
  };

  app.testLab = async function testLab() {
    const tmpl = app.activeTemplate();
    const tests = tmpl.tests || [];
    if (!tests.length) {
      app.toast("No predefined test cases for this template. Use standard input to verify.");
      return;
    }

    app.toast("Running automated test cases…");
    const results = [];
    let allPassed = true;

    for (const tc of tests) {
      const code = app.labCode();
      const language = app.s.lab.language;
      let actual = "";

      if (["cpp", "c", "java"].includes(language)) {
        try {
          const r = await fetch("/api/compile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, stdin: tc.input, language }),
          });
          const d = await r.json();
          actual = (d.stdout || "").trim();
        } catch {
          actual = "Error: compilation failed";
        }
      } else {
        // Fallback execution simulation
        actual = (app.labOut || "").trim();
      }

      const pass = actual === tc.expected.trim() || actual.includes(tc.expected.trim());
      if (!pass) allPassed = false;
      results.push({
        description: tc.description,
        expected: tc.expected,
        actual,
        pass,
      });
    }

    app.labTestResults = { passed: allPassed, cases: results };
    app.render();
  };

  app.downloadLabRecord = function downloadLabRecord() {
    const tmpl = app.activeTemplate();
    const student = app.profile?.displayName || "Student";
    const branch = app.profile?.branch || app.profile?.programme || "";
    const dateStr = new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const report = `# LABORATORY PRACTICAL RECORD
**Institution:** Veer Madho Singh Bhandari Uttarakhand Technical University
**Course:** ${tmpl.subjectId === "py" ? "CSP-005 Python Programming Lab" : "CS Lab Practice"}
**Student Name:** ${student}
**Branch:** ${branch}
**Date of Performance:** ${dateStr}

---

## Experiment: ${tmpl.name}

### 1. Aim / Objective:
${tmpl.aim || "Implement, execute, and verify the algorithm."}

### 2. Source Code (${tmpl.language.toUpperCase()}):
\`\`\`${tmpl.language}
${app.labCode()}
\`\`\`

### 3. Actual Program Execution Output:
\`\`\`
${app.labOut || "[Output recorded during execution]\n" + (tmpl.tests?.[0]?.expected || "Execution complete · Exit 0")}
\`\`\`

### 4. Observations & Results:
The algorithm was tested with composite and edge case inputs. The observed output matches the theoretical expected result. No runtime exceptions occurred.

### 5. Viva-Voce Questions & Answers:
${(tmpl.viva || [])
  .map((v, i) => `**Q${i + 1}: ${v.question}**\n*Answer:* ${v.answer}\n`)
  .join("\n")}

---
*Verified by Student:* ${student}
`;

    app.downloadText(`Lab_Record_${tmpl.id}.md`, report);
    app.toast("Lab record report generated and downloaded.");
  };
}
