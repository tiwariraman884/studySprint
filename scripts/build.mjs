import fs from "node:fs/promises";
import path from "node:path";
import { root, collectAssets, walk } from "./assets.mjs";
const assets = await collectAssets(),
  out = path.join(root, "dist");
// Fail closed: a server secret must never reach a build artefact or the bundle.
const forbidden = [
  /SUPABASE_SERVICE_ROLE_KEY/,
  /IMPORT_TOKEN/,
  /postgres(ql)?:\/\/[^\s"']*:[^\s"']*@/,
  /sb_secret_[A-Za-z0-9_-]{10,}/,
];
for (const [url, asset] of Object.entries(assets)) {
  if (url.startsWith("/public/")) continue;
  for (const pattern of forbidden) {
    if (pattern.test(asset.body))
      throw Error(`Refusing to build: ${url} contains something that looks like a server secret (${pattern}).`);
  }
}
await fs.rm(out, { recursive: true, force: true });
for (const [url, asset] of Object.entries(assets)) {
  const file = path.join(out, "client", url.slice(1));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, asset.body);
}
for (const file of await walk(path.join(root, "src/server"))) {
  const dest = path.join(
    out,
    "server",
    path.relative(path.join(root, "src/server"), file),
  );
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(file, dest);
}
await fs.writeFile(
  path.join(out, "server/index.js"),
  `import {createWorker} from './app.js';\nconst assets=${JSON.stringify(assets)};\nexport default createWorker(assets);\n`,
);
if (process.env.SITES_PROJECT_ID) {
  await fs.mkdir(path.join(out, ".openai"), { recursive: true });
  await fs.writeFile(
    path.join(out, ".openai/hosting.json"),
    JSON.stringify({ project_id: process.env.SITES_PROJECT_ID }, null, 2) +
      "\n",
  );
}
// Generated, never committed: the environment names each deployment needs.
// Placeholders only; real values live in the host's environment variables.
const envTemplate = [
  "# Copy to .env.local or set in the hosting dashboard. Never commit values.",
  "# Public (safe in the browser, protected by row-level security):",
  "SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co",
  "SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLISHABLE-OR-ANON-KEY",
  "# Server-only (pack importer; never exposed to the browser):",
  "SUPABASE_SERVICE_ROLE_KEY=",
  "IMPORT_TOKEN=",
  "",
].join("\n");
await fs.writeFile(path.join(out, "env.example"), envTemplate);
console.log(
  `Built ${Object.keys(assets).length} frontend assets and the compiler Worker in dist/.`,
);
