// Regression guard for the authentication SDK pin.
//
// Sign-in silently degraded to "could not start" because the pinned CDN build
// statically imported the Node-only package "ws" through realtime-js, which a
// browser cannot resolve. These checks are offline: they inspect the constants
// and the client source, so they run in every job.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const authPath = path.resolve(import.meta.dirname, "../src/client/core/auth.js");
const source = fs.readFileSync(authPath, "utf8");

test("the SDK is pinned to an exact version from a browser-oriented CDN build", () => {
  const version = source.match(/SDK_VERSION = "([^"]+)"/)?.[1];
  const urlTemplate = source.match(/SDK_URL = `([^`]+)`/)?.[1];
  assert.match(version || "", /^\d+\.\d+\.\d+$/, "SDK_VERSION must be an exact version");
  assert.ok(urlTemplate, "SDK_URL template is missing");
  const url = urlTemplate.replace(/\$\{SDK_VERSION\}/g, version);
  const parsed = new URL(url);
  assert.ok(parsed.protocol === "https:", "the SDK must be fetched over https");
  assert.match(parsed.hostname, /^(esm\.sh|cdn\.jsdelivr\.net|unpkg\.com)$/, "use a pinned public CDN");
  assert.ok(parsed.pathname.includes(version), "the URL must contain the pinned version");
  // esm.sh serves a bundled build only when asked; the unbundled one pulls a
  // bare "ws" import into the browser.
  if (parsed.hostname === "esm.sh") assert.match(parsed.search, /bundle/, "request a bundled esm.sh build");
});

test("the SDK integrity hash is a real SRI value and is actually applied", () => {
  const integrity = source.match(/SDK_INTEGRITY = "([^"]*)"/)?.[1];
  assert.match(integrity || "", /^sha384-[A-Za-z0-9+/]{40,}={0,2}$/, "SDK_INTEGRITY must be a sha384 SRI hash");
  assert.match(source, /link\.integrity = integrity/, "the integrity hash must be attached to a module load");
  assert.match(source, /import\(url\)/, "the SDK is imported from its pinned URL, not re-bundled");
});

test("the SDK pins no Node-only dependency into the browser", () => {
  assert.doesNotMatch(source, /from\s*["']ws["']|require\(["']ws["']\)/);
});

test("the auth controller reports the real cause of a failure", () => {
  // A dashboard that only says "could not start" cannot be supported.
  for (const code of ["email-rate-limited", "email-invalid", "signup-disabled", "not-configured"]) {
    assert.ok(source.includes(`"${code}"`), `error code ${code} must be mapped to a message`);
  }
  assert.match(source, /detail: String\(error\?\.message/);
});
