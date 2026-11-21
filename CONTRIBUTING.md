# Contributing

Use Node.js 22 or newer and run `npm run verify` before submitting changes. The project has no npm dependencies.

Keep changes within the relevant feature folder. Add new shared UI helpers under `src/client/ui/`, new academic material under `src/content/`, and backend behavior under `src/server/`. Register new feature methods in the composition root before state initialization. Prefer pure functions for matching, validation and calculations so they can be tested with Node's built-in test runner.

Retain stable topic/question IDs and backwards-compatible progress imports. Escape entered text before placing it in HTML. Treat AI responses as untrusted drafts and never execute them automatically.

Include a concise description of the behavior change and meaningful validation. Verify affected browser flows, including dark/light themes when changing UI. Do not commit generated `dist/`, credentials, browser progress or uploaded source PDFs.
