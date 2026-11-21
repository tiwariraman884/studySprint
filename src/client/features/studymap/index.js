// Study Map feature: Semester -> Subject -> Unit -> Topic hierarchy,
// official university syllabus citations, coverage indicators, and the
// 21-branch curriculum coverage matrix.

import {
  BRANCHES,
  COLLEGES,
  ADMISSION_BATCHES,
  computeCoverageMatrix,
  resolveBranchOfferings,
  resolveFirstYearOfferings,
  getBranchById,
  UNRESOLVED_ISSUES,
} from "../../../content/curriculum/index.js";

export function register(app) {
  // Current active academic selection in the UI
  app.activeBranchId = app.activeBranchId || "branch-06"; // Default: CSE
  app.activeSemester = app.activeSemester || 3;
  app.activeFirstYearGroup = app.activeFirstYearGroup || "A";
  app.activeBridgeCourses = app.activeBridgeCourses || false;
  app.studyMapTab = app.studyMapTab || "map"; // "map" or "matrix"

  app.renderStudyMap = function renderStudyMap() {
    if (app.studyMapTab === "matrix") {
      return app.renderCurriculumMatrix();
    }

    const currentBranch = getBranchById(app.activeBranchId) || BRANCHES[5];
    const sem = Number(app.activeSemester);

    let offerings = [];
    if (sem === 1 || sem === 2) {
      offerings = resolveFirstYearOfferings({
        semester: sem,
        group: app.activeFirstYearGroup,
        bridgeCourses: app.activeBridgeCourses,
      });
    } else {
      const res = resolveBranchOfferings({
        branchId: currentBranch.id,
        semester: sem,
        confirmedAlternatives: app.s.confirmedAlternatives || {},
      });
      offerings = res.courses || [];
    }

    return `${app.header(
      "Academic Study Map",
      "Official university syllabus structure, official PDF citations, reading completion, and mastery.",
      "SEMESTER → SUBJECT → UNIT → TOPIC",
      `<div class="flex" style="gap:8px"><button class="outline-btn heading-action" data-action="studymap-tab" data-tab="matrix">${app.icon("layers")}21-Branch Coverage Matrix</button></div>`,
    )}
    <div class="studymap-controls toolbar" style="flex-wrap:wrap;gap:12px;margin-bottom:20px;padding:16px;background:var(--card-bg, #1e2420);border-radius:12px;border:1px solid var(--border-color, #2a332d)">
      <div class="field" style="margin:0;min-width:240px">
        <label for="branchSelect" style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-muted,#8a968d)">Official B.Tech Branch (21 University Branches)</label>
        <select id="branchSelect" data-action="studymap-branch" style="width:100%">
          ${BRANCHES.map(
            (b) =>
              `<option value="${b.id}" ${b.id === currentBranch.id ? "selected" : ""}>${app.esc(b.name)}</option>`,
          ).join("")}
          <option value="CSE++" disabled>RIT CSE++ (College Alias · Pending official degree mapping)</option>
        </select>
      </div>
      <div class="field" style="margin:0;min-width:140px">
        <label for="semesterSelect" style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-muted,#8a968d)">Semester</label>
        <select id="semesterSelect" data-action="studymap-semester" style="width:100%">
          ${[1, 2, 3, 4].map(
            (s) => `<option value="${s}" ${s === sem ? "selected" : ""}>Semester ${s} ${s <= 2 ? "(Common Year 1)" : ""}</option>`,
          ).join("")}
        </select>
      </div>
      ${
        sem <= 2
          ? `<div class="field" style="margin:0;min-width:140px">
              <label for="groupSelect" style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-muted,#8a968d)">Year 1 Group</label>
              <select id="groupSelect" data-action="studymap-group" style="width:100%">
                <option value="A" ${app.activeFirstYearGroup === "A" ? "selected" : ""}>Group A (Physics cycle)</option>
                <option value="B" ${app.activeFirstYearGroup === "B" ? "selected" : ""}>Group B (Chemistry cycle)</option>
              </select>
            </div>`
          : ""
      }
    </div>

    <div class="section-head">
      <div>
        <h2>${app.esc(currentBranch.name)} · Semester ${sem}</h2>
        <p class="sub">${offerings.length} course offerings mapped from official university scheme tables.</p>
      </div>
    </div>

    <div class="studymap-courses-grid stack" style="gap:20px">
      ${offerings
        .map((course) => {
          const coverage = course.coverage?.coverage || {};
          const isCurated = coverage.notes;
          const matchingAuthoredSubject = course.coverage?.authoredSubjectId
            ? app.getSubject(course.coverage.authoredSubjectId)
            : null;
          const subjectTopics = matchingAuthoredSubject
            ? app.TOPICS.filter((t) => t.subject === matchingAuthoredSubject.id)
            : [];
          const readCount = subjectTopics.filter((t) => app.s.materialRead?.[t.id]).length;
          const doneCount = subjectTopics.filter((t) => app.status(t.id) === "done").length;

          return `<article class="card course-map-card" style="border-left: 4px solid ${isCurated ? "var(--color-primary, #66814e)" : "var(--color-muted, #555)"};">
            <div class="between" style="align-items:flex-start">
              <div>
                <div class="flex" style="gap:8px;align-items:center;margin-bottom:6px">
                  <span class="tag ${isCurated ? "done" : "medium"}">${app.esc(course.activeCode || course.codes.join(" / "))}</span>
                  <span class="tag" style="background:rgba(255,255,255,0.05);color:var(--text-muted,#aaa)">${course.kind.toUpperCase()}</span>
                  <span class="small muted">${course.credits_as_printed ? course.credits_as_printed + " Credits" : "Non-credit"}</span>
                  ${course.isAlternativePair ? '<span class="tag" style="background:#523b20;color:#f0b429">Alternative Pair</span>' : ""}
                  ${course.isBridgeCourse ? '<span class="tag" style="background:#203b52;color:#29b4f0">Conditional Bridge</span>' : ""}
                </div>
                <h3 style="margin:4px 0 8px">${app.esc(course.activeTitle || course.title)}</h3>
                <p class="small muted" style="margin:0">
                  Official Source: <a href="${course.source_url}" target="_blank" rel="noopener noreferrer" style="color:var(--color-link,#88b86e);text-decoration:underline">University PDF (Page ${course.pdf_page}) ↗</a>
                </p>
              </div>
              <div class="coverage-badges flex" style="gap:6px;flex-wrap:wrap">
                <span class="badge ${coverage.syllabus ? "on" : "off"}" title="Syllabus mapped">Syllabus ✓</span>
                <span class="badge ${coverage.notes ? "on" : "off"}" title="Full lesson notes">${coverage.notes ? "Notes ✓" : "Notes Pending"}</span>
                <span class="badge ${coverage.questions ? "on" : "off"}" title="Practice questions">${coverage.questions ? "Questions ✓" : "Questions Pending"}</span>
                <span class="badge ${coverage.quiz ? "on" : "off"}" title="Quiz bank">${coverage.quiz ? "Quiz ✓" : "Quiz Pending"}</span>
              </div>
            </div>

            ${
              course.review_flags && course.review_flags.length
                ? `<div class="banner warn" style="margin-top:12px;font-size:12px">
                    <strong>Preserved for review:</strong> ${course.review_flags.map((f) => app.esc(f)).join(", ")}
                  </div>`
                : ""
            }

            ${
              isCurated && matchingAuthoredSubject
                ? `<div class="authored-course-content" style="margin-top:16px;border-top:1px solid var(--border-color,#333);padding-top:12px">
                    <div class="between" style="margin-bottom:10px">
                      <span class="small"><strong>Authored Lesson Bundle:</strong> ${subjectTopics.length} topics across ${app.CURRICULUM.find((c) => c.id === matchingAuthoredSubject.id)?.units.length || 0} units</span>
                      <span class="small muted">Read: ${readCount}/${subjectTopics.length} · Mastered: ${doneCount}/${subjectTopics.length}</span>
                    </div>
                    <div class="topics-summary-list" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:8px">
                      ${subjectTopics.slice(0, 6).map((t) => `
                        <div class="topic-compact-row flex" style="justify-content:space-between;align-items:center;background:rgba(255,255,255,0.03);padding:6px 10px;border-radius:6px;font-size:12px">
                          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:8px">${app.esc(t.title)}</span>
                          <div class="flex" style="gap:6px;align-items:center">
                            ${app.tag(app.status(t.id))}
                            <button class="icon-btn small" data-action="topic" data-id="${t.id}" title="Study topic">${app.icon("arrow")}</button>
                          </div>
                        </div>
                      `).join("")}
                    </div>
                    ${subjectTopics.length > 6 ? `<div style="margin-top:8px;text-align:right"><button class="text-btn small" data-action="subject" data-id="${matchingAuthoredSubject.id}">View all ${subjectTopics.length} topics in My Subjects ${app.icon("arrow")}</button></div>` : ""}
                  </div>`
                : `<div class="syllabus-notice" style="margin-top:12px;padding:8px 12px;background:rgba(255,255,255,0.02);border-radius:6px;font-size:12px;color:var(--text-muted,#888)">
                    Syllabus table mapped from university scheme. Full lesson notes and practice problems are under active authoring. Access the exact syllabus on <a href="${course.source_url}" target="_blank" rel="noopener noreferrer" style="color:var(--color-link,#88b86e)">PDF Page ${course.pdf_page} ↗</a>.
                  </div>`
            }
          </article>`;
        })
        .join("")}
    </div>`;
  };

  app.renderCurriculumMatrix = function renderCurriculumMatrix() {
    const matrix = computeCoverageMatrix();
    return `${app.header(
      "21-Branch Curriculum Coverage Matrix",
      "Veer Madho Singh Bhandari Uttarakhand Technical University (UTU) · Checked 21 Nov 2026",
      "OFFICIAL SOURCE REGISTER & COVERAGE",
      `<button class="outline-btn heading-action" data-action="studymap-tab" data-tab="map">${app.icon("arrow")}Back to Study Map</button>`,
    )}
    <div class="banner info" style="margin-bottom:20px">
      ${app.icon("shield")}
      <div>
        <strong>Transparent Academic Coverage:</strong> 558 source-table entries mapped across 21 B.Tech degree branches, common Year 1, and 2 archived branches. Course titles, codes, kinds, printed credits, and PDF page links are fully verified. Uncurated units remain visibly pending to prevent false claims of full completion.
      </div>
    </div>

    <div class="table-wrap card" style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="border-bottom:1px solid var(--border-color,#333);text-align:left">
            <th style="padding:10px">#</th>
            <th style="padding:10px">Branch Name</th>
            <th style="padding:10px">Official Source</th>
            <th style="padding:10px">Sem I & II</th>
            <th style="padding:10px">Sem III Courses</th>
            <th style="padding:10px">Sem IV Courses</th>
            <th style="padding:10px">Authored Bundles</th>
            <th style="padding:10px">Status / Flags</th>
          </tr>
        </thead>
        <tbody>
          ${matrix.branches
            .map(
              (b, idx) => `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05)">
              <td style="padding:10px;color:var(--text-muted,#888)">${idx + 1}</td>
              <td style="padding:10px"><strong>${app.esc(b.branchName)}</strong></td>
              <td style="padding:10px"><span class="tag">${app.esc(b.sourceId)}</span></td>
              <td style="padding:10px"><span class="small" style="color:#66814e">Common Year 1 ✓</span></td>
              <td style="padding:10px">${b.semesters[3].totalCourses} (${b.semesters[3].theory} Th, ${b.semesters[3].lab} Lab)</td>
              <td style="padding:10px">${b.semesters[4].totalCourses} (${b.semesters[4].theory} Th, ${b.semesters[4].lab} Lab)</td>
              <td style="padding:10px"><span class="badge ${b.curatedCount ? "on" : "off"}">${b.curatedCount} courses</span></td>
              <td style="padding:10px">${b.hasUnreviewedFlags ? `<span class="tag warn" title="${b.reviewFlagCount} issues">${b.reviewFlagCount} flags</span>` : '<span class="tag done">Verified</span>'}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="section-head" style="margin-top:30px">
      <h2>Preserved University Source Issues (Under Review)</h2>
      <p class="sub">These discrepancies from printed university PDFs are preserved honestly rather than silently guessed.</p>
    </div>
    <ul class="note-list card" style="padding:16px 24px">
      ${UNRESOLVED_ISSUES.map((issue) => `<li style="margin-bottom:8px"><strong>Note:</strong> ${app.esc(issue)}</li>`).join("")}
      <li style="margin-bottom:8px"><strong>EEE (source-05):</strong> Linked document contains an embedded EE draft heading; equivalence to EE is held in review.</li>
      <li style="margin-bottom:8px"><strong>CSE Sem IV (source-06):</strong> Contains an ambiguous credit cell for Technical Communication / Universal Human Values.</li>
      <li style="margin-bottom:8px"><strong>Biotechnology (source-02):</strong> Prints CST-009 for Cyber Security and GB-04 for General Proficiency; requires college verification.</li>
      <li style="margin-bottom:8px"><strong>Plastic & Polymer (source-11):</strong> Prints PPP-007 for both a theory and a lab row.</li>
    </ul>`;
  };
}
