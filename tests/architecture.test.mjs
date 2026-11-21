import test from "node:test";
import assert from "node:assert/strict";
import { collectAssets } from "../scripts/assets.mjs";
import { createWorker } from "../src/server/app.js";
import * as content from "../src/content/index.js";
import { StudySearch } from "../src/client/features/assistant/search.js";
import { register as planner } from "../src/client/features/planner/index.js";
import { register as settings } from "../src/client/features/settings/index.js";

test("public module imports resolve and server source is not exposed", async () => {
  const assets = await collectAssets(),
    worker = createWorker(assets);
  const page = await worker.fetch(new Request("https://study.example/"), {});
  assert.equal(page.status, 200);
  assert.match(await page.text(), /type="module"/);
  for (const [url, asset] of Object.entries(assets)) {
    if (!url.startsWith("/src/") || !url.endsWith(".js")) continue;
    for (const match of asset.body.matchAll(
      /(?:from\s*|import\s*)["']([^"']+)["']/g,
    )) {
      if (!match[1].startsWith(".")) continue;
      const dependency = new URL(match[1], "https://study.example" + url)
        .pathname;
      assert.ok(assets[dependency], `${url} imports missing ${dependency}`);
    }
  }
  assert.equal(
    (
      await worker.fetch(
        new Request("https://study.example/src/server/api/compiler.js"),
        {},
      )
    ).status,
    404,
  );
  assert.equal(
    (await worker.fetch(new Request("https://study.example/.env"), {})).status,
    404,
  );
  assert.equal(
    (
      await worker.fetch(
        new Request("https://study.example/", { method: "POST" }),
        {},
      )
    ).status,
    405,
  );
  assert.equal(
    await (
      await worker.fetch(
        new Request("https://study.example/", { method: "HEAD" }),
        {},
      )
    ).text(),
    "",
  );
});

function context() {
  const app = {
    ...content,
    StudySearch,
    s: { status: { de1: "done", de2: "weak" } },
    defaults: {
      version: 1,
      start: "2026-11-14",
      status: {},
      completedAt: {},
      reviews: {},
      notes: {},
      blocks: {},
      durations: {},
      history: [],
      missed: [],
      timer: { remaining: 1500, running: false, end: 0 },
    },
  };
  app.getTopic = (id) =>
    app.TOPICS.find((t) => t.id === id) ||
    app.QUIZ_BANK.find((q) => q.id === id);
  app.getSubject = (id) => app.SUBJECTS.find((s) => s.id === id);
  app.status = (id) => app.s.status[id] || "not-started";
  planner(app);
  settings(app);
  return app;
}
test("custom planner respects capacity and accounts for every selected topic once", () => {
  const app = context();
  const plan = app.buildCustomPlan({
    days: 4,
    hours: 3,
    start: "2026-11-21",
    scope: "full",
    subjects: ["de", "cpp", "py"],
    excludeDone: true,
  });
  assert.equal(plan.days.length, 4);
  for (const day of plan.days)
    assert.ok(day.blocks.reduce((n, b) => n + b.minutes, 0) <= 180);
  const scheduled = plan.days.flatMap((d) => d.blocks.flatMap((b) => b.topics));
  assert.equal(new Set([...scheduled, ...plan.backlog]).size, plan.topicCount);
  assert.equal(scheduled.length + plan.backlog.length, plan.topicCount);
  assert.ok(!scheduled.includes("de1"));
  assert.ok(!plan.backlog.includes("de1"));
});
test("backup validator retains assistant context, code drafts and mastery while filtering unknown IDs", () => {
  const app = context();
  const clean = app.validateBackup({
    version: 1,
    start: "2026-11-14",
    status: { de1: "done", de2: "weak", unknown: "done" },
    theme: "dark",
    chat: [
      {
        role: "assistant",
        mode: "search",
        text: "TTL NAND gate",
        kind: "topic",
        contextTopicId: "de1",
        sources: ["de1", "missing"],
        suggestions: [{ label: "Example", prompt: "Explain TTL NAND gate" }],
      },
    ],
    lab: {
      language: "python",
      drafts: { python: "print(42)" },
      inputs: { python: "12" },
    },
    questionDone: { de1: true, missing: true },
  });
  assert.equal(clean.status.de1, "done");
  assert.equal(clean.status.de2, "weak");
  assert.equal(clean.status.unknown, undefined);
  assert.equal(clean.chat[0].contextTopicId, "de1");
  assert.deepEqual(clean.chat[0].sources, ["de1"]);
  assert.equal(clean.chat[0].suggestions[0].label, "Example");
  assert.equal(clean.lab.drafts.python, "print(42)");
  assert.equal(clean.questionDone.missing, undefined);
  assert.throws(
    () => app.validateBackup({ version: 99 }),
    /valid Study Sprint backup/,
  );
});
