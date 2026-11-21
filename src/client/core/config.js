// Public client configuration.
//
// Only the Supabase project URL and the *anon* key belong here. The anon key is
// designed to be public and is protected by row-level security. The service
// role key never enters this file, the bundle or any browser code.
//
// The server can override these values at load time (see the <script> tag in
// public/index.html), and a developer can set them locally in
// public/config.local.js (git-ignored). Order:
//   1. window.STUDY_SPRINT_CONFIG (injected by the server from the environment)
//   2. public/config.local.js
//   3. the placeholders below (cloud features unavailable, guest mode still works)
const PLACEHOLDER_URL = "https://YOUR-PROJECT-REF.supabase.co";
const PLACEHOLDER_KEY = "YOUR-PUBLIC-ANON-KEY";

const injected = typeof window !== "undefined" ? window.STUDY_SPRINT_CONFIG : null;
const local = typeof window !== "undefined" ? window.STUDY_SPRINT_LOCAL_CONFIG : null;
const source = { ...(local || {}), ...(injected || {}) };

function isRealUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "::1"].includes(url.hostname))
    ) && !value.includes("YOUR-PROJECT-REF");
  } catch {
    return false;
  }
}

export function readConfig(source_ = source) {
  const url = String(source_.supabaseUrl || "").trim().replace(/\/+$/, "");
  const anonKey = String(source_.supabaseAnonKey || "").trim();
  const enabled =
    /** @type {boolean} */ (source_.enabled) !== false &&
    isRealUrl(url) &&
    anonKey.length > 20 &&
    anonKey !== PLACEHOLDER_KEY;
  return {
    supabaseUrl: url,
    supabaseAnonKey: anonKey,
    enabled,
    // Human-readable reason shown in the account panel instead of a broken form.
    reason: enabled
      ? ""
      : "Cloud accounts are not configured on this deployment. Guest mode works offline; see docs/AUTHENTICATION.md to enable sign-in.",
    siteName: "Study Sprint",
  };
}

export const CONFIG = readConfig();

export const AUTH_CALLBACK_PATH = "/auth/callback";
