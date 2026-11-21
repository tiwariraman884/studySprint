// The first reusable course pack.
//
// Wraps the six authored subject modules in a versioned pack. The authored text
// is not duplicated: this module only adds stable, pack-qualified identifiers
// and honest metadata. The original personal dashboard identity is deliberately
// NOT part of the pack: it is a content collection, not a user profile.
import de from "../subjects/digital-electronics.js";
import cpp from "../subjects/cpp.js";
import alg from "../subjects/discrete-structure.js";
import dsa from "../subjects/data-structures.js";
import uhv from "../subjects/human-values.js";
import py from "../subjects/python-lab.js";
import { SUBJECTS, RESOURCES } from "../index.js";
import { CHAPTER_BANK } from "../chapter-questions.js";
import { EXTRA_QUIZ } from "../chapter-quizzes.js";
import { EXAM_UNITS } from "../exam-focus.js";
import { LONG } from "../long-answers.js";
import { LAB_TEMPLATES } from "../lab-templates.js";
import { PAPER_INFO } from "../paper-pattern.js";
import { buildCoursePack } from "./course-pack.js";

export const CIA2_META = {
  id: "cia-2-2025-26",
  version: "1.0.0",
  title: "CIA 2 Preparation Pack",
  description:
    "Six authored subjects — Digital Electronics, Object Oriented Programming (C++), Discrete Structure, Data Structures & Algorithms, Universal Human Values and Python Programming Lab — with topic guides, worked questions, MCQs and revision notes. Written for the 2025–26 internal assessment from material shared by one student.",
  // The source material does not name or verify an institution, so none is
  // invented. These fields stay null until a real reviewer fills them in.
  institution: null,
  programme: null,
  branch: null,
  academicYear: "2025–26",
  syllabusVersion: "Authored from the supplied 2025–26 course material",
  // "imported" = authored by a student, re-packaged for reuse, not reviewed or
  // approved by any institution. Never claim more than that.
  publicationStatus: "imported",
  reviewedBy: null,
  reviewedAt: null,
  license: "unlicensed",
  author: "Repository contributors",
};

export const CIA2_PACK = buildCoursePack({
  meta: CIA2_META,
  subjects: [de, cpp, alg, dsa, uhv, py],
  chapterBank: CHAPTER_BANK,
  extraQuiz: EXTRA_QUIZ,
  longAnswers: LONG,
  labTemplates: LAB_TEMPLATES,
  examUnits: EXAM_UNITS,
  paperInfo: PAPER_INFO,
  resources: Object.fromEntries(SUBJECTS.map((s) => [s.id, RESOURCES[s.id] || []])),
});

export default CIA2_PACK;
