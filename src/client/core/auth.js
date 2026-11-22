// Authentication service, independent of any UI.
//
// Uses the official @supabase/supabase-js browser client (loaded lazily, pinned
// by version and integrity hash) for sign-up, email confirmation, password
// reset, session restore/refresh and sign-out. No custom token system.
//
// Everything the UI needs is exposed as events; the UI never talks to the SDK.
// When the SDK or the configuration is unavailable, the controller stays in a
// clearly-labelled "unavailable" state and guest mode keeps working.

// Pinned exactly. jsDelivr's "+esm" and esm.sh's unbundled builds of newer
// versions statically import the Node-only package "ws" through realtime-js,
// which a browser cannot resolve, so the SDK failed to load and sign-in fell
// back to "could not start". This build is a single bundled module with no
// bare imports; `npm run check:sdk` verifies the URL and its integrity hash.
export const SDK_VERSION = "2.53.0";
export const SDK_URL = `https://esm.sh/@supabase/supabase-js@${SDK_VERSION}?bundle-deps`;
// Subresource-integrity hash for that exact file. The browser then refuses a
// tampered or swapped build. Verified by `npm run check:sdk` (scripts/check-sdk.mjs);
// the client downloads via the integrity-checked path when it is set.
export const SDK_INTEGRITY = "sha384-EQk5jZyWFuFgRzWN/xrLNXcue9Kirjx7IYVJI77K9XxPDFW9OnNFW9ESoRrOX1mv";

export const AUTH_EVENTS = Object.freeze({
  ready: "ready",
  loading: "loading",
  error: "error",
  status: "status",
  session: "session",
  signedOut: "signedOut",
  expired: "expired",
});

export const VERIFY_PATH = "/auth/callback";
export const RESET_PATH = "/auth/reset";

/** Turn an SDK/network exception into a stable code the UI can translate. */
export function classifyAuthError(error) {
  // Supabase surfaces failures in several shapes: AuthApiError (message + status
  // + code), AuthRetryableFetchError (status 0), a raw TypeError from fetch, or
  // a plain string. Consider every field rather than only `message`, which is how
  // "email rate limit exceeded" was reduced to "Something went wrong".
  const message = String(error?.message || error?.msg || (typeof error === "string" ? error : "") || "").toLowerCase();
  const code = String(error?.code || error?.error_code || "").toLowerCase();
  const name = String(error?.name || "").toLowerCase();
  const status = Number(error?.status || error?.statusCode || 0);
  const all = `${message} ${code} ${name}`;

  if (/invalid login credentials/.test(all)) return { code: "invalid-credentials" };
  if (/email not confirmed/.test(all)) return { code: "email-not-confirmed" };
  if (/user already registered|already exists/.test(all)) return { code: "email-taken" };
  if (/password should be at least|weak.?password|weak_password/.test(all)) return { code: "weak-password" };
  if (/over_email_send_rate_limit|email rate limit|email_rate_limit/.test(all) || (code === "429" && /email/.test(all)))
    return { code: "email-rate-limited" };
  if (/rate limit|too many requests|for security purposes|rate_limit/.test(all) || status === 429)
    return { code: "rate-limited" };
  if (/email_address_invalid|invalid email|validation_failed/.test(all)) return { code: "email-invalid" };
  if (/signups not allowed|signup.*disabled|email provider.*disabled|signup_disabled/.test(all))
    return { code: "signup-disabled" };
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/.test(all) || name === "authretryablefetcherror" || status === 0)
    return { code: "network" };
  if (status >= 500) return { code: "server" };
  if (/expired|invalid.*token|jwt|refresh_token_not_found/.test(all)) return { code: "expired" };
  // Keep whatever the service actually said, so the UI can show it.
  return { code: "unknown", detail: String(error?.message || error?.msg || error || "").slice(0, 200), status: status || null };
}

