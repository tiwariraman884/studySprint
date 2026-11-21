# Editing study content

## Subject modules

Edit the appropriate module in `src/content/subjects/`. Each exports:

- `subject`: display name, subject ID, icon, color and description.
- `syllabus`: course code and the unit/exercise text.
- `topics`: stable IDs, units, notes, recall cues, worked problems, solutions and one MCQ per guide.
- `resources`: primary reading links with labels and descriptions.

Preserve existing topic IDs. Renaming an ID disconnects progress, revision records, saved notes, quiz references and long-answer links.

## Question banks

| File | Contents |
| --- | --- |
| `chapter-questions.js` | Short and long authored chapter exercises |
| `chapter-quizzes.js` | Additional MCQs linked to topic IDs |
| `long-answers.js` | Complete long-answer records, source labels and scoring rubrics |
| `lab-templates.js` | Editor examples and stdin |
| `algorithm-traces.js` | Data used in graph/tree/algorithm diagrams |
| `exam-focus.js` | Inferred CIA 2 unit filter |
| `paper-pattern.js` | The observed paper pattern |

Keep the long-answer catalog's authored chapter records synchronized with `chapter-questions.js` when editing an existing question. Short questions and the combined quiz bank are derived in `index.js`.

For each MCQ provide four distinct options, the correct zero-based answer index and an explanation. For numerical questions show assumptions, substitutions, intermediate working and a checked final result. For programming questions state the language/version and test inputs. Clearly label legacy C++ concepts and distinguish authored practice from uploaded-paper questions.

Run `npm test` after edits. Update coverage expectations intentionally when the curriculum changes. Do not include source PDFs, roll numbers, personal notes or private backups in the public repository.
