import fs from "node:fs/promises";
import path from "node:path";
export const root = path.resolve(import.meta.dirname, "..");
const types = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".svg": "image/svg+xml",
};
export async function walk(dir) {
  const result = [];
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) result.push(...(await walk(file)));
    else if (item.isFile()) result.push(file);
  }
  return result.sort();
}
export async function collectAssets() {
  const assets = {};
  for (const folder of ["public", "src/client", "src/content"]) {
    for (const file of await walk(path.join(root, folder))) {
      const type = types[path.extname(file)];
      if (!type) continue;
      // Local-only configuration is never bundled or committed.
      if (/config\.local\.js$/.test(file)) continue;
      const relative = path
        .relative(path.join(root, folder === "public" ? "public" : "."), file)
        .split(path.sep)
        .join("/");
      assets["/" + relative] = { type, body: await fs.readFile(file, "utf8") };
    }
  }
  return assets;
}
