# Deployment

## Local development

1. Install Node.js 22 or newer.
2. Run `npm run dev` from the repository root.
3. Open the URL printed in the terminal.
4. Refresh after frontend edits; restart after backend edits.

No API key or npm package installation is required. The `.env.example` file documents optional variables; the server reads shell environment variables and does not automatically load a `.env` file.

## Cloudflare Worker

The source includes `wrangler.jsonc`. Set its Worker name to a name in your own account, use the official Wrangler CLI, authenticate to your account, then run:

```bash
npm run verify
npx wrangler deploy
```

Wrangler runs the configured build. `dist/server/index.js` is the generated entry point; it imports the backend modules beside it and contains the frontend asset map. This repository does not contain your Cloudflare credentials, and no Cloudflare deployment was performed during the source export.

## Static frontend

`dist/client/` contains the standalone browser assets. Serve it from the root of a domain. The app currently uses root-relative URLs, so a subdirectory deployment such as a default GitHub Pages project path requires base-path changes.

Static hosting alone supports the notes, planner, quizzes, revision, browser workers and local AI. It does not implement `/api/compile`; C++ needs the corresponding backend on the same origin. Do not label a static-only deployment as a fully working C++ lab.

## Existing Sites publication

The published dashboard remains at https://raman-cia2-study-sprint.fondhyssop1.chatgpt.site/ . This GitHub export is not automatically connected to that publication. GitHub Actions verifies code but does not deploy it.

For an authorized Sites workflow, set `SITES_PROJECT_ID` in the build environment to the exact existing project ID. The build then emits `dist/.openai/hosting.json`. Keep project selection, source synchronization, packaging and deployment under the hosting workflow; do not guess project IDs. The GitHub source intentionally does not include an active hosting identity or access credentials.

## Progress migration

Browser storage belongs to its origin. To move between the existing site, localhost and a new deployment, export progress from the old origin and import it through the new site's settings. Import replaces that browser's stored progress. A repository clone does not include anyone's saved progress, chat or code drafts.
