// Academic foundation and curriculum pipeline.
//
// Models the official Veer Madho Singh Bhandari Uttarakhand Technical University (UTU)
// curriculum structure across 21 B.Tech degree branches, common first-year scheme,
// 2 archival branches, and 8 specialization tracks.
//
// Adheres strictly to the principles:
// 1. Stable internal identities (never use course code or PDF row alone as global key).
// 2. Unresolved college aliases (e.g. RIT CSE++) and college allocations stay in review.
// 3. Clear coverage indicators (syllabus, notes, questions, quiz, lab).
// 4. Distinction between official previous papers, reviewed authored practice, and drafts.

import { CURRICULUM_CATALOG } from "./catalog-data.js";
import { SUBJECTS, RESOURCES } from "../index.js";
import { CHAPTER_BANK } from "../chapter-questions.js";
import { EXTRA_QUIZ } from "../chapter-quizzes.js";
import { LONG } from "../long-answers.js";
import { LAB_TEMPLATES } from "../lab-templates.js";
import { EXAM_UNITS } from "../exam-focus.js";

export const UNIVERSITY = Object.freeze({
  id: "uktech",
  name: "Veer Madho Singh Bhandari Uttarakhand Technical University",
  shortName: "UTU",
  sourceUrl: "https://uktech.ac.in/en/page/syllabus",
  checkedOn: CURRICULUM_CATALOG.checked_on || "2026-11-21",
});

export const COLLEGES = Object.freeze([
  {
    id: "rit-roorkee",
    name: "Roorkee Institute of Technology, Roorkee",
    shortName: "RIT",
    aliases: {
      "CSE++": {
        status: "unresolved",
        officialRegistration: null,
        mappedDegreeBranch: null,
        note: "RIT college alias 'CSE++' is not mapped to an official degree. Kept in review without inferring CSE or CSE(AIML).",
      },
    },
    examScopes: {
      "cia-1": { status: "unconfigured", note: "College CIA 1 unit scope requires official college notification." },
      "cia-2": { status: "inferred_authored", note: "CIA 2 unit focus is student-inferred; full syllabus remains accessible." },
      "end-sem": { status: "full_syllabus", note: "University end-semester examination covers all syllabus units." },
    },
  },
]);

export const ADMISSION_BATCHES = Object.freeze([
  {
    id: "2022-23",
    label: "2022–23 onwards",
    status: "active",
    firstYearSource: "source-22",
    note: "Common first-year scheme for admissions from 2022–23.",
  },
  {
    id: "2025-26",
    label: "2025–26 session",
    status: "active",
    firstYearSource: "source-22",
    note: "Current academic session.",
  },
  {
    id: "2019-20",
    label: "2019–20 (Archival)",
    status: "archived",
    firstYearSource: null,
    note: "Historical syllabus scheme. Applies only to archival branches.",
  },
]);

export const BRANCHES = Object.freeze(CURRICULUM_CATALOG.branches);
export const COURSES = Object.freeze(CURRICULUM_CATALOG.courses);
export const FIRST_YEAR = Object.freeze(CURRICULUM_CATALOG.first_year);
export const ARCHIVED_BRANCHES = Object.freeze(CURRICULUM_CATALOG.archived_branch_sources);
export const SPECIALIZATIONS = Object.freeze(CURRICULUM_CATALOG.optional_specialization_sources);
export const SOURCES = Object.freeze(CURRICULUM_CATALOG.sources);
export const UNRESOLVED_ISSUES = Object.freeze(CURRICULUM_CATALOG.unresolved);

// Map of courses indexed by ID for O(1) lookup
const COURSE_BY_ID = new Map(COURSES.map((c) => [c.id, c]));

// Known authored subject matches in StudySprint
// (These 6 subjects have full lesson guides, worked questions, rubrics and quizzes)
const AUTHORED_CODE_MAP = new Map([
  ["ECT-033", { subjectId: "de", name: "Digital Electronics" }],
  ["CST-002", { subjectId: "alg", name: "Discrete Structure" }],
  ["CST-003", { subjectId: "dsa", name: "Data Structures and Algorithms" }],
  ["AHT-008", { subjectId: "uhv", name: "Universal Human Values" }],
  ["CSP-005", { subjectId: "py", name: "Python Programming Lab" }],
  ["CST-001", { subjectId: "cpp", name: "Object Oriented Programming (C++)" }],
]);

/**
 * Get a course by its stable source ID (e.g. 'source-01-s3-p3-r4').
 */
export function getCourseById(courseId) {
  return COURSE_BY_ID.get(courseId) || null;
}

