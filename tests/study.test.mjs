import test from "node:test";
import assert from "node:assert/strict";
import {
  handleAPI,
  normalizeCompileResult,
} from "../src/server/api/compiler.js";
import * as data from "../src/content/index.js";
test("every syllabus chapter has new short, long and quiz practice", () => {
  assert.equal(data.TOPICS.length, 104);
  assert.equal(data.LONG.length, 60);
  assert.equal(data.SHORT_BANK.length, 140);
  assert.equal(data.QUIZ_BANK.length, 176);
  for (const c of data.CURRICULUM)
    for (const u of c.units) {
      const q = data.CHAPTER_BANK.filter(
        (x) => x.subject === c.id && x.unit === u.number,
      );
      assert.equal(q.length, 2);
      assert.equal(q.filter((x) => x.kind === "long").length, 1);
      assert.equal(
        data.EXTRA_QUIZ.filter((x) => x.subject === c.id && x.unit === u.number)
          .length,
        2,
      );
    }
});
test("question links and choices are valid and unique", () => {
  assert.equal(new Set(data.QUIZ_BANK.map((x) => x.id)).size, 176);
  for (const q of data.QUIZ_BANK) {
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4);
    if (q.topicId)
      assert.ok(
        data.TOPICS.some(
          (t) =>
            t.id === q.topicId && t.subject === q.subject && t.unit === q.unit,
        ),
      );
  }
  for (const l of data.LONG) {
    assert.ok(l.sections.length > 0);
    assert.ok(l.related.every((id) => data.TOPICS.some((t) => t.id === id)));
    assert.equal(
      l.rubric.reduce((n, r) => n + r[1], 0),
      10,
    );
  }
});
const req = (body, headers = {}) =>
  new Request("https://study.example/api/compile", {
    method: "POST",
    headers: {
      origin: "https://study.example",
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
test("compiler rejects cross-origin, invalid bodies and oversized code before forwarding", async () => {
  let calls = 0;
  const fake = () => {
    calls++;
    throw Error("should not run");
  };
  assert.equal(
    (
      await handleAPI(
        req(
          { code: "int main(){}", stdin: "" },
          { origin: "https://other.example" },
        ),
        {},
        fake,
      )
    ).status,
    403,
  );
  assert.equal((await handleAPI(req("bad json"), {}, fake)).status, 400);
  assert.equal(
    (await handleAPI(req({ code: "x".repeat(30001), stdin: "" }), {}, fake))
      .status,
    400,
  );
  assert.equal((await handleAPI(req("x".repeat(50001)), {}, fake)).status, 413);
  assert.equal(calls, 0);
});
test("compiler sends bounded standard input with fixed C++17 options and reports real output", async () => {
  let payload;
  const fake = async (url, opts) => {
    assert.equal(url, "https://godbolt.org/api/compiler/g132/compile");
    payload = JSON.parse(opts.body);
    return Response.json({
      code: 0,
      didExecute: true,
      stdout: [{ text: "42" }],
      stderr: [],
      buildResult: { code: 0, stderr: [] },
    });
  };
  const r = await handleAPI(
    req({
      code: "#include <iostream>\nint main(){int n;std::cin>>n;std::cout<<n*2;}",
      stdin: "21",
    }),
    {},
    fake,
  );
  const d = await r.json();
  assert.equal(d.stdout, "42");
  assert.equal(d.executed, true);
  assert.equal(payload.options.executeParameters.stdin, "21");
  assert.match(payload.options.userArguments, /-std=c\+\+17/);
  assert.equal(payload.allowStoreCodeDebug, false);
});
test("compile failures, nonzero exits and unavailable upstream are never reported as success", async () => {
  const fail = normalizeCompileResult({
    code: 1,
    didExecute: false,
    stderr: [{ text: "error: expected ;" }],
  });
  assert.equal(fail.compiled, false);
  assert.equal(fail.executed, false);
  assert.match(fail.stderr, /expected/);
  const runtime = normalizeCompileResult({
    code: 7,
    didExecute: true,
    stdout: [],
    stderr: [{ text: "failed" }],
    buildResult: { code: 0, stderr: [] },
  });
  assert.equal(runtime.compiled, true);
  assert.equal(runtime.exitCode, 7);
  const r = await handleAPI(
    req({ code: "int main(){}", stdin: "" }),
    {},
    async () => new Response("offline", { status: 503 }),
  );
  assert.equal(r.status, 502);
});

test("compiler control sequences are stripped from diagnostics", () => {
  assert.equal(
    normalizeCompileResult({
      code: 1,
      stderr: [{ text: "\x1b[Kerror: \x1b[31mmissing name\x1b[0m" }],
    }).stderr,
    "error: missing name",
  );
});
