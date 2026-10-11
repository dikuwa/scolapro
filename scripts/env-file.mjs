// Minimal .env file loader shared by the E2E tooling.
//
// Next.js loads `.env`/`.env.local` for the app, but the guard, runner and seed
// scripts run as plain Node processes. This keeps the three of them reading the
// same files the same way, without adding a dependency.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Parses a single dotenv-style file into a plain object (missing file -> {}). */
export function loadEnvFile(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Loads `.env` then `.env.local` for a project root (later files win). */
export function loadProjectEnv(projectRoot) {
  return {
    ...loadEnvFile(path.join(projectRoot, ".env")),
    ...loadEnvFile(path.join(projectRoot, ".env.local")),
  };
}

/** Project env files merged beneath the real process env (process env wins). */
export function mergedProjectEnv(projectRoot) {
  return { ...loadProjectEnv(projectRoot), ...process.env };
}
