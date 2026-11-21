import * as content from "../../content/index.js";
import { icon } from "../ui/icons.js";
import * as diagrams from "../ui/diagrams.js";
import { StudySearch } from "../features/assistant/search.js";
import { labFrameMain } from "../features/lab/frame.js";
import { initializeState } from "./state.js";
import { registerEvents } from "./events.js";
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
export function createApplication() {
  const app = {
    ...content,
    ...diagrams,
    icon,
    StudySearch,
    LAB_FRAME_SOURCE: "(" + labFrameMain.toString() + ")()",
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
  initializeState(app);
  registerEvents(app);
  app.save();
  app.render();
  return app;
}
