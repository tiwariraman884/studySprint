// Course pack API.
//
//   GET  /api/packs          published packs (public, read-only)
//   POST /api/packs/import   import one validated pack with the service role
//
// The importer is the only write path for shared content. It refuses to run
// without SUPABASE_SERVICE_ROLE_KEY plus an explicit IMPORT_TOKEN, uses the
// `import_course_pack` SQL function (which is itself service-role only), and is
// idempotent: re-importing the same content hash changes nothing.
import { validatePack, packFingerprint } from "../../content/packs/course-pack.js";

const MAX_BODY = 12 * 1024 * 1024;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function sameOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // server-to-server import (CLI/CI) sends no origin
  const allowed = env?.SITE_URL || new URL(request.url).origin;
  return origin === new URL(allowed).origin;
}

/** Constant-time comparison for the import token. */
function tokenMatches(expected, provided) {
  if (!expected || !provided) return false;
  if (expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

async function postgrest(env, path, init = {}) {
  const url = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("importer-not-configured");
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
}

export async function listPacks(env = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ configured: false, packs: [] });
  }
  try {
    const response = await postgrest(env, "course_pack_summaries?select=id,title,description,academic_year,syllabus_version,publication_status,current_version,subject_count,topic_count&order=title");
    if (!response.ok) return json({ configured: true, error: `database-${response.status}`, packs: [] }, 502);
    const packs = await response.json();
    return json({ configured: true, packs });
  } catch {
    return json({ configured: true, error: "unreachable", packs: [] }, 502);
  }
}

export async function importPack(request, env = {}) {
  if (!sameOrigin(request, env)) return json({ error: "cross-origin import refused" }, 403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    return json({ error: "The importer is not configured (SUPABASE_SERVICE_ROLE_KEY missing)." }, 503);
  if (!env.IMPORT_TOKEN)
    return json({ error: "IMPORT_TOKEN is not set. Refusing an unauthenticated content write." }, 503);
  if (!tokenMatches(env.IMPORT_TOKEN, request.headers.get("x-import-token")))
    return json({ error: "invalid import token" }, 401);

  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY) return json({ error: "pack too large" }, 413);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  if (declared === 0 && JSON.stringify(body).length > MAX_BODY) return json({ error: "pack too large" }, 413);

  const pack = body.pack || body;
  const errors = validatePack(pack);
  if (errors.length) return json({ error: "invalid course pack", details: errors.slice(0, 20) }, 422);

  const contentHash = body.contentHash || packFingerprint(pack);
  try {
    const response = await postgrest(env, "rpc/import_course_pack", {
      method: "POST",
      body: JSON.stringify({ p_pack: pack, p_content_hash: contentHash }),
    });
    const text = await response.text();
    if (!response.ok) return json({ error: "import failed", details: text.slice(0, 500) }, 502);
    const parsed = text ? JSON.parse(text) : {};
    return json({ ok: true, contentHash, result: parsed });
  } catch (error) {
    return json({ error: "import failed", details: String(error?.message || error).slice(0, 300) }, 502);
  }
}

/** Route table entry used by the Worker and the dev server. */
export async function handlePacks(request, env, url) {
  if (url.pathname === "/api/packs") {
    if (request.method === "GET") return listPacks(env);
    return json({ error: "method not allowed" }, 405, { allow: "GET" });
  }
  if (url.pathname === "/api/packs/import") {
    if (request.method === "POST") return importPack(request, env);
    return json({ error: "method not allowed" }, 405, { allow: "POST" });
  }
  return null;
}
