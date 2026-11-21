import test from "node:test";
import assert from "node:assert/strict";
import { createWorker } from "../src/server/app.js";
import { collectAssets } from "../scripts/assets.mjs";
import {
  clientAuthConfig,
  clientConfigScript,
  validateEnvironment,
} from "../src/server/env.js";
import { handlePacks, importPack } from "../src/server/api/packs.js";
import { CIA2_PACK } from "../src/content/packs/index.js";

const assets = await collectAssets();
const worker = createWorker(assets);
const PUBLISHABLE = `sb_publishable_${"a".repeat(30)}`;
const SERVICE = `sb_secret_${"b".repeat(30)}`;

test("client configuration exposes only the public project URL and key", () => {
  const env = {
    SUPABASE_URL: "https://demo.supabase.co/",
    SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE,
    IMPORT_TOKEN: "secret-import-token",
  };
  const config = clientAuthConfig(env);
  assert.equal(config.enabled, true);
  assert.equal(config.supabaseUrl, "https://demo.supabase.co");
  assert.equal(config.supabaseAnonKey, PUBLISHABLE);
  assert.deepEqual(Object.keys(config).sort(), ["enabled", "supabaseAnonKey", "supabaseUrl"]);
  const page = clientConfigScript(env);
  assert.ok(page.includes(PUBLISHABLE));
  assert.doesNotMatch(page, /sb_secret_|secret-import-token|SERVICE_ROLE/);
});

test("a page rendered without configuration runs guest-only", async () => {
  const response = await worker.fetch(new Request("https://study.example/"), {});
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /"enabled":false/);
  assert.doesNotMatch(html, /service_role|sb_secret_/i);
});

test("auth callback routes render a safe page and reject other methods", async () => {
  for (const path of ["/auth/callback", "/auth/reset"]) {
    const response = await worker.fetch(new Request(`https://study.example${path}`), {});
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.match(html, /Continue to Study Sprint/);
    assert.doesNotMatch(html, /password=|access_token|refresh_token/);
    const post = await worker.fetch(new Request(`https://study.example${path}`, { method: "POST" }), {});
    assert.equal(post.status, 405);
  }
});

test("environment validation refuses a secret in a public variable", () => {
  const serviceJwt = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.sig`;
  assert.equal(validateEnvironment({ SUPABASE_ANON_KEY: serviceJwt }).ok, false);
  assert.equal(validateEnvironment({ PUBLIC_SUPABASE_SERVICE_ROLE_KEY: SERVICE }).ok, false);
  assert.equal(validateEnvironment({ SUPABASE_URL: "not-a-url" }).ok, false);
  assert.equal(validateEnvironment({ SUPABASE_URL: "https://ok.supabase.co", SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE }).ok, true);
});

test("pack listing is read-only and honest when not configured", async () => {
  const response = await handlePacks(new Request("https://study.example/api/packs"), {}, new URL("https://study.example/api/packs"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.configured, false);
  assert.deepEqual(body.packs, []);
  const post = await handlePacks(
    new Request("https://study.example/api/packs", { method: "POST" }),
    {},
    new URL("https://study.example/api/packs"),
  );
  assert.equal(post.status, 405);
});

test("pack import is refused without a token, across origins, and with invalid content", async () => {
  const env = {
    SUPABASE_URL: "https://demo.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: SERVICE,
  };
  const url = new URL("https://study.example/api/packs/import");
  const request = (body, headers = {}) =>
    new Request(url, {
      method: "POST",
      headers: { origin: "https://study.example", "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  // No IMPORT_TOKEN configured: refuse rather than write anonymously.
  let response = await importPack(request({ pack: CIA2_PACK }), env);
  assert.equal(response.status, 503);
  // Configured but caller sends the wrong token.
  response = await importPack(request({ pack: CIA2_PACK }, { "x-import-token": "nope" }), {
    ...env,
    IMPORT_TOKEN: "correct-token",
  });
  assert.equal(response.status, 401);
  // Wrong origin.
  response = await importPack(
    request({ pack: CIA2_PACK }, { "x-import-token": "correct-token", origin: "https://evil.example" }),
    { ...env, IMPORT_TOKEN: "correct-token" },
  );
  assert.equal(response.status, 403);
  // Invalid pack with a valid token.
  response = await importPack(request({ pack: { id: "bad" } }, { "x-import-token": "correct-token" }), {
    ...env,
    IMPORT_TOKEN: "correct-token",
  });
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.ok(Array.isArray(body.details) && body.details.length > 0);
});

test("a valid, authorised import calls the SQL importer with the content hash", async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (target, init) => {
    calls.push({ target: String(target), init });
    return new Response(JSON.stringify({ packId: CIA2_PACK.id, version: CIA2_PACK.version, changed: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const response = await importPack(
      new Request("https://study.example/api/packs/import", {
        method: "POST",
        headers: { origin: "https://study.example", "content-type": "application/json", "x-import-token": "t" },
        body: JSON.stringify({ pack: CIA2_PACK }),
      }),
      { SUPABASE_URL: "https://demo.supabase.co", SUPABASE_SERVICE_ROLE_KEY: SERVICE, IMPORT_TOKEN: "t" },
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.match(body.contentHash, /^[0-9a-f]{8}$/);
    assert.equal(calls.length, 1);
    assert.match(calls[0].target, /\/rest\/v1\/rpc\/import_course_pack$/);
    const sent = JSON.parse(calls[0].init.body);
    assert.equal(sent.p_pack.id, "cia-2-2025-26");
    assert.equal(sent.p_content_hash, body.contentHash);
    assert.equal(calls[0].init.headers.apikey, SERVICE);
  } finally {
    globalThis.fetch = original;
  }
});

test("the importer never puts a secret in its response", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("boom", { status: 500 });
  try {
    const response = await importPack(
      new Request("https://study.example/api/packs/import", {
        method: "POST",
        headers: { origin: "https://study.example", "content-type": "application/json", "x-import-token": "t" },
        body: JSON.stringify({ pack: CIA2_PACK }),
      }),
      { SUPABASE_URL: "https://demo.supabase.co", SUPABASE_SERVICE_ROLE_KEY: SERVICE, IMPORT_TOKEN: "t" },
    );
    const text = await response.text();
    assert.equal(response.status, 502);
    assert.doesNotMatch(text, /sb_secret_/);
  } finally {
    globalThis.fetch = original;
  }
});
