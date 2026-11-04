# Staging database deploy gate

`.github/workflows/staging-database.yml` runs privileged, destructive Supabase CLI
commands against a linked project (`supabase link`, `supabase migration repair`,
`supabase migration list`, `supabase db push`). This document describes the
fail-closed gate that must pass **before any of those commands run**, and the
governance items that remain open.

## Enforced boundary

The first substantive step of the `deploy` job — before the Supabase CLI is
installed — runs:

```
node scripts/validate-staging-project-ref.mjs
```

The validator (`scripts/lib/staging-project-ref-guard.mjs`) is dependency-free and
reads exactly two non-secret inputs:

| Input | Source | Purpose |
| --- | --- | --- |
| `STAGING_PROJECT_ID` | GitHub Actions secret | Candidate ref the workflow would link. |
| `SCOLAPRO_E2E_APPROVED_STAGING_REFS` | GitHub Actions **repository variable** (`vars.`) | Independently administered allowlist of approved staging refs. |

It never reads `SUPABASE_ACCESS_TOKEN`, `STAGING_DB_PASSWORD`, a service-role key
or any Management API token: the project-ID decision must not depend on
credentials.

The gate denies (exit 1, no CLI call issued) when any of the following holds:

- `STAGING_PROJECT_ID` is missing;
- `STAGING_PROJECT_ID` is malformed (not a 20-character lowercase project ref);
- `STAGING_PROJECT_ID` is the documented production project (`jhgumnvhoxmapmgotchu`);
- the approval allowlist is missing/empty;
- the approval allowlist contains a malformed entry;
- the approval allowlist contains the production project;
- `STAGING_PROJECT_ID` is not an exact member of the approval allowlist
  (mismatched / not explicitly approved).

Because the gate runs before the CLI is installed, a denied target cannot issue a
single `supabase` command in any mode (`PREVIEW`, `RECONCILE`, `DEPLOY`).

## Allowlist administration

`SCOLAPRO_E2E_APPROVED_STAGING_REFS` is a comma/whitespace separated list of
20-character project refs. It is **separately administered** repository
configuration and is deliberately not derived from `STAGING_PROJECT_ID`, so a
single compromised secret cannot both declare and approve a target. Add a ref to
the allowlist only after the isolated synthetic staging project has been created
and reviewed.

## Residual dependencies / open governance

- **No `staging` GitHub environment exists yet.** The repository currently defines
  only `Preview` and `Production`. Declaring `environment: staging` in the workflow
  would silently auto-create an unprotected environment and mutate environment
  rules, so the job is intentionally left unbound. Once governance approves a
  `staging` environment (with its own protection rules and the
  `SCOLAPRO_E2E_APPROVED_STAGING_REFS` variable), the job can be bound to it.
- **Hosted verification is NOT RUN.** No live Supabase access token, hosted
  connection, workflow dispatch or database mutation was performed while adding
  this gate. All coverage is offline unit/simulation testing.
- **Production database mutations remain out of scope.** The gate only refuses
  targets; it does not authorize any hosted change.

## Related

- `e2e/support/env-guard.mjs` — the single source of truth for the production
  project ref and production hosts, reused by the validator.
- `docs/09-architecture/DATABASE-DRIFT-RECONCILIATION.md` — migration-history
  reconciliation context for the `RECONCILE`/`DEPLOY` modes.
