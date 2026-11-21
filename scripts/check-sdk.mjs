#!/usr/bin/env node
// Verify the pinned Supabase browser SDK and refresh its integrity hash.
//
//   npm run check:sdk          print the sha384 for the pinned URL and compare
//                              it with src/client/core/auth.js
//   npm run check:sdk -- --write update SDK_INTEGRITY after an intentional bump
//
// Tests never call this: the SDK is replaced by a fake in tests/auth.test.mjs,
// so no network access is needed to run the suite.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const authPath = path.resolve(import.meta.dirname, "../src/client/core/auth.js");
const source = await fs.readFile(authPath, "utf8");
const version = source.match(/SDK_VERSION = "([^"]+)"/)?.[1];
const current = source.match(/SDK_INTEGRITY = "([^"]*)"/)?.[1] || "";
if (!version) throw new Error("SDK_VERSION not found in auth.js");
const url = `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${version}/+esm`;

const response = await fetch(url);
if (!response.ok) throw new Error(`${url} returned ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const integrity = `sha384-${createHash("sha384").update(bytes).digest("base64")}`;

console.log(`SDK        ${version}`);
console.log(`URL        ${url}`);
console.log(`bytes      ${bytes.length}`);
console.log(`integrity  ${integrity}`);
console.log(`pinned     ${current || "(none)"}`);

if (process.argv.includes("--write")) {
  await fs.writeFile(authPath, source.replace(/SDK_INTEGRITY = "[^"]*"/, `SDK_INTEGRITY = "${integrity}"`));
  console.log("Updated SDK_INTEGRITY.");
} else if (current !== integrity) {
  console.error("Pinned integrity does not match the downloaded build.");
  process.exitCode = 1;
} else {
  console.log("Pinned integrity matches.");
}
