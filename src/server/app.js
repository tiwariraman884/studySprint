import { handleAPI } from "./api/compiler.js";
import { handlePacks } from "./api/packs.js";
import { authPage, clientConfigScript } from "./env.js";

const SECURITY_HEADERS = {
  "cache-control": "no-cache",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "SAMEORIGIN",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

/**
 * Serve the app. `env` may hold PUBLIC Supabase values (injected into the page)
 * and the importer's server-only values (never injected). Assets are static;
 * every HTTP method rule and the auth callback routes live here.
 */
export function createWorker(assets) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) {
        const packs = await handlePacks(request, env, url);
        if (packs) return packs;
        return handleAPI(request, env);
      }

      // Auth callbacks are HTML routes, not files. They render a short page and
      // hand the student back to the app; the SDK completes the exchange.
      if (url.pathname === "/auth/callback" || url.pathname === "/auth/reset") {
        if (!["GET", "HEAD"].includes(request.method))
          return new Response("Method not allowed", { status: 405, headers: SECURITY_HEADERS });
        const isReset = url.pathname === "/auth/reset";
        const body = isReset
          ? authPage({
            title: "Set a new password",
            message: "Your recovery link is being checked. You’ll be taken to Study Sprint to choose a new password.",
            status: "recovery",
            next: "/?auth=recovery",
          })
          : authPage({
            title: "Email confirmed",
            message: "Thanks for confirming your address. Taking you back to Study Sprint…",
            status: "verified",
            next: "/",
          });
        return new Response(request.method === "HEAD" ? null : body, {
          headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8" },
        });
      }

      if (!["GET", "HEAD"].includes(request.method))
        return new Response("Method not allowed", { status: 405, headers: SECURITY_HEADERS });
      const asset = assets[url.pathname === "/" ? "/index.html" : url.pathname];
      if (!asset) return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });

      // Inject only client-safe configuration. A server secret is never read
      // here, so it cannot leak into the page.
      let body = asset.body;
      if (url.pathname === "/" || url.pathname === "/index.html") {
        const marker = "<!--study-sprint-config-->";
        if (body.includes(marker)) body = body.replace(marker, clientConfigScript(env || {}));
      }
      return new Response(request.method === "HEAD" ? null : body, {
        headers: { ...SECURITY_HEADERS, "content-type": asset.type + "; charset=utf-8" },
      });
    },
  };
}
