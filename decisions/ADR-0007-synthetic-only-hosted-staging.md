# ADR-0007 — Synthetic-only hosted staging for authenticated QA

- **Status:** Proposed
- **Date:** 2026-10-12

## Context

ScolaPro's authenticated browser QA is **fail-closed against production by design**.
`e2e/support/env-guard.mjs` refuses any `*.vercel.app` host and the production
Supabase project ref `jhgumnvhoxmapmgotchu`, so the real signed-in UI (login,
dashboard, staff directory, role/HOD visibility, managed-credential UI, sign-out)
cannot be exercised against production. That gap is tracked and is **not a pass**
(`docs/09-architecture/AUTHENTICATED-E2E-TESTING.md`, issue #1227).

The sanctioned way to close it is a persistent, isolated, **synthetic-only**
environment. The Control Room approved Option A of
`docs/11-roadmap/2026-10-12-SYNTHETIC-STAGING-PROPOSAL.md` on 2026-10-12: run the
existing suite against an isolated hosted staging Supabase project (local app +
hosted staging DB), with the fail-closed guard as the authority.

Until now the only seed (`scripts/seed-e2e-fixtures.mjs`) was local-only: it reads
`supabase status` and refuses any non-loopback API URL, so it could never populate
a hosted staging project. A staging seed must run with a service-role key against
a remote project and therefore needs its own fail-closed identity proof.

## Decision

Authenticated browser QA runs only against **synthetic-only hosted staging** or the
local stack. The fail-closed `e2e/support/env-guard.mjs` is the authoritative gate
and is **not weakened**. Production (`*.vercel.app`, ref `jhgumnvhoxmapmgotchu`) is
never a valid authenticated-browser target, and staging never holds production data
or production credentials.

A dedicated staging seed (`scripts/seed-staging-fixtures.mjs`) applies the same
synthetic world as the local seed through one shared core
(`e2e/support/seed-world.mjs`). Before it opens a client it must resolve its target
through `e2e/support/staging-seed-guard.mjs`, which refuses to continue unless all
of the following hold:

- `SCOLAPRO_E2E_SYNTHETIC_ONLY=1` is explicitly set;
- the declared staging ref is a well-formed 20-character ref and is not the
  production ref;
- `STAGING_PROJECT_ID` (when present) and `SCOLAPRO_E2E_SUPABASE_PROJECT_REF`
  agree, and the `STAGING_SUPABASE_URL` ref matches the declared ref;
- the staging URL is a hosted Supabase URL and not a production host;
- the app's own `NEXT_PUBLIC_SUPABASE_URL` is not the production project;
- the staging secret is present, is not the production service-role or publishable
  key, and (when it is a decodable JWT) belongs to the declared ref.

All identifiers are deterministic fixtures from `e2e/support/accounts.mjs`; the
seed is idempotent, so repeated runs leave an identical world.

## Consequences

### Positive

- The tracked authenticated-UI gap can be closed without ever pointing a browser at
  production learner/staff data.
- The production boundary is enforced by code and tests, not by convention: the
  staging guard reuses the same production-host/ref rules as `env-guard.mjs`.
- Local and staging worlds cannot drift apart, because both apply the same core.

### Costs

- A hosted staging environment must be provisioned and kept isolated (separate
  project ref, synthetic data only). This ADR records the boundary; it does not
  provision anything.
- Staging secrets and a synthetic password must be supplied at run time; they are
  never committed.
- Opaque (`sb_secret_...`) keys cannot be identity-decoded, so identity is
  established by the declared ref, URL-ref equality, and inequality to the
  production secrets.

## Rejected alternatives

- **Point a browser at production** for the smoke test: violates the privacy rule
  (`AGENTS.md` §5) and the approved fail-closed boundary.
- **Weaken or bypass `env-guard.mjs`**: removes the guarantee that protects
  production data.
- **Reuse production credentials or data in staging**: staging must never contain
  production learner/staff data or production secrets.
- **Local stack only, no hosted staging**: leaves the hosted-schema/RLS acceptance
  gap open indefinitely.

## Rule

No authenticated browser QA may run against production. Hosted authenticated QA
must go through the staging guard, be synthetic-only, and use an isolated
non-production project; production hosts, the production project ref and
production credentials are always refused.

## References

- `docs/11-roadmap/2026-10-12-SYNTHETIC-STAGING-PROPOSAL.md`
- `docs/09-architecture/AUTHENTICATED-E2E-TESTING.md`
- `e2e/support/env-guard.mjs`, `e2e/support/staging-seed-guard.mjs`
- `scripts/seed-staging-fixtures.mjs`, `e2e/support/seed-world.mjs`
- `tests/staging-seed-guard.test.mjs`
- `AGENTS.md` §5 (privacy), §7 (surface conflicts; ADR for deliberate change)