/**
 * Find branch by ID or branch index.
 */
export function getBranchById(branchId) {
  return (
    BRANCHES.find((b) => b.id === branchId || b.name.toLowerCase().includes(String(branchId).toLowerCase())) ||
    null
  );
}

/**
 * Return coverage indicator for a course.
 */
export function getCourseCoverage(course) {
  if (!course) return null;
  const codes = course.codes || [];
  let authoredMatch = null;
  for (const c of codes) {
    if (AUTHORED_CODE_MAP.has(c)) {
      authoredMatch = AUTHORED_CODE_MAP.get(c);
      break;
    }
  }

  const hasAuthoredBundle = !!authoredMatch;
  return {
    courseId: course.id,
    codes: course.codes,
    title: course.title,
    kind: course.kind,
    credits: course.credits_as_printed,
    pdfPage: course.pdf_page,
    sourceUrl: course.source_url,
    coverage: {
      syllabus: true,
      notes: hasAuthoredBundle,
      questions: hasAuthoredBundle,
      quiz: hasAuthoredBundle,
      lab: course.kind === "lab" ? hasAuthoredBundle : false,
      provenance: hasAuthoredBundle ? "authored" : "syllabus_table_only",
    },
    authoredSubjectId: authoredMatch?.subjectId || null,
    reviewFlags: course.review_flags || [],
    allocation: course.allocation,
  };
}

/**
 * First-Year Subject Alternatives Resolver.
 * Resolves Group A vs Group B without activating conflicting alternatives.
 */
export function resolveFirstYearOfferings({ semester = 1, group = "A", bridgeCourses = false } = {}) {
  const semKey = String(semester);
  const courseIds = FIRST_YEAR.semester_course_ids?.[semKey] || [];
  const rawCourses = courseIds.map((id) => getCourseById(id)).filter(Boolean);

  const resolved = [];
  for (const course of rawCourses) {
    const isPair = course.codes.length > 1;
    let selectedCode = course.codes[0];
    let selectedTitle = course.title;

    if (isPair) {
      const titles = (course.title || "").split("/").map((t) => t.trim());
      if (group === "B" && course.codes[1]) {
        selectedCode = course.codes[1];
        selectedTitle = titles[1] || course.title;
      } else {
        selectedCode = course.codes[0];
        selectedTitle = titles[0] || course.title;
      }
    }

    resolved.push({
      ...course,
      activeCode: selectedCode,
      activeTitle: selectedTitle,
      groupSelected: isPair ? group : "common",
      isAlternativePair: isPair,
      coverage: getCourseCoverage(course),
    });
  }

  // Handle conditional bridge courses (e.g. for Biotechnology)
  if (bridgeCourses && semester === 1) {
    for (const bId of FIRST_YEAR.bridge_course_ids || []) {
      const bCourse = getCourseById(bId);
      if (bCourse) {
        resolved.push({
          ...bCourse,
          isBridgeCourse: true,
          activeCode: bCourse.codes[0],
          activeTitle: bCourse.title,
          coverage: getCourseCoverage(bCourse),
        });
      }
    }
  }

  return resolved;
}

/**
 * Second-Year Branch Offerings Resolver.
 * Resolves Semester 3 or 4 course offerings for any of the 21 branches.
 */
export function resolveBranchOfferings({ branchId, semester = 3, confirmedAlternatives = {} } = {}) {
  const branch = getBranchById(branchId);
  if (!branch) {
    return { error: `Branch '${branchId}' not found in 21 official university branches.` };
  }

  const semKey = String(semester);
  const courseIds = branch.semester_course_ids?.[semKey] || [];
  const courses = courseIds.map((id) => getCourseById(id)).filter(Boolean);

  const resolved = courses.map((course) => {
    const isPair = course.codes && course.codes.length > 1;
    const userChoice = confirmedAlternatives[course.id];
    let activeCode = course.codes?.[0] || "";
    let activeTitle = course.title;

    if (isPair && userChoice) {
      const idx = course.codes.indexOf(userChoice);
      if (idx !== -1) {
        activeCode = course.codes[idx];
        const titles = (course.title || "").split("/").map((t) => t.trim());
        activeTitle = titles[idx] || course.title;
      }
    }

    return {
      ...course,
      branchId: branch.id,
      branchName: branch.name,
      activeCode,
      activeTitle,
      isAlternativePair: isPair,
      requiresCollegeAllocation: course.allocation === "confirm_college_allocation" && !userChoice,
      coverage: getCourseCoverage(course),
    };
  });

  return {
    branch,
    semester,
    courses: resolved,
    counts: {
      total: resolved.length,
      theory: resolved.filter((c) => c.kind === "theory").length,
      lab: resolved.filter((c) => c.kind === "lab").length,
      mandatoryNoncredit: resolved.filter((c) => c.kind === "mandatory_noncredit").length,
      optionalMinor: resolved.filter((c) => c.kind === "optional_minor").length,
      internshipProject: resolved.filter((c) => c.kind === "internship_project").length,
      proficiency: resolved.filter((c) => c.kind === "proficiency").length,
    },
  };
}