export const AUTH_MESSAGES = Object.freeze({
  "invalid-credentials": "That email and password don’t match an account.",
  "email-not-confirmed": "Check your email and confirm the address before signing in.",
  "email-taken": "An account already uses this email.",
  "weak-password": "Choose a longer password.",
  "rate-limited": "Too many attempts. Wait a minute and try again.",
  "email-rate-limited":
    "The built-in email sender has reached its hourly limit, so no confirmation email can be sent right now. Sign in with an existing account, or ask the deployment owner to configure a mail provider (docs/AUTHENTICATION.md).",
  "email-invalid":
    "That address was rejected. Use a real, deliverable email; domains such as example.com are refused.",
  "signup-disabled":
    "This deployment has account creation switched off in its authentication settings.",
  network: "The server could not be reached. Check your connection and try again.",
  server: "The sign-in service is having trouble. Try again shortly.",
  expired: "Your session expired. Sign in again to continue syncing.",
  unknown: "Something went wrong. Please try again.",
});

export function describeAuthError(line) {
  if (line?.message) return line.message;
  if (AUTH_MESSAGES[line?.code]) return AUTH_MESSAGES[line.code];
  // Never reduce a real service answer to a shrug: show what it said.
  return line?.detail ? `The sign-in service said: ${line.detail}` : AUTH_MESSAGES.unknown;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), ms),
    ),
  ]);
}

/** Absolute redirect URL for a path, safe outside a browser (tests, SSR). */
export function redirectUrl(path) {
  const origin =
    typeof globalThis !== "undefined" &&
    globalThis.location?.origin &&
    globalThis.location.origin !== "null"
      ? globalThis.location.origin
      : "http://127.0.0.1:3000";
  return origin + path;
}

const NOT_CONFIGURED = Object.freeze({ code: "not-configured", message: "Authentication is not configured on this deployment." });

/**
 * @param {object} options
 * @param {object} options.config         readConfig() result
 * @param {() => Promise<any>} [options.loadSdk] injectable for tests
 * @param {any} [options.sdk]             injectable client for tests
 */
