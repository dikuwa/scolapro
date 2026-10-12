// Seeds the synthetic E2E world into an ISOLATED hosted staging Supabase project.
//
// Unlike the local seed, this runs against a hosted project and therefore opens
// a service-role client. It is fail-closed: `e2e/support/staging-seed-guard.mjs`
// must prove the target is an isolated, non-production, synthetic-only project
// before any client is created. It never touches production.
//
// Usage:
//   node scripts/seed-staging-fixtures.mjs --check   # validate the environment only; no connection
//   node scripts/seed-staging-fixtures.mjs           # guard -> connect -> seed (idempotent)
//
// Required environment (see e2e/support/staging-seed-guard.mjs):
//   SCOLAPRO_E2E_SYNTHETIC_ONLY=1
//   SCOLAPRO_E2E_SUPABASE_PROJECT_REF=<isolated staging ref>
//   STAGING_SUPABASE_URL=https://<isolated staging ref>.supabase.co
//   STAGING_SUPABASE_SERVICE_ROLE_KEY=<staging secret key>
//   SCOLAPRO_E2E_PASSWORD=<>= 12 chars, staging-only>

import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergedProjectEnv } from "./env-file.mjs";
import { syntheticPassword } from "../e2e/support/accounts.mjs";
import { resolveStagingSeedTarget, StagingSeedError } from "../e2e/support/staging-seed-guard.mjs";
import { seedSyntheticWorld } from "../e2e/support/seed-world.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = mergedProjectEnv(projectRoot);
const checkOnly = process.argv.includes("--check");

let target;
let password;
try {
  target = resolveStagingSeedTarget(env);
  password = syntheticPassword(env);
} catch (error) {
  const label = error instanceof StagingSeedError ? "REFUSED" : "FAILED";
  console.error(`\n[seed:staging] ${label}: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

console.log(
  `[seed:staging] target=staging projectRef=${target.projectRef} url=${target.apiUrl} (synthetic-only)`,
);

if (checkOnly) {
  console.log("[seed:staging] --check: environment is safe; no connection made.");
  process.exit(0);
}

// Loaded lazily so the `--check` preflight stays dependency-free and never
// imports a network client it does not use.
const { createClient } = await import("@supabase/supabase-js");
const client = createClient(target.apiUrl, target.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

await seedSyntheticWorld({ client, password, log: console.log });
