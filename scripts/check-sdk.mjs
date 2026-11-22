#!/usr/bin/env node
// Verify the pinned Supabase browser SDK and refresh its integrity hash.
//
//   npm run check:sdk          compare the hash of the pinned build with auth.js
//   npm run check:sdk -- --write   update SDK_INTEGRITY after an intentional bump
//
// Tests never call this: auth.test.mjs injects a fake client, so the suite needs
// no network access.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const authPath = path.resolve(import.meta.dirname, "../src/client/core/auth.js");
const source = await fs.readFile(authPath, "utf8");
const version = source.match(/SDK_VERSION = "([^"]+)"/)?.[1];
const current = source.match(/SDK_INTEGRITY = "([^"]*)"/)?.[1] || "";
if (!version) throw new Error("SDK_VERSION not found in src/client/core/auth.js");
// The URL template lives next to the version; evaluate it exactly as the client
// does, so the checker can never drift from the runtime URL.
const template = source.match(/SDK_URL = (`[^`]+`);/)?.[1];
if (!template) throw new Error("SDK_URL template not found");
const url = new Function(`return ${template.replace(/\$\{SDK_VERSION\}/g, version)}`)();

const response = await fetch(url);
if (!response.ok) throw new Error(`${url} returned ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const text = bytes.toString("utf8");

// A browser build must not import a Node-only package such as "ws": that is
// exactly the failure this pinning was introduced to prevent.
const bare = [...text.matchAll(/(?:from|import\s*\()\s*["']([^"']+)["']/g)]
  .map((m) => m[1])
  .filter((s) => !/^(https?:)?\/\//.test(s) && !s.startsWith("/") && !s.startsWith(".") && !s.startsWith("data:"));
const integrity = `sha384-${createHash("sha384").update(bytes).digest("base64")}`;

console.log(`SDK        ${version}`);
console.log(`URL        ${url}`);
console.log(`bytes      ${bytes.length}`);
console.log(`bare imports ${bare.length}${bare.length ? " -> " + bare.slice(0, 4).join(", ") : ""}`);
console.log(`integrity  ${integrity}`);
console.log(`pinned     ${current || "(none)"}`);

if (process.argv.includes("--write")) {
  await fs.writeFile(authPath, source.replace(/SDK_INTEGRITY = "[^"]*"/, `SDK_INTEGRITY = "${integrity}"`));
  console.log("Updated SDK_INTEGRITY.");
} else if (bare.length) {
  console.error("The pinned build imports a package a browser cannot resolve.");
  process.exitCode = 1;
} else if (current !== integrity) {
  console.error("Pinned integrity does not match the downloaded build.");
  process.exitCode = 1;
} else {
  console.log("Pinned build is browser-safe and its integrity matches.");
}
