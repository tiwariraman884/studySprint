const limits = new Map();
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
const textLines = (lines) =>
  Array.isArray(lines)
    ? lines
        .map((x) => (typeof x?.text === "string" ? x.text : ""))
        .join("\n")
        .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
        .slice(0, 32000)
    : "";
export function normalizeCompileResult(d, language = "cpp") {
  const b = d.buildResult || d;
  const provider =
    language === "c"
      ? "Compiler Explorer · GCC 13.2 · C17"
      : language === "java"
        ? "Compiler Explorer · OpenJDK 21"
        : "Compiler Explorer · GCC 13.2 · C++17";
  return {
    compiled: b.code === 0,
    executed: d.didExecute === true,
    exitCode: Number.isInteger(d.code) ? d.code : null,
    stdout: textLines(d.stdout),
    stderr: [textLines(b.stderr), d.buildResult ? textLines(d.stderr) : ""]
      .filter(Boolean)
      .join("\n"),
    timedOut: !!(d.timedOut || b.timedOut),
    truncated: !!(d.truncated || b.truncated),
    provider,
  };
}
export async function handleAPI(request, env = {}, fetcher = fetch) {
  const path = new URL(request.url).pathname;
  if (path === "/api/status" && request.method === "GET")
    return json({ codeRunner: "Compiler Explorer", ai: "on-device" });
  if (path !== "/api/compile") return json({ error: "Not found" }, 404);
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    return json({ error: "Request origin does not match this site." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return json({ error: "Expected JSON" }, 415);
  let raw = "";
  try {
    const reader = request.body.getReader();
    let total = 0;
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 50000) {
        await reader.cancel();
        return json({ error: "Code and input are too large." }, 413);
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } catch {
    return json({ error: "Unable to read code." }, 400);
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (
    typeof body.code !== "string" ||
    !body.code.trim() ||
    body.code.length > 30000 ||
    typeof body.stdin !== "string" ||
    body.stdin.length > 8000
  )
    return json(
      {
        error:
          "Use 1–30,000 code characters and at most 8,000 input characters.",
      },
      400,
    );
  const key = request.headers.get("cf-connecting-ip") || "preview",
    now = Date.now(),
    bucket = limits.get(key) || [];
  const recent = bucket.filter((t) => now - t < 60000);
  if (recent.length >= 10)
    return json(
      { error: "Please wait one minute before running more C++ programs." },
      429,
    );
  recent.push(now);
  limits.set(key, recent);
  if (limits.size > 2000)
    for (const [k, v] of limits) if (now - v.at(-1) > 60000) limits.delete(k);
  const lang = body.language === "c" ? "c" : body.language === "java" ? "java" : "cpp";
  const compilerUrl =
    lang === "java"
      ? "https://godbolt.org/api/compiler/java2100/compile"
      : "https://godbolt.org/api/compiler/g132/compile";
  const userArguments =
    lang === "c"
      ? "-std=c17 -O0 -Wall -Wextra"
      : lang === "java"
        ? ""
        : "-std=c++17 -O0 -Wall -Wextra";
  const godboltLang = lang === "c" ? "c" : lang === "java" ? "java" : "c++";

  try {
    const r = await fetcher(compilerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        source: body.code,
        options: {
          userArguments,
          compilerOptions: { executorRequest: true },
          filters: { execute: true },
          executeParameters: { args: [], stdin: body.stdin, runtimeTools: [] },
        },
        lang: godboltLang,
        allowStoreCodeDebug: false,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok)
      return json(
        {
          error: `Compiler service is unavailable (${r.status}). Your code is saved; try again later.`,
        },
        502,
      );
    const d = await r.json();
    if (!d || typeof d !== "object" || !Number.isInteger(d.code))
      return json({ error: "Compiler returned an unexpected response." }, 502);
    return json(normalizeCompileResult(d, lang));
  } catch (e) {
    return json(
      {
        error:
          e.name === "TimeoutError" || e.name === "AbortError"
            ? "Compilation timed out. Stop long-running loops and retry."
            : "Could not reach the compiler. Your code remains saved.",
      },
      502,
    );
  }
}
