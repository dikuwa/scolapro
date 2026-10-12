# Hosted-staging synthetic baseline

Status: active (introduced for PR #1239 / issue #1227).
Related: `decisions/ADR-0007-synthetic-only-hosted-staging.md`, `docs/09-architecture/AUTHENTICATED-E2E-TESTING.md`, `docs/11-roadmap/2026-10-12-SYNTHETIC-STAGING-PROPOSAL.md`.

## Why this exists

`e2e/support/seed-world.mjs` assumes the demo tenant/school/register-class
structure created by `supabase/seed.sql` already exists — its first checkpoint
asserts `DEMO.schoolId` is present. On a clean **local** reset, `supabase db reset`
applies migrations and then `seed.sql`, so the structure exists.

A fresh **hosted staging** project has migrations but **no** `seed.sql`, and
`supabase db reset` must never be run against a hosted database. Without a
baseline, the hosted world seed fails at its first checkpoint. This document
records the baseline the staging seed must create and the prerequisites it
depends on.

## Migration prerequisites

All migrations must be applied to the isolated staging project (for example via
`.github/workflows/staging-database.yml`, which is itself fail-closed against the
production ref). The baseline additionally requires the two calendar routines
introduced by:

- `supabase/migrations/20261004110740_recover_namib_high_2026_learner_calendar.sql`
  → `app_private.recover_namib_high_2026_learner_calendar()`
- `supabase/migrations/20261006212006_operational_calendar_expansion.sql`
  → `app_private.apply_namib_high_2026_operational_calendar_source()`

These routines live in `app_private`, which is **not** exposed through PostgREST
(`supabase/config.toml` exposes only `public` and `graphql_public`). The baseline
therefore cannot be applied with supabase-js and must run as SQL.

## Required baseline rows

Mirrors `supabase/seed.sql`. Inserted in foreign-key order, all
`on conflict (id) do nothing`:

| Order | Table | Rows | Key columns |
| --- | --- | --- | --- |
| 1 | `public.tenants` | 1 demo tenant | `11111111-…-111111111111` |
| 2 | `public.schools` | 1 demo school (FK → tenant) | `22222222-…-222222222222` |
| 3 | `public.grades` | Grades 8–12, 2026 (FK → tenant, school) | `30000000-…-0008…0012` |
| 4 | `public.register_classes` | Grade 10/A, 10/B, 2026 (FK → tenant, school, grade) | `40000000-…-001a`, `…-001b` |
| 5 | `public.learners` | 2 learners (FK → tenant) | `50000000-…-0001`, `…-0002` |
| 6 | `public.enrolments` | 2 enrolments (FK → tenant, school, learner, grade, register class) | `60000000-…-0001`, `…-0002` |
| 7 | `app_private` routines | learner-calendar recovery + operational-calendar source, **after** the school exists | — |

The demo school must be `status='active'` for the operational-calendar routine to
apply. The routines are bounded to the Namib High 2026 identity and fail closed if
the tenant/school identity does not match.

## How it is applied

- The baseline SQL is **generated** from the shared fixture in
  `e2e/support/staging-baseline.mjs` (`buildBaselineSql()`), so it cannot drift
  from the identifiers asserted by the tests. Parity with `supabase/seed.sql` is
  asserted by `tests/staging-baseline.test.mjs`.
- It is applied only through the guarded Supabase Management API path
  (`runStagingBaselineBootstrap`), which resolves
  `e2e/support/staging-seed-guard.mjs` first and refuses a production ref, host,
  credential or missing `SCOLAPRO_E2E_SYNTHETIC_ONLY=1` **before** any request.
- **Approval binding.** A runtime ref alone does not prove a project is staging.
  The declared ref must also appear on the explicit allowlist
  `SCOLAPRO_E2E_APPROVED_STAGING_REFS`; a missing or unapproved identity is
  refused. There is no broad token access by default.
- **No arbitrary query executor.** The applier takes no caller-supplied SQL — it
  always applies the generated baseline — and requires a **branded** target
  produced by `resolveStagingManagementTarget` (`isApprovedStagingTarget`). A
  hand-built `{ projectRef, accessToken }` object is refused before any request.
- **Read-only preflight.** Before applying, the bootstrap verifies applied
  migration versions (`REQUIRED_MIGRATION_VERSIONS`) and required `app_private`
  functions (`REQUIRED_APP_PRIVATE_FUNCTIONS`), failing closed on any missing
  prerequisite.
- **Exact synthetic-row verification.** Baseline verification checks exact row
  values, not counts or ids alone, and refuses a preexisting non-synthetic row
  that collides with a demo id.
- **Sanitized failures.** Management-API errors report only the HTTP status and
  never echo the response body (which may contain secrets or SQL fragments).
- `supabase db reset` is never run against a hosted database.

## Commands

```bash
# Local, non-secret preflight (no connection, no secret read):
node scripts/seed-staging-fixtures.mjs --check

# Read-only online preflight (schema, migration versions, functions, exact rows):
node scripts/seed-staging-fixtures.mjs --verify-baseline

# Apply the baseline SQL, then seed the synthetic world (idempotent):
node scripts/seed-staging-fixtures.mjs --bootstrap
```

## Residual dependencies

Applying the baseline for real requires an isolated staging project ref, an entry
for it on the `SCOLAPRO_E2E_APPROVED_STAGING_REFS` allowlist, a
`STAGING_SUPABASE_SERVICE_ROLE_KEY` and a `SUPABASE_ACCESS_TOKEN`. None are
provisioned by this change; see the provisioning blockers in the PR.

## Verification status

- **Hosted Management-API path: NOT VERIFIED.** No isolated staging project is
  provisioned, so `--bootstrap`/`--verify-baseline` have not run online. They are
  covered by unit tests only (identity guards, approval binding, refusal paths with
  zero requests, read-only version/function preflight, exact-row collision checks,
  generated SQL parity).
- **Local equivalent: VERIFIED in CI.** `.github/workflows/e2e.yml` runs on a
  Docker-capable `ubuntu-latest` runner and exercises disposable local Supabase
  migrations (`supabase db reset`), the local baseline/world seed, repeat-seeding
  idempotency, synthetic login and tenant isolation.
