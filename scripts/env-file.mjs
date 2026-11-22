// Minimal, dependency-free .env.local loader for the development server.
//
// The hosted Worker receives real environment variables. Locally, a developer
// expects to put values in `.env.local`, so the dev server reads that file.
// Rules: the file is optional, git-ignored, never served, and a value already
// present in the real environment always wins (so CI and hosting are unchanged).

import fs from "node:fs";
import path from "node:path";

/** Parse KEY=VALUE lines. Quotes are stripped, comments and blanks ignored. */
export function parseEnv(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    out[match[1]] = value;
  }
  return out;
}

/**
 * Merge a dotenv file into an environment object without overriding values that
 * already exist. Returns the list of keys that came from the file.
 */
export function loadEnvFile(root, { filename = ".env.local", env = process.env } = {}) {
  const file = path.join(root, filename);
  if (!fs.existsSync(file)) return [];
  const parsed = parseEnv(fs.readFileSync(file, "utf8"));
  const applied = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] !== undefined && env[key] !== "") continue;
    env[key] = value;
    applied.push(key);
  }
  return applied;
}
