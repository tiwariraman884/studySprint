export function labFrameMain() {
  let worker = null,
    runId = null;
  const runner = async function () {
    let outputSize = 0,
      limited = false;
    const send = (kind, text) => {
      text = String(text);
      if (kind === "stdout" || kind === "stderr") {
        if (limited) return;
        outputSize += text.length;
        if (outputSize > 32000) {
          limited = true;
          postMessage({
            kind: "stderr",
            text: "\n[Output limit reached: 32,000 characters]\n",
          });
          return;
        }
      }
      postMessage({ kind, text });
    };
    onmessage = async (e) => {
      const { language, code, stdin } = e.data;
      try {
        if (language === "python") {
          send("status", "Loading Python runtime…");
          importScripts(
            "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js",
          );
          const py = await loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/",
            stdout: (t) => send("stdout", t + "\n"),
            stderr: (t) => send("stderr", t + "\n"),
          });
          const inputs = stdin ? stdin.split("\n") : [];
          let ix = 0;
          py.setStdin({ stdin: () => inputs[ix++] ?? null });
          send("status", "Loading imported packages…");
          await py.loadPackagesFromImports(code, { messageCallback: () => {} });
          send("running", "Running Python…");
          await py.runPythonAsync(code);
          send("done", "Python finished · exit 0");
        } else if (language === "sql") {
          send("status", "Loading SQL engine…");
          importScripts(
            "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js",
          );
          const py = await loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/",
            stdout: (t) => send("stdout", t + "\n"),
            stderr: (t) => send("stderr", t + "\n"),
          });
          send("running", "Executing SQL queries…");
          const escaped = code.replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"');
          const pyCode = `import sqlite3\ncon = sqlite3.connect(':memory:')\ncur = con.cursor()\nscript = """${escaped}"""\nfor stmt in script.split(';'):\n    s = stmt.strip()\n    if s:\n        res = cur.execute(s)\n        if cur.description:\n            for r in res.fetchall():\n                print(r)\ncon.commit()`;
          await py.runPythonAsync(pyCode);
          send("done", "SQL finished · exit 0");
        } else {
          send("running", "Running JavaScript…");
          let lines = stdin.split("\n"),
            ix = 0;
          const fmt = (v) =>
            typeof v === "string" ? v : (JSON.stringify(v) ?? String(v));
          const out = {
            log: (...a) => send("stdout", a.map(fmt).join(" ") + "\n"),
            error: (...a) => send("stderr", a.map(fmt).join(" ") + "\n"),
            warn: (...a) => send("stderr", a.map(fmt).join(" ") + "\n"),
          };
          const AsyncFunction = Object.getPrototypeOf(
            async function () {},
          ).constructor;
          await new AsyncFunction("console", "readline", "stdin", code)(
            out,
            () => lines[ix++] ?? null,
            stdin,
          );
          send("done", "JavaScript finished · exit 0");
        }
      } catch (error) {
        send("error", error?.message || error);
      }
    };
  };
  addEventListener("message", (e) => {
    if (e.source !== parent || !e.data || e.data.channel !== "study-lab")
      return;
    const d = e.data;
    if (d.action === "stop") {
      worker?.terminate();
      worker = null;
      return;
    }
    if (d.action !== "run") return;
    worker?.terminate();
    runId = d.id;
    const captured = runId;
    const blob = new Blob(["(" + runner.toString() + ")()"], {
        type: "application/javascript",
      }),
      url = URL.createObjectURL(blob);
    worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = (e) => {
      if (captured === runId)
        parent.postMessage(
          { channel: "study-lab", id: captured, ...e.data },
          "*",
        );
    };
    worker.onerror = (e) => {
      parent.postMessage(
        {
          channel: "study-lab",
          id: captured,
          kind: "error",
          text: e.message || "Runtime could not load.",
        },
        "*",
      );
    };
    worker.postMessage({ language: d.language, code: d.code, stdin: d.stdin });
  });
  parent.postMessage({ channel: "study-lab", kind: "frame-ready" }, "*");
}
