// Fail-closed identity guard for the hosted-staging synthetic seed and baseline.
//
// The local seed (`scripts/seed-e2e-fixtures.mjs`) can only ever reach the local
// Supabase stack. A hosted staging seed must additionally prove it is pointed at
// an isolated, non-production project before it opens a client or issues any
// request — because it writes rows and runs baseline SQL.
//
// This module is intentionally dependency-free plain JavaScript so it can be unit
// tested with `node --test`. It reuses the production-host and project-ref rules
// from `e2e/support/env-guard.mjs` (which is not modified) so the two guards can
// never disagree about what "production" means.
//
// The guard is split into three resolvers so a caller only ever receives the
// credential it actually needs:
//   - `resolveStagingSeedIdentity` — refs/hosts/flags only; reads NO secret and
//     makes NO network call. Used by the `--check` preflight.
//   - `resolveStagingSeedTarget` — identity + the staging service-role key, for
//     PostgREST (supabase-js) writes.
//   - `resolveStagingManagementTarget` — identity + the Supabase access token,
//     for Management-API baseline SQL.
//
// Every resolver refuses, before any network/write, when:
//   - `SCOLAPRO_E2E_SYNTHETIC_ONLY` is not exactly "1";
//   - the declared staging ref is missing, malformed, or the production ref;
//   - `STAGING_PROJECT_ID` and `SCOLAPRO_E2E_SUPABASE_PROJECT_REF` disagree;
//   - the staging URL is missing, not a hosted Supabase URL, a production host,
//     or its project ref differs from the declared ref (ambiguous identity);
//   - the app's own Supabase URL points at the production project.

import {
  PRODUCTION_PROJECT_REF,
  isProductionHost,
  supabaseProjectRefFromUrl,
} from "./env-guard.mjs";

/** Raised when the requested staging seed target could reach production. */
export class StagingSeedError extends Error {
  constructor(message) {
    super(message);
    this.name = "StagingSeedError";
  }
}

/** Hosted Supabase project refs are exactly 20 lowercase alphanumeric characters. */
const REF_PATTERN = /^[a-z0-9]{20}$/;

function read(env, key) {
  return String(env?.[key] ?? "").trim();
}

/**
 * Extracts the `ref` claim from a legacy Supabase JWT key, or null when the key
 * is opaque (e.g. the newer `sb_secret_...` / `sb_publishable_...` format) or
 * malformed. Opaque keys cannot be identity-checked here and are therefore
 * accepted only when the URL/declared refs already agree.
 */
export function supabaseRefFromKey(key) {
  const parts = String(key ?? "").split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload?.ref === "string" && payload.ref ? payload.ref : null;
  } catch {
    return null;
  }
}

