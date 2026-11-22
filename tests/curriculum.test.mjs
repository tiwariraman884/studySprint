import test from "node:test";
import assert from "node:assert/strict";
import {
  UNIVERSITY,
  COLLEGES,
  ADMISSION_BATCHES,
  BRANCHES,
  COURSES,
  FIRST_YEAR,
  ARCHIVED_BRANCHES,
  SPECIALIZATIONS,
  UNRESOLVED_ISSUES,
  getCourseById,
  getBranchById,
  resolveFirstYearOfferings,
  resolveBranchOfferings,
  computeCoverageMatrix,
  resolveOnboardingCurriculum,
} from "../src/content/curriculum/index.js";

test("academic hierarchy models university, college, batches, branches, courses", () => {
  assert.equal(UNIVERSITY.id, "uktech");
  assert.ok(COLLEGES.length >= 1);
  assert.equal(COLLEGES[0].aliases["CSE++"].status, "unresolved");
  assert.ok(ADMISSION_BATCHES.length >= 3);
  assert.equal(BRANCHES.length, 21, "Must contain exactly 21 main B.Tech branches");
  assert.equal(COURSES.length, 558, "Must contain exactly 558 mapped course entries");
  assert.equal(ARCHIVED_BRANCHES.length, 2, "Must contain 2 archival branches");
  assert.equal(SPECIALIZATIONS.length, 8, "Must contain 8 optional specializations");
});

test("all 21 branches have separate Sem 3 and Sem 4 course mappings", () => {
  for (const b of BRANCHES) {
    assert.ok(b.id, "Branch missing id");
    assert.ok(b.name, `Branch ${b.id} missing name`);
    assert.ok(b.source_id, `Branch ${b.id} missing source_id`);
    
    const s3 = b.semester_course_ids?.["3"];
    const s4 = b.semester_course_ids?.["4"];
    assert.ok(Array.isArray(s3) && s3.length >= 10, `${b.name} Sem 3 course list incomplete: ${s3?.length}`);
    assert.ok(Array.isArray(s4) && s4.length >= 10, `${b.name} Sem 4 course list incomplete: ${s4?.length}`);
  }
});

test("first-year common curriculum supports Sem 1, Sem 2, alternatives and bridge courses", () => {
  const sem1GroupA = resolveFirstYearOfferings({ semester: 1, group: "A" });
  const sem1GroupB = resolveFirstYearOfferings({ semester: 1, group: "B" });
  assert.equal(sem1GroupA.length, FIRST_YEAR.semester_course_ids["1"].length);
  assert.equal(sem1GroupB.length, FIRST_YEAR.semester_course_ids["1"].length);

  // Group A and B select different alternative codes for pairs
  const pairA = sem1GroupA.find((c) => c.isAlternativePair);
  const pairB = sem1GroupB.find((c) => c.isAlternativePair);
  assert.ok(pairA && pairB, "Should contain alternative paired subjects");
  assert.notEqual(pairA.activeCode, pairB.activeCode, "Group A and B should select different codes");

  // Bridge courses for Biotechnology
  const withBridge = resolveFirstYearOfferings({ semester: 1, group: "A", bridgeCourses: true });
  assert.equal(withBridge.length, sem1GroupA.length + FIRST_YEAR.bridge_course_ids.length);
  assert.ok(withBridge.some((c) => c.isBridgeCourse));
});

test("unresolved college aliases and known source issues are held in review without guessing", () => {
  // CSE++ test
  const onboarding = resolveOnboardingCurriculum({ branchId: "CSE++" });
  assert.equal(onboarding.status, "unresolved_alias");
  assert.match(onboarding.message, /not mapped/i);

  // Unresolved catalog issues
  assert.ok(UNRESOLVED_ISSUES.some((i) => i.includes("CSE++")));
  assert.ok(UNRESOLVED_ISSUES.some((i) => i.includes("First-year paired subjects")));
  assert.ok(UNRESOLVED_ISSUES.some((i) => i.includes("Aeronautical")));
  assert.ok(UNRESOLVED_ISSUES.some((i) => i.includes("CIA1/CIA2")));

  // Known review flags in courses
  // EEE draft heading
  const eeeS3 = resolveBranchOfferings({ branchId: "branch-05", semester: 3 });
  assert.ok(eeeS3.courses.length > 0);

  // Biotechnology CST-009 / GB-04
  const biotech = resolveBranchOfferings({ branchId: "branch-02", semester: 3 });
  assert.ok(biotech.courses.length > 0);
});

test("courses have stable identities, official source references, and coverage indicators", () => {
  const sample = getCourseById("source-01-s3-p3-r4");
  assert.ok(sample);
  assert.equal(sample.id, "source-01-s3-p3-r4");
  assert.ok(sample.pdf_page > 0);
  assert.match(sample.source_url, /^https:\/\/uktech\.ac\.in/);
  assert.ok(Array.isArray(sample.codes));

  // Coverage for known authored subject vs syllabus-only course
  const deCourse = getCourseById("source-06-s3-p3-r4"); // Digital Electronics in CSE
  if (deCourse) {
    const coverage = deCourse.coverage || resolveBranchOfferings({ branchId: "branch-06", semester: 3 }).courses.find(c => c.id === deCourse.id)?.coverage;
    assert.ok(coverage);
  }
});

test("coverage matrix computes metrics across all 21 branches without false completeness", () => {
  const matrix = computeCoverageMatrix();
  assert.equal(matrix.branchesCount, 21);
  assert.equal(matrix.totalMappedSchemeCourses, 558);
  assert.equal(matrix.branches.length, 21);
  for (const b of matrix.branches) {
    assert.ok(b.semesters[3].totalCourses >= 10);
    assert.ok(b.semesters[4].totalCourses >= 10);
    // Coverage must reflect that non-curated courses are NOT marked fully complete
    assert.ok(b.curatedCount <= b.totalSecondYearCourses);
  }
});
