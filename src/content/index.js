import de from "./subjects/digital-electronics.js";
import cpp from "./subjects/cpp.js";
import alg from "./subjects/discrete-structure.js";
import dsa from "./subjects/data-structures.js";
import uhv from "./subjects/human-values.js";
import py from "./subjects/python-lab.js";
import { CHAPTER_BANK } from "./chapter-questions.js";
import { EXTRA_QUIZ } from "./chapter-quizzes.js";
import { EXAM_UNITS } from "./exam-focus.js";
export { CHAPTER_BANK, EXTRA_QUIZ, EXAM_UNITS };
export { PLAN } from "./default-plan.js";
export { PAPER_INFO } from "./paper-pattern.js";
export { TRACES } from "./algorithm-traces.js";
export { LONG } from "./long-answers.js";
export { LAB_TEMPLATES } from "./lab-templates.js";
const subjects = [de, cpp, alg, dsa, uhv, py];
export const SUBJECTS = subjects.map((x) => x.subject);
export const TOPICS = subjects.flatMap((x) => x.topics);
export const CURRICULUM = subjects.map((x) => x.syllabus);
export const RESOURCES = Object.fromEntries(
  subjects.map((x) => [x.subject.id, x.resources]),
);
export const SHORT_BANK = [
  ...TOPICS.map((t) => ({
    id: t.id,
    subject: t.subject,
    unit: t.unit,
    kind: "short",
    mode: t.code
      ? "code"
      : /calculate|compute|simplify|find|evaluate|how many|convert|sort|trace/i.test(
            t.question,
          )
        ? "numerical"
        : "theory",
    marks: t.marks || 5,
    title: t.title,
    prompt: t.question,
    steps: t.steps,
    answer: t.recall,
    code: t.code,
    topicId: t.id,
  })),
  ...CHAPTER_BANK.filter((q) => q.kind === "short"),
];
export const QUIZ_BANK = [
  ...TOPICS,
  ...EXTRA_QUIZ.map((q) => ({
    ...TOPICS.find((t) => t.id === q.topicId),
    ...q,
    unitName: `${q.subject === "py" ? "Exercise" : q.subject === "uhv" ? "Module" : "Unit"} ${q.unit}`,
    exam: EXAM_UNITS[q.subject].includes(q.unit),
  })),
];
