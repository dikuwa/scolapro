// Seeds the synthetic world used by the authenticated E2E suite.
//
// This script only ever writes to the LOCAL Supabase stack. It refuses to run
// against any non-loopback API URL, so it can never touch production learner
// data. It is idempotent: running it twice leaves the same synthetic world.
//
// The world itself is defined once in `e2e/support/seed-world.mjs` and shared
// with the hosted-staging seed, so the two environments cannot drift apart.
//
// Usage: node scripts/seed-e2e-fixtures.mjs
// Requires: local `supabase start`, supabase/seed.sql applied (pnpm local:sync-db
// or a fresh `supabase db reset`), and SCOLAPRO_E2E_PASSWORD (>= 12 chars).

import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { mergedProjectEnv } from "./env-file.mjs";
import { syntheticPassword } from "../e2e/support/accounts.mjs";
import { localSupabaseStatus } from "../e2e/support/local-supabase.mjs";
import { seedSyntheticWorld } from "../e2e/support/seed-world.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const password = syntheticPassword(mergedProjectEnv(projectRoot));

const status = localSupabaseStatus({ projectRoot });
const supabase = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

await seedSyntheticWorld({ client: supabase, password, log: console.log });
