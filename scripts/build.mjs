import fs from "node:fs/promises";
import path from "node:path";
import { root, collectAssets, walk } from "./assets.mjs";
const assets = await collectAssets(),
  out = path.join(root, "dist");
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
console.log(
  `Built ${Object.keys(assets).length} frontend assets and the compiler Worker in dist/.`,
);
