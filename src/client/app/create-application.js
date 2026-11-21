import * as content from "../../content/index.js";
import { icon } from "../ui/icons.js";
import * as diagrams from "../ui/diagrams.js";
import { StudySearch } from "../features/assistant/search.js";
import { labFrameMain } from "../features/lab/frame.js";
import { initializeState } from "./state.js";
import { registerEvents } from "./events.js";
import { localISODate } from "../core/dates.js";
import { createWorkspace } from "../core/workspace-controller.js";
import { register as register_shell } from "../features/shell/index.js";
import { register as register_revision } from "../features/revision/index.js";
import { register as register_subjects } from "../features/subjects/index.js";
import { register as register_dashboard } from "../features/dashboard/index.js";
import { register as register_focus } from "../features/focus/index.js";
import { register as register_planner } from "../features/planner/index.js";
import { register as register_questions } from "../features/questions/index.js";
import { register as register_quiz } from "../features/quiz/index.js";
import { register as register_settings } from "../features/settings/index.js";
import { register as register_materials } from "../features/materials/index.js";
import { register as register_lab } from "../features/lab/index.js";
import { register as register_assistant } from "../features/assistant/index.js";
import { register as register_studymap } from "../features/studymap/index.js";
import { register as register_practice } from "../features/practice/index.js";
import { register as register_account } from "../features/account/ui.js";

/** Local calendar day, shared with the core date helpers. */
function localToday() {
  return localISODate();
}

export function createApplication() {
  const app = {
    ...content,
    ...diagrams,
    icon,
    StudySearch,
    LAB_FRAME_SOURCE: "(" + labFrameMain.toString() + ")()",
    localToday,
  };
  register_shell(app);
  register_revision(app);
  register_subjects(app);
  register_dashboard(app);
  register_focus(app);
  register_planner(app);
  register_questions(app);
  register_quiz(app);
  register_settings(app);
  register_materials(app);
  register_lab(app);
  register_assistant(app);
  register_studymap(app);
  register_practice(app);
  register_account(app);
  initializeState(app);
  registerEvents(app);
  // The workspace controller installs persistence (guest or cloud), applies the
  // student's pack/subject selection and starts the auth lifecycle. Rendering
  // starts first so the interface is usable while the account is checked.
  app.render();
  const workspace = createWorkspace(app);
  workspace.init().then(() => {
    app.render();
    if (app.workspace.state.mode === "guest" && !app.s.profile?.onboardingCompletedAt) {
      // A first visit, or a guest who has not onboarded: offer the short setup
      // once, but never block studying — the dialog can be dismissed.
      if (!sessionStorage.getItem("study-sprint:onboarded-offered")) {
        sessionStorage.setItem("study-sprint:onboarded-offered", "1");
        app.openOnboarding({ reason: "first-visit" });
      }
    }
  });
  return app;
}