/**
 * Compute the complete coverage matrix across all 21 branches for Semesters I–IV.
 */
export function computeCoverageMatrix() {
  const branchMatrix = BRANCHES.map((b) => {
    const s3 = resolveBranchOfferings({ branchId: b.id, semester: 3 });
    const s4 = resolveBranchOfferings({ branchId: b.id, semester: 4 });

    const s3Courses = s3.courses || [];
    const s4Courses = s4.courses || [];
    const allBranchCourses = [...s3Courses, ...s4Courses];

    const curatedCount = allBranchCourses.filter((c) => c.coverage?.coverage?.notes).length;
    const reviewFlagCount = allBranchCourses.reduce((sum, c) => sum + (c.review_flags?.length || 0), 0);

    return {
      branchId: b.id,
      branchName: b.name,
      sourceId: b.source_id,
      firstYearMappingStatus: b.first_year_mapping_status,
      semesters: {
        1: { applicability: "common_year_1", totalCourses: FIRST_YEAR.semester_course_ids["1"].length },
        2: { applicability: "common_year_1", totalCourses: FIRST_YEAR.semester_course_ids["2"].length },
        3: {
          totalCourses: s3Courses.length,
          curatedContentCourses: s3Courses.filter((c) => c.coverage?.coverage?.notes).length,
          theory: s3.counts?.theory || 0,
          lab: s3.counts?.lab || 0,
        },
        4: {
          totalCourses: s4Courses.length,
          curatedContentCourses: s4Courses.filter((c) => c.coverage?.coverage?.notes).length,
          theory: s4.counts?.theory || 0,
          lab: s4.counts?.lab || 0,
        },
      },
      curatedCount,
      totalSecondYearCourses: allBranchCourses.length,
      reviewFlagCount,
      hasUnreviewedFlags: reviewFlagCount > 0,
    };
  });

  return {
    university: UNIVERSITY,
    checkedOn: UNIVERSITY.checkedOn,
    branchesCount: BRANCHES.length,
    totalMappedSchemeCourses: COURSES.length,
    archivedBranchesCount: ARCHIVED_BRANCHES.length,
    specializationsCount: SPECIALIZATIONS.length,
    firstYearScheme: {
      admissionScheme: FIRST_YEAR.admission_scheme,
      sem1CoursesCount: FIRST_YEAR.semester_course_ids["1"].length,
      sem2CoursesCount: FIRST_YEAR.semester_course_ids["2"].length,
      bridgeCoursesCount: FIRST_YEAR.bridge_course_ids.length,
    },
    branches: branchMatrix,
  };
}

/**
 * Onboarding Profile Resolver.
 * Connects college, admission batch, branch, semester, and returns honest curriculum status.
 */
export function resolveOnboardingCurriculum({
  collegeId = "rit-roorkee",
  branchId = "branch-06",
  batchId = "2022-23",
  semester = 3,
  firstYearGroup = "A",
  bridgeCourses = false,
  confirmedAlternatives = {},
} = {}) {
  const college = COLLEGES.find((c) => c.id === collegeId) || COLLEGES[0];
  const batch = ADMISSION_BATCHES.find((b) => b.id === batchId) || ADMISSION_BATCHES[0];

  // Check for college alias
  if (college.aliases[branchId]) {
    const aliasInfo = college.aliases[branchId];
    return {
      status: "unresolved_alias",
      college,
      alias: branchId,
      aliasInfo,
      message: aliasInfo.note,
      offerings: [],
    };
  }

  let offerings = [];
  if (semester === 1 || semester === 2) {
    offerings = resolveFirstYearOfferings({ semester, group: firstYearGroup, bridgeCourses });
  } else {
    const result = resolveBranchOfferings({ branchId, semester, confirmedAlternatives });
    offerings = result.courses || [];
  }

  return {
    status: "resolved",
    college,
    batch,
    semester,
    branch: getBranchById(branchId),
    offerings,
    missingContentNotice: offerings.some((c) => !c.coverage?.coverage?.notes)
      ? "Some course units have syllabus tables only; complete teaching notes, questions and quizzes are under ongoing curation."
      : null,
  };
}
