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

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { mergedProjectEnv } from "./env-file.mjs";
import { syntheticPassword } from "../e2e/support/accounts.mjs";
import { seedSyntheticWorld } from "../e2e/support/seed-world.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const password = syntheticPassword(mergedProjectEnv(projectRoot));

function localStatus() {
  let status;
  try {
    status = JSON.parse(
      execFileSync("supabase", ["status", "-o", "json"], {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    throw new Error("Local Supabase is not running. Start it with `supabase start` first.");
  }
  const apiUrl = new URL(status.API_URL);
  if (!["localhost", "127.0.0.1", "::1"].includes(apiUrl.hostname)) {
    throw new Error("Refusing to seed E2E fixtures outside the local Supabase stack.");
  }
  if (!status.SERVICE_ROLE_KEY) throw new Error("Local Supabase did not report a service-role key.");
  return status;
}

const status = localStatus();
const supabase = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

await seedSyntheticWorld({ client: supabase, password, log: console.log });