export function createAuthController({ config, loadSdk, sdk, timeoutMs = 12000, now = () => Date.now() } = {}) {
  const listeners = new Set();
  const state = {
    status: "idle", // idle | loading | ready | unavailable | error
    reason: "",
    session: null,
    user: null,
    expired: false,
    lastEventAt: 0,
  };
  let client = sdk || null;
  let subscription = null;

  function emit(event) {
    state.lastEventAt = now();
    for (const fn of listeners) {
      try {
        fn(state, event);
      } catch (error) {
        console.error("auth listener failed", error);
      }
    }
  }

  function update(patch, event) {
    Object.assign(state, patch);
    emit(event);
  }

  function describe(session) {
    const user = session?.user || null;

    return {
      session,
      user,
      email: user?.email || "",
      emailVerified: !!user?.email_confirmed_at || !!user?.confirmed_at,
      userId: user?.id || null,
    };
  }

  async function loadClient() {
    if (client) return client;
    if (!config?.enabled) {
      throw Object.assign(new Error("Authentication is not configured on this deployment."), NOT_CONFIGURED);
    }
    const loader =
      loadSdk ||
      (async () => {
        const mod = IMPORT_WITH_INTEGRITY(SDK_URL, SDK_INTEGRITY);
        const lib = await withTimeout(mod, timeoutMs, "SDK download");
        if (!lib?.createClient) throw new Error("SDK did not expose createClient");
        return lib;
      });
    const lib = await loader();
    client = lib.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // PKCE keeps the confirmation and recovery links single-use and binds
        // them to the browser that started the flow.
        flowType: "pkce",
      },
    });
    return client;
  }

  function handleSessionEvent(event, session) {
    if (session) {
      update({ expired: false, ...describe(session) }, AUTH_EVENTS.session);
      return;
    }
    const wasSignedIn = !!state.user;
    update({ session: null, user: null, expired: wasSignedIn && event === "SIGNED_OUT" }, AUTH_EVENTS.signedOut);
  }

  const controller = {
    get state() {
      return state;
    },
    subscribe(fn) {
      listeners.add(fn);
      fn(state, "subscribed");
      return () => listeners.delete(fn);
    },

    /** Load the SDK, restore the persisted session and start listening. */
    async init() {
      if (state.status === "ready") return state;
      if (state.status === "loading") return state;
      if (!config?.enabled) {
        update({ status: "unavailable", reason: config?.reason || "Authentication is not configured." }, AUTH_EVENTS.error);
        return state;
      }
      update({ status: "loading" }, AUTH_EVENTS.loading);
      try {
        const sdkClient = await withTimeout(loadClient(), timeoutMs, "Authentication");
        const { data } = sdkClient.auth.onAuthStateChange((event, session) => {
          if (event === "INITIAL_SESSION") {
            update({ status: "ready", reason: "", expired: false, ...describe(session) }, AUTH_EVENTS.ready);
            return;
          }
          if (event === "TOKEN_REFRESHED" && session) {
            update({ ...describe(session) }, AUTH_EVENTS.status);
            return;
          }
          if (event === "USER_UPDATED" && session) {
            update({ ...describe(session) }, AUTH_EVENTS.status);
            return;
          }
          handleSessionEvent(event, session);
        });
        subscription = data?.subscription || null;
        // Restore explicitly as well: a restored session may arrive before the
        // subscription is registered on some browsers.
        const { data: restored } = await withTimeout(sdkClient.auth.getSession(), timeoutMs, "Session restore");
        update({ status: "ready", reason: "", expired: false, ...describe(restored?.session) }, AUTH_EVENTS.ready);
      } catch (error) {
        const line = classifyAuthError(error);
        // Keep the underlying detail: a dashboard saying "could not start" with
        // no reason is impossible to support.
        console.warn("Authentication could not start:", error?.message || error);
        update(
          {
            status: "error",
            reason:
              error?.message === "auth-not-configured"
                ? config.reason
                : line.code === "network"
                  ? "The authentication service could not be reached. Guest mode still works."
                  : "Authentication could not start. Guest mode still works.",
            error: line,
            detail: String(error?.message || error || "").slice(0, 300),
          },
          AUTH_EVENTS.error,
        );
      }
      return state;
    },

    async signUp({ email, password }) {
      const sdkClient = await loadClient();
      const { data, error } = await sdkClient.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectUrl(VERIFY_PATH) },
      });
      if (error) throw error;
      return {
        user: data.user,
        // With email confirmation enabled no session is returned until the
        // student confirms the address.
        needsConfirmation: !data.session,
      };
    },

    async signIn({ email, password }) {
      const sdkClient = await loadClient();
      const { data, error } = await sdkClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      update({ ...describe(data.session), expired: false }, AUTH_EVENTS.session);
      return data.session;
    },

    async signOut({ scope = "local" } = {}) {
      if (!client) return;
      const { error } = await client.auth.signOut({ scope });
      if (error) throw error;
    },

    async requestPasswordReset(email) {
      const sdkClient = await loadClient();
      const { error } = await sdkClient.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl(RESET_PATH),
      });
      if (error) throw error;
    },

    /** Complete a recovery link: the SDK restored the session from the URL. */
    async updatePassword(password) {
      const sdkClient = await loadClient();
      const { data, error } = await sdkClient.auth.updateUser({ password });
      if (error) throw error;
      return data.user;
    },

    async resendConfirmation(email) {
      const sdkClient = await loadClient();
      const { error } = await sdkClient.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectUrl(VERIFY_PATH) } });
      if (error) throw error;
    },

    async refresh() {
      if (!client) return null;
      const { data, error } = await client.auth.refreshSession();
      if (error) throw error;
      update({ ...describe(data.session), expired: false }, AUTH_EVENTS.status);
      return data.session;
    },

    millisecondsUntilExpiry() {
      const expiresAt = state.session?.expires_at;
      return expiresAt ? Math.max(0, expiresAt * 1000 - now()) : null;
    },

    /** The initialised data client, or null before init. */
    client() {
      return client;
    },

    destroy() {
      subscription?.unsubscribe?.();
      subscription = null;
      listeners.clear();
    },
  };
  return controller;
}

export function IMPORT_WITH_INTEGRITY(url, integrity) {
  // A dynamic import of the URL keeps the SDK's own relative imports working.
  // Bundled builds cannot be re-imported from a blob, so the integrity check
  // is a native module load of the same URL: the browser refuses the request
  // when the bytes do not match `integrity`.
  if (integrity && typeof document !== "undefined") {
    const existing = document.querySelector('link[data-supabase-sdk]');
    if (!existing) {
      const link = document.createElement("link");
      link.rel = "modulepreload";
      link.href = url;
      link.integrity = integrity;
      link.crossOrigin = "anonymous";
      link.dataset.supabaseSdk = "pinned";
      document.head.append(link);
    }
  }
  return import(url);
}
