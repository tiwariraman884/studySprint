import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { root, collectAssets } from "./assets.mjs";
import { createWorker } from "../src/server/app.js";
import { validateEnvironment, clientAuthConfig } from "../src/server/env.js";
const arg = (key, fallback) => {
  const i = process.argv.indexOf(key);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const host = arg("--host", process.env.HOST || "127.0.0.1");
const port = Number(arg("--port", process.env.PORT || 3000));
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error("PORT must be between 1 and 65535.");
// Server configuration comes from the environment (see .env.example). Only the
// publishable values are injected into pages; server-only values stay here.
const serverEnv = { ...process.env, SITE_URL: process.env.SITE_URL || `http://${host}:${port}` };
const envCheck = validateEnvironment(serverEnv);
if (!envCheck.ok) throw Error(envCheck.error);
console.log(
  clientAuthConfig(serverEnv).enabled
    ? "Cloud accounts: configured (client-safe values injected)."
    : "Cloud accounts: not configured — guest mode only. See docs/AUTHENTICATION.md.",
);
let worker = createWorker(await collectAssets()),
  dirty = false;
const watchers = ["public", "src/client", "src/content"].map((folder) =>
  fs.watch(path.join(root, folder), { recursive: true }, () => {
    dirty = true;
  }),
);
const server = http.createServer(async (req, res) => {
  try {
    if (dirty) {
      worker = createWorker(await collectAssets());
      dirty = false;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 12 * 1024 * 1024) {
        res.writeHead(413);
        res.end("Too large");
        return;
      }
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers))
      if (value && !key.startsWith("oai-authenticated-"))
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    const request = new Request(
      new URL(req.url, `http://${req.headers.host}`),
      {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method)
          ? undefined
          : Buffer.concat(chunks),
      },
    );
    const response = await worker.fetch(request, serverEnv);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error("Request failed:", error.message);
    res.writeHead(500);
    res.end("Development server error");
  }
});
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
  for (const watcher of watchers) watcher.close();
});
server.listen(port, host, () =>
  console.log(`Study Sprint running at http://${host}:${port}`),
);
function stop() {
  for (const watcher of watchers) watcher.close();
  server.close();
}
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
