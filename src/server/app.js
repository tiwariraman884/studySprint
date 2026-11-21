import { handleAPI } from "./api/compiler.js";
export function createWorker(assets) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return handleAPI(request, env);
      if (!["GET", "HEAD"].includes(request.method))
        return new Response("Method not allowed", { status: 405 });
      const asset = assets[url.pathname === "/" ? "/index.html" : url.pathname];
      if (!asset) return new Response("Not found", { status: 404 });
      return new Response(request.method === "HEAD" ? null : asset.body, {
        headers: {
          "content-type": asset.type + "; charset=utf-8",
          "cache-control": "no-cache",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
        },
      });
    },
  };
}
