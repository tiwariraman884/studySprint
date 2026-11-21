import test from "node:test";
import assert from "node:assert/strict";
import { StudySearch } from "../src/client/features/assistant/search.js";
import { TOPICS, SUBJECTS, SHORT_BANK, LONG } from "../src/content/index.js";
const deps = {
  topics: TOPICS,
  subjects: SUBJECTS,
  shortBank: SHORT_BANK,
  longBank: LONG,
  hinglish: true,
  planText: "Your plan: 4 days, 7 study hours/day.",
  priorities: TOPICS.slice(0, 3),
};
const route = (q, history = []) => StudySearch.resolve(q, history, TOPICS);
const answer = (q, history = []) => ({
  role: "assistant",
  mode: "search",
  ...StudySearch.reply(route(q, history), deps),
});
test("explore it with no context asks for a subject and supplies working subject choices", () => {
  const result = answer("explore it");
  assert.equal(result.kind, "clarify");
  assert.match(result.text, /which subject or topic/i);
  assert.equal(result.sources.length, 0);
  assert.equal(result.suggestions.length, 7);
  for (const s of result.suggestions.slice(0, 6))
    assert.equal(route(s.prompt).kind, "subject", s.prompt);
});
test("follow-ups retain the discussed topic and return the requested example", () => {
  const first = answer("Explain fan-out with an example");
  assert.equal(first.contextTopicId, "de3");
  const deep = answer("explore it", [first]);
  assert.equal(deep.contextTopicId, "de3");
  assert.match(deep.text, /Continuing: Delay, fan-in & fan-out/);
  const worked = answer("give an example", [first, deep]);
  assert.equal(worked.contextTopicId, "de3");
  assert.match(worked.text, /min\(20,10\) = 10/);
  for (const s of deep.suggestions)
    assert.equal(route(s.prompt).hits[0].id, "de3", s.prompt);
});
test("a new named topic replaces context and unrelated questions never borrow it", () => {
  const a = answer("Explain fan-out");
  const b = answer("Explain C++ templates", [a]);
  assert.equal(TOPICS.find((t) => t.id === b.contextTopicId).subject, "cpp");
  assert.equal(answer("explain more", [a, b]).contextTopicId, b.contextTopicId);
  const unknown = answer("Explain quantum entanglement", [a, b]);
  assert.equal(unknown.kind, "unmatched");
  assert.equal(answer("explore it", [a, b, unknown]).kind, "clarify");
});
test("topic context survives backup restoration and recognises legacy answers", () => {
  const m = answer("Explain TTL NAND gate");
  const restored = StudySearch.restoreMessage(
    JSON.parse(JSON.stringify(m)),
    TOPICS,
    SUBJECTS,
  );
  assert.equal(route("explore it", [restored]).hits[0].id, "de1");
  assert.equal(
    route("tell me more", [
      {
        role: "assistant",
        mode: "search",
        text: "TTL NAND gate\n\nOld notes",
        sources: ["de1"],
      },
    ]).hits[0].id,
    "de1",
  );
  const invalid = StudySearch.restoreMessage(
    { ...m, contextTopicId: "missing", contextSubjectId: "missing" },
    TOPICS,
    SUBJECTS,
  );
  assert.equal(invalid.contextTopicId, undefined);
  assert.equal(invalid.contextSubjectId, undefined);
});
test("subject exploration lists its chapters and follow-ups do not pick a random topic", () => {
  const m = answer("Explore Python Programming Lab");
  assert.equal(m.kind, "subject");
  assert.equal(m.suggestions.length, 11);
  assert.equal(answer("explore it", [m]).contextSubjectId, "py");
  assert.equal(route("Explore a subject").kind, "clarify");
});
test("common spelling and punctuation variants find syllabus topics", () => {
  assert.equal(route("explain fanout").hits[0].id, "de3");
  assert.equal(route("what is fan out").hits[0].id, "de3");
  assert.equal(route("Explain C++ templats").hits[0].subject, "cpp");
  assert.match(
    route("Explain C++ templats").hits[0].title,
    /template|generic/i,
  );
  assert.equal(route("algebraic structures").hits[0].subject, "alg");
});
test("planning and code questions stay separate from topic matching", () => {
  assert.equal(route("What should I study next?").kind, "plan");
  assert.equal(route("Explain time complexity").kind, "topic");
  assert.notEqual(route("Explain time complexity").kind, "plan");
  assert.equal(
    route("Help me debug this Python code: IndexError").kind,
    "code",
  );
});
test("practice follow-ups use stored question solutions rather than invented answers", () => {
  const first = answer("TTL NAND gate");
  const short = answer("give short questions", [first]);
  assert.match(short.text, /Short practice/);
  assert.match(short.text, /Y = NOT/);
  const long = answer("give long questions", [first]);
  assert.match(long.text, /Related chapter practice/);
  assert.match(long.text, /10 marks/);
});
