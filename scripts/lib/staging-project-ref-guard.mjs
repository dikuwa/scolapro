// Fail-closed project-ref gate for the hosted staging database workflow.
//
// `.github/workflows/staging-database.yml` runs privileged, destructive Supabase
// CLI commands (`link`, `migration repair`, `migration list`, `db push`) against a
// linked project. Every one of those commands is refused unless the target ref is
// first proven to be an isolated, non-production, **explicitly approved** staging
// project.
//
// This module is intentionally dependency-free plain JavaScript so it can be unit
// tested with `node --test` and executed as a bare Node script inside CI without
// installing the project toolchain. It imports only the production project ref
// from `e2e/support/env-guard.mjs` (unmodified, on `main`) so the workflow gate and
// the authenticated-E2E guard can never disagree about what "production" means.
//
// The gate reads exactly two non-secret inputs and nothing else:
//   - `STAGING_PROJECT_ID` — the candidate ref the workflow would link;
//   - `SCOLAPRO_E2E_APPROVED_STAGING_REFS` — an independently administered GitHub
//     Actions repository/environment variable listing the approved staging refs.
//
// It deliberately never reads `SUPABASE_ACCESS_TOKEN`, `STAGING_DB_PASSWORD` or any
// service-role key: the project-ID decision must not depend on credentials.
//
// It refuses, before any Supabase CLI command runs, when:
//   - `STAGING_PROJECT_ID` is missing;
//   - `STAGING_PROJECT_ID` is malformed (not a 20-char lowercase project ref);
//   - `STAGING_PROJECT_ID` is the documented production project;
//   - the approval allowlist is missing/empty;
//   - the approval allowlist contains a malformed entry;
//   - the approval allowlist contains the production project;
//   - `STAGING_PROJECT_ID` is not exactly a member of the approval allowlist
//     (mismatched / not explicitly approved).

import { PRODUCTION_PROJECT_REF } from "../../e2e/support/env-guard.mjs";

/** Hosted Supabase project refs are exactly 20 lowercase alphanumeric characters. */
export const STAGING_REF_PATTERN = /^[a-z0-9]{20}$/;

/** Env var holding the candidate ref the workflow would link. */
export const STAGING_PROJECT_ID_ENV = "STAGING_PROJECT_ID";

/** Env var holding the independently administered approval allowlist. */
export const APPROVED_REFS_ENV = "SCOLAPRO_E2E_APPROVED_STAGING_REFS";

/** Re-exported so tests and callers share one production-ref source of truth. */
export { PRODUCTION_PROJECT_REF };

/**
 * Splits the approval allowlist into well-formed refs and malformed entries.
 * Entries may be separated by commas, whitespace or newlines.
 *
 * @param {string | undefined | null} raw
 * @returns {{ refs: string[], malformed: string[] }}
 */
export function parseApprovedStagingRefs(raw) {
  const entries = String(raw ?? "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const refs = [];
  const malformed = [];
  for (const entry of entries) {
    if (STAGING_REF_PATTERN.test(entry)) refs.push(entry);
    else malformed.push(entry);
  }
  return { refs, malformed };
}

/** Builds a denial result. Messages are sanitized: no tokens, only the candidate ref. */
function deny(code, message) {
  return { ok: false, code, message };
}

/**
 * Evaluates whether the workflow may link the candidate staging project.
 *
 * @param {object} [input]
 * @param {string | undefined | null} [input.stagingProjectId]
 * @param {string | undefined | null} [input.approvedRefsRaw]
 * @param {string} [input.productionProjectRef]
 * @returns {{ ok: boolean, code: string, message: string }}
 */
export function evaluateStagingProjectRef({
  stagingProjectId,
  approvedRefsRaw,
  productionProjectRef = PRODUCTION_PROJECT_REF,
} = {}) {
  const candidate = String(stagingProjectId ?? "").trim();

  if (!candidate) {
    return deny(
      "missing-project-id",
      `${STAGING_PROJECT_ID_ENV} is required and must be the 20-character staging project ref.`,
    );
  }

  if (!STAGING_REF_PATTERN.test(candidate)) {
    return deny(
      "malformed-project-id",
      `${STAGING_PROJECT_ID_ENV} "${candidate}" is not a valid 20-character project ref.`,
    );
  }

  if (candidate === productionProjectRef) {
    return deny(
      "production-project-id",
      `${STAGING_PROJECT_ID_ENV} "${candidate}" is the production project (${productionProjectRef}).`,
    );
  }

  const { refs, malformed } = parseApprovedStagingRefs(approvedRefsRaw);

  if (malformed.length > 0) {
    return deny(
      "malformed-allowlist",
      `${APPROVED_REFS_ENV} contains ${malformed.length} malformed entr${
        malformed.length === 1 ? "y" : "ies"
      }; expected only 20-character project refs.`,
    );
  }

  if (refs.length === 0) {
    return deny(
      "missing-allowlist",
      `${APPROVED_REFS_ENV} must list the explicitly approved staging ref(s) (empty or unset).`,
    );
  }

  if (refs.includes(productionProjectRef)) {
    return deny(
      "allowlist-contains-production",
      `${APPROVED_REFS_ENV} lists the production project (${productionProjectRef}); refusing.`,
    );
  }

  if (!refs.includes(candidate)) {
    return deny(
      "unapproved-project-id",
      `${STAGING_PROJECT_ID_ENV} "${candidate}" is not on the approved staging allowlist (${APPROVED_REFS_ENV}).`,
    );
  }

  return {
    ok: true,
    code: "approved",
    message: `${candidate} is an explicitly approved staging project.`,
  };
}

/** Returns the reason a candidate staging ref is unsafe, or null when approved. */
export function stagingProjectRefRejection(input) {
  const result = evaluateStagingProjectRef(input);
  return result.ok ? null : result.message;
}
