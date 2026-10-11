// Orchestrates an authenticated E2E run: guard -> synthetic seed -> Playwright.
//
// The guard resolves the target from `.env`/`.env.local` plus the process env
// and refuses to continue if the run could touch production. Only after the
// guard passes does the script seed synthetic fixtures and launch Playwright.
//
// Usage: node scripts/e2e-run.mjs [playwright args...]

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergedProjectEnv } from "./env-file.mjs";
import { resolveE2EEnvironment, E2EEnvironmentError } from "../e2e/support/env-guard.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = mergedProjectEnv(projectRoot);

let resolved;
try {
  resolved = resolveE2EEnvironment(env);
} catch (error) {
  if (error instanceof E2EEnvironmentError) {
    console.error(`\n[e2e] REFUSED: ${error.message}\n`);
  } else {
    console.error(`\n[e2e] FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  process.exit(1);
}

console.log(
  `[e2e] target=${resolved.target} baseURL=${resolved.baseUrl} ` +
    `supabaseRef=${resolved.supabaseProjectRef ?? "(local)"}`,
);

if (!env.SCOLAPRO_E2E_PASSWORD || String(env.SCOLAPRO_E2E_PASSWORD).length < 12) {
  console.error("[e2e] Set SCOLAPRO_E2E_PASSWORD to at least 12 characters before running the E2E suite.");
  process.exit(1);
}

const childEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  SCOLAPRO_E2E_SUPABASE_PROJECT_REF: resolved.supabaseProjectRef ?? "",
  SCOLAPRO_E2E_PASSWORD: env.SCOLAPRO_E2E_PASSWORD,
};

if (process.env.SCOLAPRO_E2E_SKIP_SEED !== "1") {
  const seed = spawnSync(process.execPath, [path.join(projectRoot, "scripts/seed-e2e-fixtures.mjs")], {
    cwd: projectRoot,
    env: childEnv,
    stdio: "inherit",
  });
  if (seed.status !== 0) process.exit(seed.status ?? 1);
}

const run = spawnSync("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: childEnv,
  stdio: "inherit",
});
process.exit(run.status ?? 1);
