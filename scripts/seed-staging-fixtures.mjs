// Seeds the synthetic E2E world into an ISOLATED hosted staging Supabase project.
//
// Unlike the local seed, this runs against a hosted project and therefore opens
// a service-role client and may apply baseline SQL. It is fail-closed:
// `e2e/support/staging-seed-guard.mjs` must prove the target is an isolated,
// non-production, synthetic-only project before any client is created or any
// request is issued. It never touches production and never runs `supabase db reset`.
//
// Modes:
//   --check            Validate the non-secret environment and the baseline
//                      fixture locally. Reads NO secret and makes NO connection.
//   --verify-baseline  Read-only online preflight: connect and confirm the schema
//                      (migrations) and the demo baseline exist. Writes nothing.
//   --bootstrap        Apply the deterministic baseline SQL, then seed the world.
//   (default)          Guard -> schema preflight -> seed the world.
//
// Required environment (see e2e/support/staging-seed-guard.mjs):
//   SCOLAPRO_E2E_SYNTHETIC_ONLY=1
//   SCOLAPRO_E2E_SUPABASE_PROJECT_REF=<isolated staging ref>
//   STAGING_SUPABASE_URL=https://<isolated staging ref>.supabase.co
//   STAGING_SUPABASE_SERVICE_ROLE_KEY=<staging secret key>   (online modes)
//   SUPABASE_ACCESS_TOKEN=<management token>                 (--bootstrap only)
//   SCOLAPRO_E2E_PASSWORD=<>= 12 chars, staging-only>        (write modes)

import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergedProjectEnv } from "./env-file.mjs";
import { syntheticPassword } from "../e2e/support/accounts.mjs";
import {
  StagingSeedError,
  resolveStagingSeedIdentity,
  resolveStagingSeedTarget,
} from "../e2e/support/staging-seed-guard.mjs";
import {
  assertBaselinePresent,
  assertSchemaReady,
  buildBaselineSql,
  runStagingBaselineBootstrap,
} from "../e2e/support/staging-baseline.mjs";
import { seedSyntheticWorld } from "../e2e/support/seed-world.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = mergedProjectEnv(projectRoot);
const flags = new Set(process.argv.slice(2));

function fail(error) {
  const label = error instanceof StagingSeedError ? "REFUSED" : "FAILED";
  console.error(`\n[seed:staging] ${label}: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

// --check: non-secret local prerequisites only. No secret read, no connection.
if (flags.has("--check")) {
  try {
    const identity = resolveStagingSeedIdentity(env);
    const sql = buildBaselineSql();
    if (!sql.includes("on conflict (id) do nothing")) {
      throw new StagingSeedError("baseline fixture is not idempotent");
    }
    console.log(
      `[seed:staging] --check OK projectRef=${identity.projectRef} url=${identity.apiUrl} (synthetic-only)`,
    );
    console.log(
      `[seed:staging] --check: baseline fixture ready (${sql.length} bytes); no secrets read, no connection made.`,
    );
    process.exit(0);
  } catch (error) {
    fail(error);
  }
}

const verifyBaselineOnly = flags.has("--verify-baseline");
const bootstrap = flags.has("--bootstrap");

let target;
let password;
try {
  target = resolveStagingSeedTarget(env);
  password = syntheticPassword(env);
} catch (error) {
  fail(error);
}

console.log(
  `[seed:staging] target=staging projectRef=${target.projectRef} url=${target.apiUrl} (synthetic-only)`,
);

// Loaded lazily so the --check preflight stays dependency-free.
const { createClient } = await import("@supabase/supabase-js");
const client = createClient(target.apiUrl, target.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

try {
  // Migration preflight: refuse with an explicit error if the schema is absent.
  await assertSchemaReady(client);

  if (bootstrap) {
    await runStagingBaselineBootstrap({ env, log: console.log });
  }

  if (verifyBaselineOnly) {
    await assertBaselinePresent(client);
    console.log("[seed:staging] --verify-baseline: schema and demo baseline are present.");
    process.exit(0);
  }

  await assertBaselinePresent(client);
  await seedSyntheticWorld({ client, password, log: console.log });
} catch (error) {
  fail(error);
}
