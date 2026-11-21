import path from "node:path";
import { spawnSync } from "node:child_process";
import { root, walk } from "./assets.mjs";
let count = 0;
for (const folder of ["src", "public/workers", "scripts", "tests"]) {
  for (const file of await walk(path.join(root, folder))) {
    if (!/\.m?js$/.test(file)) continue;
    const result = spawnSync(process.execPath, ["--check", file], {
      stdio: "inherit",
    });
    if (result.status !== 0) process.exit(result.status || 1);
    count++;
  }
}
console.log(`Syntax checked ${count} JavaScript modules.`);