/**
 * Resolves and validates the hosted-staging identity from non-secret environment
 * only. Reads no secret and makes no network call. Returns
 * `{ target, production, projectRef, apiUrl, host }`.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function resolveStagingSeedIdentity(env = process.env) {
  if (read(env, "SCOLAPRO_E2E_SYNTHETIC_ONLY") !== "1") {
    throw new StagingSeedError(
      "set SCOLAPRO_E2E_SYNTHETIC_ONLY=1 to confirm that only synthetic accounts and learners are in scope",
    );
  }

  const declaredRef = read(env, "SCOLAPRO_E2E_SUPABASE_PROJECT_REF");
  if (!REF_PATTERN.test(declaredRef)) {
    throw new StagingSeedError(
      "SCOLAPRO_E2E_SUPABASE_PROJECT_REF must be the 20-character staging project ref " +
        `(missing or ambiguous: "${declaredRef || "(unset)"}")`,
    );
  }
  if (declaredRef === PRODUCTION_PROJECT_REF) {
    throw new StagingSeedError(
      `the declared staging ref "${declaredRef}" is the production project`,
    );
  }

  const workflowRef = read(env, "STAGING_PROJECT_ID");
  if (workflowRef && workflowRef !== declaredRef) {
    throw new StagingSeedError(
      `STAGING_PROJECT_ID "${workflowRef}" and SCOLAPRO_E2E_SUPABASE_PROJECT_REF ` +
        `"${declaredRef}" disagree (ambiguous identity)`,
    );
  }

  const apiUrlRaw = read(env, "STAGING_SUPABASE_URL");
  let apiUrl;
  try {
    apiUrl = new URL(apiUrlRaw);
  } catch {
    throw new StagingSeedError("STAGING_SUPABASE_URL is missing or not a valid URL");
  }
  const host = apiUrl.hostname.toLowerCase();
  if (isProductionHost(host)) {
    throw new StagingSeedError(`STAGING_SUPABASE_URL host "${host}" is a production host`);
  }
  const urlRef = supabaseProjectRefFromUrl(apiUrlRaw);
  if (!urlRef) {
    throw new StagingSeedError("STAGING_SUPABASE_URL is not a hosted Supabase project URL");
  }
  if (urlRef !== declaredRef) {
    throw new StagingSeedError(
      `STAGING_SUPABASE_URL ref "${urlRef}" does not match the declared ref ` +
        `"${declaredRef}" (ambiguous identity)`,
    );
  }

  const appUrl = read(env, "NEXT_PUBLIC_SUPABASE_URL");
  if (appUrl && supabaseProjectRefFromUrl(appUrl) === PRODUCTION_PROJECT_REF) {
    throw new StagingSeedError(
      "NEXT_PUBLIC_SUPABASE_URL points at the production project (production configuration)",
    );
  }

  return { target: "staging", production: false, projectRef: declaredRef, apiUrl: apiUrl.origin, host };
}

/**
 * Resolves the identity plus the staging service-role key used for PostgREST
 * (supabase-js) writes. Returns `{ ...identity, serviceRoleKey }`.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function resolveStagingSeedTarget(env = process.env) {
  const identity = resolveStagingSeedIdentity(env);

  const serviceRoleKey = read(env, "STAGING_SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    throw new StagingSeedError("STAGING_SUPABASE_SERVICE_ROLE_KEY is required");
  }
  const productionAdminKey = read(env, "SUPABASE_SERVICE_ROLE_KEY");
  if (productionAdminKey && serviceRoleKey === productionAdminKey) {
    throw new StagingSeedError(
      "the staging key is identical to the production SUPABASE_SERVICE_ROLE_KEY (production credentials)",
    );
  }
  const productionPublishableKey = read(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (productionPublishableKey && serviceRoleKey === productionPublishableKey) {
    throw new StagingSeedError(
      "the staging key is the production publishable key (production credentials)",
    );
  }
  const keyRef = supabaseRefFromKey(serviceRoleKey);
  if (keyRef && keyRef !== identity.projectRef) {
    throw new StagingSeedError(
      `the staging key belongs to project ref "${keyRef}", not the declared staging ref ` +
        `"${identity.projectRef}" (ambiguous identity)`,
    );
  }

  return { ...identity, serviceRoleKey };
}

/**
 * Resolves the identity plus the Supabase access token used for Management-API
 * baseline SQL. Returns `{ ...identity, accessToken }`.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function resolveStagingManagementTarget(env = process.env) {
  const identity = resolveStagingSeedIdentity(env);

  const accessToken = read(env, "SUPABASE_ACCESS_TOKEN");
  if (!accessToken) {
    throw new StagingSeedError("SUPABASE_ACCESS_TOKEN is required to apply baseline SQL");
  }

  return { ...identity, accessToken };
}

/** Returns the reason a candidate staging environment is unsafe, or null when safe. */
export function stagingSeedRejection(env = process.env) {
  try {
    resolveStagingSeedIdentity(env);
    return null;
  } catch (error) {
    return error instanceof StagingSeedError ? error.message : String(error);
  }
}
