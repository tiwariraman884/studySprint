// Shared server helpers: environment validation and safe client injection.
//
// Only PUBLIC values are ever injected into the page. The service-role key is
// read by the pack importer and is never sent to a browser, logged, or placed in
// a build artefact.

const PUBLIC_KEYS = ["url", "anonKey"];
const SERVER_ONLY_KEYS = [
  "serviceRoleKey",
  "dbUrl",
  "smtpPassword",
  "jwtSecret",
];

/** Read the client-safe Supabase settings from an environment object. */
export function clientAuthConfig(env = {}) {
  const url = String(env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  // Supabase now issues "sb_publishable_…" keys; the legacy anon JWT still works.
  const anonKey = String(
    env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.PUBLIC_SUPABASE_ANON_KEY || "",
  ).trim();
  const enabled = !!url && anonKey.length > 20;
  return { supabaseUrl: url, supabaseAnonKey: anonKey, enabled };
}

/** Whether the pack importer is configured. Values are never returned. */
export function serverAuthConfig(env = {}) {
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const url = clientAuthConfig(env).supabaseUrl;
  return {
    canImport: !!url && serviceRoleKey.length > 20,
    canReadDatabase: !!(env.SUPABASE_DB_URL || ""),
  };
}

/**
 * The <script> that publishes client configuration. JSON is escaped so it can
 * never terminate the script element.
 */
export function clientConfigScript(env = {}) {
  const config = clientAuthConfig(env);
  const json = JSON.stringify(config).replace(/</g, "\\u003c").replace(/-->/g, "--\\>");
  return `<script>window.STUDY_SPRINT_CONFIG=${json};</script>`;
}

/** Refuse to start with a secret in a public variable name. */
export function validateEnvironment(env = {}) {
  for (const key of PUBLIC_KEYS) {
    const value = String(env[`PUBLIC_${keyToEnv(key)}`] || env[`SUPABASE_ANON_KEY`] || "");
    if (/service_role/.test(decodeMaybeJwt(value))) {
      return { ok: false, error: `PUBLIC_${keyToEnv(key)} looks like a service-role key. Use the publishable/anon key.` };
    }
  }
  for (const key of SERVER_ONLY_KEYS) {
    const envName = `SUPABASE_${key.replace(/([A-Z])/g, "_$1").toUpperCase()}`;
    const value = String(env[envName] || "");
    if (env[`PUBLIC_${envName}`]) {
      return { ok: false, error: `${envName} must not have a PUBLIC_ prefix.` };
    }
    if (value && /^sb_secret_/.test(value) && !key.includes("Key")) {
      return { ok: false, error: `Unexpected secret value in ${envName}.` };
    }
  }
  const url = String(env.SUPABASE_URL || "");
  if (url && !/^https?:\/\//.test(url)) return { ok: false, error: "SUPABASE_URL must be an http(s) URL." };
  const redirect = String(env.SITE_URL || "");
  if (redirect && !/^https?:\/\//.test(redirect))
    return { ok: false, error: "SITE_URL must be an http(s) URL." };
  return { ok: true };
}

function keyToEnv(key) {
  return key.replace(/([A-Z])/g, "_$1").toUpperCase();
}

function decodeMaybeJwt(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return token;
    return Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return token;
  }
}

/** Minimal HTML page used for the auth callback routes. */
export function authPage({ title, message, status = "info", next = "/" }) {
  const safe = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safe(title)} · Study Sprint</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#121714;color:#eef2e8;font:16px/1.55 system-ui,sans-serif}
  main{max-width:38rem;padding:2.25rem;border:1px solid #2c342c;border-radius:18px;background:#171d19}
  h1{font-size:1.35rem;margin:0 0 .6rem}
  p{margin:0 0 1.1rem;color:#c6cfc0}
  a{display:inline-block;padding:.65rem 1.1rem;border-radius:10px;background:#d05c3b;color:#fff;text-decoration:none;font-weight:650}
  .note{font-size:.85rem;color:#9aa794}
</style>
</head>
<body>
<main role="main">
  <h1>${safe(title)}</h1>
  <p>${safe(message)}</p>
  <a href="${safe(next)}">Continue to Study Sprint</a>
  <p class="note" data-status="${safe(status)}" aria-live="polite">This page does not read or store any credential itself. If you arrived here by mistake, close the tab.</p>
</main>
<script type="module">
  // The official Supabase client (loaded by the app) exchanges the PKCE code
  // carried in the URL fragment. This page only forwards the student back to
  // the app with the fragment intact while a message is visible.
  try {
    const next = new URLSearchParams(location.search).get("next");
    const target = new URL(location.origin + (next && next.startsWith("/") ? next : "/"));
    if (location.hash) target.hash = location.hash;
    setTimeout(() => location.replace(target.toString()), 1200);
  } catch {}
</script>
</main>
</body>
</html>`;
}
