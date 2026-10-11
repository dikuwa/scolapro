// Fail-closed guard CLI.
//
// Exits non-zero when the current E2E environment could reach production. Used
// by CI as a cheap pre-flight check and by developers before a run.
//
// Usage: node scripts/e2e-guard.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergedProjectEnv } from "./env-file.mjs";
import { resolveE2EEnvironment, E2EEnvironmentError } from "../e2e/support/env-guard.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  const resolved = resolveE2EEnvironment(mergedProjectEnv(projectRoot));
  console.log(
    `[e2e-guard] OK target=${resolved.target} baseURL=${resolved.baseUrl} ` +
      `supabaseRef=${resolved.supabaseProjectRef ?? "(local)"}`,
  );
  process.exit(0);
} catch (error) {
  if (error instanceof E2EEnvironmentError) {
    console.error(`[e2e-guard] REFUSED: ${error.message}`);
  } else {
    console.error(`[e2e-guard] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exit(1);
}
