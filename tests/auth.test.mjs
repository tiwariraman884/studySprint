import test from "node:test";
import assert from "node:assert/strict";
import {
  createAuthController,
  classifyAuthError,
  describeAuthError,
  SDK_VERSION,
  SDK_INTEGRITY,
} from "../src/client/core/auth.js";

const CONFIG = {
  enabled: true,
  supabaseUrl: "https://project.supabase.co",
  supabaseAnonKey: "public-anon-key-value-1234567890",
  reason: "",
  siteName: "Study Sprint",
};

/**
 * A minimal fake SDK mirroring the parts of supabase-js this app uses. Events
 * are emitted explicitly so each test drives the lifecycle it wants.
 */
function fakeSdk({ session = null, expirySeconds = 3600, now = 1_760_000_000 } = {}) {
  const listeners = [];
  const calls = [];
  let current = session;
  const emit = (event, next = current) => {
    current = next;
    for (const cb of listeners) cb(event, next);
  };
  const client = {
    auth: {
      onAuthStateChange(cb) {
        listeners.push(cb);
        setTimeout(() => cb("INITIAL_SESSION", current), 0);
        return { data: { subscription: { unsubscribe: () => listeners.splice(listeners.indexOf(cb), 1) } } };
      },
      async getSession() {
        calls.push("getSession");
        return { data: { session: current }, error: null };
      },
      async signUp({ email, password, options }) {
        calls.push(["signUp", email, options.emailRedirectTo]);
        if (email === "taken@example.test")
          return { data: { user: null, session: null }, error: { message: "User already registered" } };
        if (password.length < 8)
          return { data: {}, error: { message: "Password should be at least 8 characters" } };
        return { data: { user: { id: "u1", email, email_confirmed_at: null }, session: null }, error: null };
      },
      async signInWithPassword({ email, password }) {
        calls.push(["signIn", email]);
        if (email === "expired@example.test")
          return { data: {}, error: { message: "Email not confirmed" } };
        if (password !== "correct-password")
          return { data: {}, error: { message: "Invalid login credentials", status: 400 } };
        const next = { user: { id: "u1", email, email_confirmed_at: "2026-01-01" }, expires_at: now + expirySeconds };
        emit("SIGNED_IN", next);
        return { data: { session: next, user: next.user }, error: null };
      },
      async signOut() {
        calls.push("signOut");
        emit("SIGNED_OUT", null);
        return { error: null };
      },
      async resetPasswordForEmail(email, opts) {
        calls.push(["reset", email, opts.redirectTo]);
        return { error: email === "unknown@example.test" ? { message: "User not found" } : null };
      },
      async updateUser({ password }) {
        calls.push(["updatePassword", password.length]);
        if (password.length < 8) return { data: {}, error: { message: "Password should be at least 8 characters" } };
        return { data: { user: { id: "u1" } }, error: null };
      },
      async resend({ email }) {
        calls.push(["resend", email]);
        return { error: null };
      },
      async refreshSession() {
        calls.push("refreshSession");
        if (!current) return { data: { session: null }, error: new Error("expired") };
        return { data: { session: current }, error: null };
      },
    },
  };
  return { lib: { createClient: () => client }, client, calls, emit };
}

function makeController(opts = {}) {
  const fake = fakeSdk(opts);
  const controller = createAuthController({
    config: opts.config || CONFIG,
    loadSdk: async () => fake.lib,
    now: () => (opts.now ?? 1_760_000_000) * 1000,
  });
  return { controller, fake };
}

test("missing configuration disables sign-in but never throws", async () => {
  const controller = createAuthController({
    config: { enabled: false, reason: "Cloud accounts are not configured.", supabaseUrl: "", supabaseAnonKey: "" },
    loadSdk: async () => {
      throw new Error("must not load");
    },
  });
  const state = await controller.init();
  assert.equal(state.status, "unavailable");
  assert.match(state.reason, /not configured/);
  const ok = controller.signIn({ email: "a@b.test", password: "x" });
  await assert.rejects(ok, (error) => error.code === "not-configured");
  assert.equal(controller.state.status, "unavailable");
});

test("an SDK download failure keeps the app usable as a guest", async () => {
  const controller = createAuthController({
    config: CONFIG,
    loadSdk: async () => {
      throw new Error("Failed to fetch");
    },
  });
  const state = await controller.init();
  assert.equal(state.status, "error");
  assert.match(state.reason, /Guest mode still works/);
  assert.equal(state.error.code, "network");
});

test("a restored session is picked up on load", async () => {
  const restored = { user: { id: "u1", email: "a@b.test", email_confirmed_at: "2026-01-01" }, expires_at: 1_760_000_000 + 3600 };
  const { controller } = makeController({ session: restored });
  const state = await controller.init();
  assert.equal(state.status, "ready");
  assert.equal(state.user.email, "a@b.test");
  assert.equal(state.emailVerified, true);
  assert.equal(controller.millisecondsUntilExpiry(), 3_600_000);
});

test("sign up reports that the email must be confirmed first", async () => {
  const { controller, fake } = makeController();
  await controller.init();
  const result = await controller.signUp({ email: "new@example.test", password: "longenough" });
  assert.equal(result.needsConfirmation, true);
  assert.match(fake.calls.find((c) => Array.isArray(c) && c[0] === "signUp")[2], /\/auth\/callback$/);
  await assert.rejects(() => controller.signUp({ email: "taken@example.test", password: "longenough" }));
  const line = classifyAuthError({ message: "User already registered" });
  assert.equal(line.code, "email-taken");
  assert.match(describeAuthError(line), /already uses this email/);
});

test("sign in, session events, sign out and expiry are all wired", async () => {
  const { controller, fake } = makeController();
  const events = [];
  controller.subscribe((_state, event) => events.push(event));
  await controller.init();
  await assert.rejects(() => controller.signIn({ email: "a@b.test", password: "wrong" }));
  const session = await controller.signIn({ email: "a@b.test", password: "correct-password" });
  assert.equal(session.user.id, "u1");
  assert.equal(controller.state.user.email, "a@b.test");
  await controller.signOut();
  assert.equal(controller.state.user, null);
  assert.equal(controller.state.expired, true, "a sign-out after a session is treated as expiry");
  assert.ok(events.includes("session"));
  assert.ok(events.includes("signedOut"));
  assert.deepEqual(fake.calls.filter((c) => c === "signOut"), ["signOut"]);
});

test("an unconfirmed email is explained, not shown as a wrong password", () => {
  const line = classifyAuthError({ message: "Email not confirmed" });
  assert.equal(line.code, "email-not-confirmed");
  assert.match(describeAuthError(line), /confirm the address/);
});

test("password recovery links point at the dedicated reset route", async () => {
  const { controller, fake } = makeController();
  await controller.init();
  await controller.requestPasswordReset("a@b.test");
  const call = fake.calls.find((c) => Array.isArray(c) && c[0] === "reset");
  assert.match(call[2], /\/auth\/reset$/);
  await controller.updatePassword("a-new-long-password");
  assert.ok(fake.calls.some((c) => Array.isArray(c) && c[0] === "updatePassword"));
});

test("the pinned SDK is a fixed version and carries an integrity hash", () => {
  assert.match(SDK_VERSION, /^\d+\.\d+\.\d+$/);
  assert.match(SDK_INTEGRITY, /^sha384-.{40,}$/);
});
