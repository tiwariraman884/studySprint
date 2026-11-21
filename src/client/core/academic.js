// Academic context: which official university scheme the student is following.
//
// This is deliberately separate from the course pack. A pack is authored
// content; the academic context is the official branch/semester scheme that
// decides which authored subjects actually apply. It never deletes progress:
// hiding a subject only removes it from the current view.
import {
  BRANCHES,
  COLLEGES,
  ADMISSION_BATCHES,
  getBranchById,
  resolveOnboardingCurriculum,
} from "../../content/curriculum/index.js";

export const MAPPED_SEMESTERS = [1, 2, 3, 4];

export const DEFAULT_ACADEMIC = Object.freeze({
  collegeId: "rit-roorkee",
  batchId: "2025-26",
  branchId: "branch-06",
  semester: 3,
  firstYearGroup: "A",
  bridgeCourses: false,
  confirmedAlternatives: {},
});

export function normalizeAcademic(raw = {}) {
  const branch = getBranchById(raw.branchId) || getBranchById(DEFAULT_ACADEMIC.branchId);
  const college = COLLEGES.find((c) => c.id === raw.collegeId) || COLLEGES[0];
  const batch = ADMISSION_BATCHES.find((b) => b.id === raw.batchId) || ADMISSION_BATCHES[1] || ADMISSION_BATCHES[0];
  const semester = MAPPED_SEMESTERS.includes(Number(raw.semester)) ? Number(raw.semester) : DEFAULT_ACADEMIC.semester;
  const alternatives = {};
  for (const [courseId, code] of Object.entries(raw.confirmedAlternatives || {})) {
    if (typeof code === "string" && code.length <= 24) alternatives[courseId] = code;
  }
  return {
    collegeId: college.id,
    batchId: batch.id,
    branchId: branch.id,
    semester,
    firstYearGroup: raw.firstYearGroup === "B" ? "B" : "A",
    bridgeCourses: raw.bridgeCourses === true,
    confirmedAlternatives: alternatives,
  };
}

/** Resolve the official course table for this context. */
export function resolveAcademic(academic) {
  const a = normalizeAcademic(academic);
  const resolved = resolveOnboardingCurriculum({
    collegeId: a.collegeId,
    branchId: a.branchId,
    batchId: a.batchId,
    semester: a.semester,
    firstYearGroup: a.firstYearGroup,
    bridgeCourses: a.bridgeCourses,
    confirmedAlternatives: a.confirmedAlternatives,
  });
  return { academic: a, ...resolved };
}

/** Authored subject ids (de, cpp, …) that match the resolved course table. */
export function applicableAuthoredIds(academic) {
  const resolved = resolveAcademic(academic);
  if (resolved.status !== "resolved") return [];
  const ids = new Set();
  for (const course of resolved.offerings || []) {
    const id = course.coverage?.authoredSubjectId;
    if (id) ids.add(id);
  }
  return [...ids];
}

export function academicLabel(academic) {
  const a = normalizeAcademic(academic);
  const branch = getBranchById(a.branchId);
  return `${branch?.name || "Branch"} · Semester ${a.semester}`;
}

export function academicSummary(academic) {
  const a = normalizeAcademic(academic);
  const resolved = resolveAcademic(a);
  const authored = applicableAuthoredIds(a);
  return {
    ...a,
    label: academicLabel(a),
    status: resolved.status,
    message: resolved.message || resolved.missingContentNotice || "",
    offerings: resolved.offerings || [],
    authoredIds: authored,
    mappedCourses: (resolved.offerings || []).length,
  };
}

export { BRANCHES, COLLEGES, ADMISSION_BATCHES, getBranchById };
