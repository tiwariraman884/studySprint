// Backend-free smoke test.
//
// Boots the real Worker with the real asset collection, with an empty
// environment (the state a fresh clone is in), and checks that the server still
// serves a working guest app and is honest that cloud accounts are not
// configured. No browser and no database are needed, so this runs anywhere.
import assert from "node:assert/strict";
import { createWorker } from "../../src/server/app.js";
import { collectAssets } from "../../scripts/assets.mjs";

const assets = await collectAssets();
const worker = createWorker(assets);
const origin = "https://study.example";

const page = await worker.fetch(new Request(`${origin}/`), {});
assert.equal(page.status, 200, "the app page is served");
const html = await page.text();
assert.match(html, /type="module" src="\/src\/client\/index\.js"/, "the entry module is linked");
assert.match(html, /id="authDialog"/, "the account dialog exists");
const stylesheets = [...html.matchAll(/href="(\/src\/client\/styles\/[^"]+)"/g)].map((m) => m[1]);
assert.ok(stylesheets.includes("/src/client/styles/account.css"), "the account stylesheet is linked");
assert.match(html, /"enabled":false/, "without configuration the page reports cloud accounts as disabled");
assert.doesNotMatch(html, /sb_secret_|service_role/i, "no server secret reaches the page");

// The auth callback routes exist and render a safe page in both directions.
for (const path of ["/auth/callback", "/auth/reset"]) {
  const response = await worker.fetch(new Request(`${origin}${path}`), {});
  assert.equal(response.status, 200, path);
  const body = await response.text();
  assert.match(body, /Study Sprint/);
  assert.doesNotMatch(body, /access_token=|refresh_token=/, `${path} carries no token in the markup`);
}

// The pack endpoint is honest when the importer is not configured.
const packs = await worker.fetch(new Request(`${origin}/api/packs`), {});
assert.equal(packs.status, 200);
const packBody = await packs.json();
assert.equal(packBody.configured, false);
assert.deepEqual(packBody.packs, []);

// Every module the entry point reaches must be served: a missing file would
// break the app at load with no build step to catch it.
const seen = new Set();
const queue = ["/src/client/index.js"];
while (queue.length) {
  const url = queue.shift();
  if (seen.has(url)) continue;
  seen.add(url);
  const response = await worker.fetch(new Request(origin + url), {});
  assert.equal(response.status, 200, `${url} is served`);
  const body = await response.text();
  for (const match of body.matchAll(/(?:from|import)\s*["'](\.[^"']+)["']/g)) {
    const resolved = new URL(match[1], origin + url).pathname;
    assert.ok(assets[resolved], `${url} imports ${resolved}, which is not served`);
    queue.push(resolved);
  }
}
assert.ok(seen.size > 40, `module graph was walked (${seen.size} modules)`);
console.log(`Smoke test passed: ${seen.size} modules served, auth routes live, guest app honest.`);
