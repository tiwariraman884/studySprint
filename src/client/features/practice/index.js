// Practice hub feature: unites Short Questions, Long Answers, and Practice Quizzes
// under the primary "Practice" navigation view.

export function register(app) {
  app.practiceTab = app.practiceTab || "short"; // "short", "long", "quiz"

  app.renderPractice = function renderPractice() {
    const tabs = [
      ["short", "Short Questions", "140 questions · Worked methods"],
      ["long", "10-Mark Answer Studio", "60 long answers · Marking rubrics"],
      ["quiz", "Practice Quizzes", "176 MCQs · Custom size & timer"],
    ];

    let contentHtml = "";
    if (app.practiceTab === "short") {
      contentHtml = app.renderQuestions();
    } else if (app.practiceTab === "long") {
      contentHtml = app.renderLong();
    } else {
      contentHtml = app.renderQuiz();
    }

    return `<div class="practice-tab-strip toolbar" style="margin-bottom:15px;gap:8px">
      ${tabs
        .map(
          ([t, label, sub]) =>
            `<button class="filter-chip ${app.practiceTab === t ? "active" : ""}" data-action="practice-tab" data-tab="${t}" style="padding:8px 16px;text-align:left">
              <strong>${label}</strong>
              <small style="display:block;opacity:0.8;font-size:10px">${sub}</small>
            </button>`,
        )
        .join("")}
    </div>
    ${contentHtml}`;
  };
}
