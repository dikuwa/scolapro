# Authenticated E2E Testing

Status: active (introduced for issue #1227).
Owner: QA / release engineering.

## Why this exists

The attendance release (#1226) was accepted with an explicit, tracked QA gap:

> **Not tested:** production signed-in register capture/preview/PDF/calendar,
> cross-tenant browser behavior, and local rendered UI (no browser harness).
> These are NOT passes.

Closing that gap must never mean pointing a browser at production. This document
describes the safe, repeatable authenticated end-to-end capability that runs the
real ScolaPro UI against **synthetic data only**, and the fail-closed guard that
makes accidental production access impossible.

## What it provides

- A Playwright harness (`e2e/`) that drives the real Next.js app end to end.
- A synthetic multi-role world (`scripts/seed-e2e-fixtures.mjs`) that exercises
  the register-capture allow/deny matrix introduced by #1214.
- A fail-closed environment guard (`e2e/support/env-guard.mjs`) enforced by the
  Playwright config, the CLI runner, CI and the seed script.
- A self-contained CI workflow (`.github/workflows/e2e.yml`) that runs the suite
  against a throwaway local Supabase stack — no paid infrastructure.

## How to run locally

Prerequisites: Docker, the Supabase CLI, and a running local stack with the
demo seed applied.

```bash
supabase start                     # local Supabase (127.0.0.1:54321)
supabase db reset                  # migrations + supabase/seed.sql (demo school)
export SCOLAPRO_E2E_PASSWORD="<at least 12 characters>"
pnpm e2e                           # guard -> synthetic seed -> Playwright
```

`pnpm e2e` resolves the target from `.env`/`.env.local` plus the process env,
refuses to continue if the target could reach production, seeds the synthetic
world, then runs Playwright. Useful variants:

- `pnpm e2e:guard` — run only the fail-closed guard.
- `pnpm e2e:seed` — reseed the synthetic world without running tests.
- `pnpm e2e:ui` — Playwright UI mode.
- `PLAYWRIGHT_CHANNEL=chrome pnpm e2e` — use an installed Chrome instead of the
  bundled Chromium (avoids a browser download on developer machines).

The suite drives the app at `http://localhost:3000` (Playwright's managed dev
server). Use `localhost`, not `127.0.0.1`: Next.js dev origin protection answers
`127.0.0.1` with `403` for its own chunks, which would stop the app hydrating.
Override with `PLAYWRIGHT_BASE_URL` only for a hosted staging target.

## Fail-closed guard

`resolveE2EEnvironment()` throws before any browser launches when any of these
hold:

- `PLAYWRIGHT_BASE_URL` is a Vercel host (`*.vercel.app`, including the
  production alias `scola-pro.vercel.app`).
- The resolved Supabase project ref is the production project
  `jhgumnvhoxmapmgotchu`.
- Target `local` is configured with a non-loopback host, or with a hosted
  Supabase URL (a local browser must use the local stack).
- Target `staging` is configured without an explicit non-production
  `SCOLAPRO_E2E_SUPABASE_PROJECT_REF`, without `SCOLAPRO_E2E_SYNTHETIC_ONLY=1`,
  or with a URL whose ref does not match the declared staging ref.

The guard is unit-tested in `tests/e2e-guard.test.mjs` (`node --test`).

## Synthetic world

`scripts/seed-e2e-fixtures.mjs` is **localhost-only** and idempotent. It layers
on top of `supabase/seed.sql` (tenant *ScolaPro Demo Education Group*, school
*Namib High School*, classes Grade 10/A and Grade 10/B) and creates:

| Account | Role | Scope | Capture |
| --- | --- | --- | --- |
| `local-admin@scolapro.test` | school_admin | demo school | allow (all classes) |
| `e2e-teacher@scolapro.test` | class_teacher | register teacher of 10/A | allow (10/A only) |
| `e2e-teacher-unassigned@scolapro.test` | teacher | no assignment | deny |
| `e2e-hod@scolapro.test` | hod | no register assignment | deny (HOD narrowing, #1214) |
| `e2e-outsider@scolapro.test` | school_admin | second synthetic tenant | deny (tenant isolation) |

The register teacher is seeded as `class_teacher`, not the generic `teacher`
role. `can_record_register_class` accepts either, but the scoped learner/enrolment
read policies (`app_private.can_access_learner_observations_school_scoped`) only
grant a register teacher the class roster when the membership is `class_teacher`.
Seeding `teacher` therefore produced a capture authority whose register rendered
an empty roster — a fixture mismatch, not a product state.

It also forces two governed days so the calendar gate is deterministic: a
teaching day (`2026-10-13`), a non-teaching day (`2026-10-14`) and a
draft-protection day (`2026-10-15`). The isolation tenant never contains learner
data (the script asserts this).

## Coverage map

| Area | Spec |
| --- | --- |
| login / session / sign-out / unauthenticated guards | `e2e/auth.spec.ts` |
| capture authorization (allow/deny matrix) | `e2e/capture-authorization.spec.ts` |
| authorized register capture + revision | `e2e/capture-flow.spec.ts` |
| tenant isolation | `e2e/tenant-isolation.spec.ts` |
| inline register preview + PDF download | `e2e/register-preview.spec.ts` |
| governed dates (non-teaching day gate) | `e2e/governed-dates.spec.ts` |
| day / week / date navigation | `e2e/navigation.spec.ts` |
| unsaved-change (draft preservation) protection | `e2e/draft-protection.spec.ts` |

## CI

`.github/workflows/e2e.yml` runs on every pull request and on demand. It starts a
local Supabase stack, applies migrations and the demo seed, writes a local
`.env.local`, runs the guard, installs Chromium and executes `pnpm e2e`. The
Playwright report is uploaded as an artifact. No secrets, hosted projects or paid
infrastructure are involved.

## Hosted staging (approval-gated)

A hosted staging project would let the same suite run against a persistent,
non-production environment. It is **not provisioned here** because it requires
infrastructure approval (a Supabase project slot and CI secrets). When approved:

1. Provision a Supabase project **separate from production** and record its ref.
2. Add `STAGING_PROJECT_ID`, `STAGING_DB_PASSWORD` and `SUPABASE_ACCESS_TOKEN`
   repository secrets (mirroring the existing staging-database workflow).
3. Set `SCOLAPRO_E2E_TARGET=staging`, `SCOLAPRO_E2E_SUPABASE_PROJECT_REF=<ref>`
   and `SCOLAPRO_E2E_SYNTHETIC_ONLY=1`. The guard refuses to run if the ref is
   production.
4. Apply migrations and seed **synthetic** data only — never restore production
   learner data into staging.

## Known limitations

- The suite runs against the local stack in CI. Tests that need a persistent
  hosted environment are not exercised until staging is approved.
- The database-level defense-in-depth for a forged non-teaching-day submission
  (`submitDailyRegister` returning "This date is marked as a non-teaching day…")
  is not reachable through the UI, because the entry surface is replaced by the
  "No school on this day" card; it remains covered by pgTAP.
- Coverage targets the official daily register. Subject-period capture, absence
  reviews and official-summary finalisation are not yet covered by browser tests.
- `e2e/capture-flow.spec.ts` asserts capture success through the deterministic
  persisted-revision state ("Save revision" plus the retained exception), not the
  transient success toast. The toast fired by `submitDailyRegister` is cleared by
  the `router.refresh()` that immediately follows it, so it is not a stable
  assertion target; the pre-navigation warning toast (unsaved changes) does render
  and is asserted in `e2e/draft-protection.spec.ts`. This is recorded as an
  observation for the Control Room, not a release blocker — the submit control
  still shows a pending spinner and the post-save state is deterministic.
