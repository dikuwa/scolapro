// Shared local Supabase discovery for the E2E tooling.
//
// The seed, the idempotency verifier and any local QA helper must agree on what
// "the local stack" is, and must refuse anything that is not loopback. This is a
// plain-JavaScript module so `node --test` and the scripts can share it.

import { execFileSync } from "node:child_process";

export const LOOPBACK_HOSTS = Object.freeze(["localhost", "127.0.0.1", "::1"]);

/**
 * Returns the running local Supabase stack status, or throws. Refuses any
 * non-loopback API URL so it can never describe a hosted project.
 *
 * @param {object} options
 * @param {string} options.projectRoot
 * @param {typeof execFileSync} [options.execImpl]
 */
export function localSupabaseStatus({ projectRoot, execImpl = execFileSync }) {
  let status;
  try {
    status = JSON.parse(
      execImpl("supabase", ["status", "-o", "json"], {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    throw new Error("Local Supabase is not running. Start it with `supabase start` first.");
  }
  const apiUrl = new URL(status.API_URL);
  if (!LOOPBACK_HOSTS.includes(apiUrl.hostname)) {
    throw new Error("Refusing to use a non-loopback Supabase stack for local E2E fixtures.");
  }
  if (!status.SERVICE_ROLE_KEY) {
    throw new Error("Local Supabase did not report a service-role key.");
  }
  return status;
}
