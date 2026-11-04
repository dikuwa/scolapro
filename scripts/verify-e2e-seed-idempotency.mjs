// Proves the local synthetic seed is idempotent against a real disposable stack.
//
// Seeds the world, digests it, seeds it again, digests it again, and fails if the
// digest changed. This runs in CI against the throwaway local Supabase stack, so
// it validates the actual database behaviour rather than a mock.
//
// Usage: node scripts/verify-e2e-seed-idempotency.mjs
// Requires: local `supabase start` with migrations + supabase/seed.sql applied,
// and SCOLAPRO_E2E_PASSWORD (>= 12 chars). Local-only; refuses non-loopback.

import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { mergedProjectEnv } from "./env-file.mjs";
import { syntheticPassword } from "../e2e/support/accounts.mjs";
import { localSupabaseStatus } from "../e2e/support/local-supabase.mjs";
import { WORLD_PROJECTION, digestWorld } from "../e2e/support/seed-digest.mjs";
import { seedSyntheticWorld } from "../e2e/support/seed-world.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = mergedProjectEnv(projectRoot);
const password = syntheticPassword(env);

const status = localSupabaseStatus({ projectRoot });
const client = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function snapshotDigest() {
  const rowsByTable = {};
  for (const [table, columns] of Object.entries(WORLD_PROJECTION)) {
    const { data, error } = await client.from(table).select(columns.join(","));
    if (error) throw new Error(`Unable to read ${table} for the idempotency digest: ${error.message}`);
    rowsByTable[table] = data ?? [];
  }
  return digestWorld(rowsByTable);
}

await seedSyntheticWorld({ client, password, log: () => {} });
const first = await snapshotDigest();

await seedSyntheticWorld({ client, password, log: () => {} });
const second = await snapshotDigest();

if (first !== second) {
  console.error(
    `[seed:idempotency] FAILED: the synthetic world changed on re-seed (${first.slice(0, 12)} -> ${second.slice(0, 12)}).`,
  );
  process.exit(1);
}

console.log(
  `[seed:idempotency] OK: synthetic world digest stable across two seeds (${first.slice(0, 12)}...).`,
);
