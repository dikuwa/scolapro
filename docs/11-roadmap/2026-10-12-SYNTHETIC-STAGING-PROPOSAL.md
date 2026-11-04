# Synthetic-only hosted staging for authenticated QA — proposal & ADR assessment

Status: **Proposal — pending Control Room approval. Nothing provisioned, deployed or changed by this document.**
Date: 2026-10-12
Related: `docs/09-architecture/AUTHENTICATED-E2E-TESTING.md`, `e2e/support/env-guard.mjs`, `docs/11-roadmap/2026-10-10-VERCEL-DEPLOYMENT-QUOTA-POLICY.md`, `.github/workflows/staging-database.yml`, `AGENTS.md` §5/§7.

## 1. Purpose

Close the tracked **authenticated UI QA gap** (login, dashboard, staff directory, role/HOD visibility, managed-credential UI presence, sign-out) **without ever pointing a browser at production**.

Production smoke of release `ccca928483cbc853446ac3049edda3590ae03778` confirmed release identity, alias/READY state, unauthenticated HTTP auth-gates and zero reported Vercel error/5xx rows. It **cannot** cover authenticated UI: that is fail-closed against production by design (`e2e/support/env-guard.mjs`, `docs/09-architecture/AUTHENTICATED-E2E-TESTING.md`). This proposal is the sanctioned route to that coverage.

## 2. Evidence-based constraints

- **Guard is fail-closed.** `isProductionHost()` refuses every `*.vercel.app` host; `resolveE2EEnvironment()` also refuses the production Supabase ref `jhgumnvhoxmapmgotchu` (`e2e/support/env-guard.mjs:35-41, 75-80, 104-108`).
- **No isolated staging project exists.** Org `Flextech-media` is on the Supabase **free** plan; projects present are `scolapro` (production) and `martin_mukoya`. Policy review (2026-10-11) recorded `STAGING_PROJECT_ID` resolving to the production ref, so `staging-database.yml` correctly refused.
- **Vercel is Hobby; previews disabled by design** (`vercel.json` `deploymentEnabled { main: true, "*": false }` + project-level Preview suppression). A hosted staging *app* is therefore not free/automatic.
- **Synthetic seed is local-only.** `scripts/seed-e2e-fixtures.mjs` reads `supabase status` and refuses any non-loopback API URL (`:40-42`); it cannot seed a hosted project today.
- **No Vercel-runtime config blocker for a local app.** `assertProductionConfiguration()` only fires when `VERCEL === "1"` (`src/lib/config/runtime.ts:11`), so a local Next.js app can point at hosted staging Supabase safely.
- **The `staging` target already exists in the guard** and requires an explicit non-production `SCOLAPRO_E2E_SUPABASE_PROJECT_REF` + `SCOLAPRO_E2E_SYNTHETIC_ONLY=1` (`env-guard.mjs:119-138`).

## 3. Options

| Option | What it is | Vercel cost | Supabase cost | Closes authenticated-UI gap? |
|---|---|---|---|---|
| **A — Local app + hosted staging DB** (recommended) | Run the app locally; point it at an isolated hosted staging Supabase project; run `pnpm e2e` with `SCOLAPRO_E2E_TARGET=staging` | **$0** | free slot if available, else Pro (~$25/mo) | Yes (real hosted schema + RLS, real browser, synthetic data) |
| **B — Hosted staging app + staging DB** | Separate Vercel project + staging Supabase | second project / plan risk | free slot or Pro | Yes, but highest cost/complexity |
| **C — No hosted staging (risk acceptance)** | Local stack + `supabase test db` + read-only prod inspection | $0 | $0 | No — gap stays open, time-boxed |

Option C is the $0 fallback the policy already permits *only* as an explicit, time-boxed risk acceptance. Option B is not cost-conscious under Hobby. **Recommend Option A.**

## 4. Recommended: Option A (local app + hosted staging Supabase)

1. **Provision one isolated Supabase project** whose ref is not `jhgumnvhoxmapmgotchu` (free slot if the org has one; otherwise Pro). Record the ref; do not reuse a production-linked ref.
2. **Set the staging secret.** Update `STAGING_PROJECT_ID` to the new ref so `staging-database.yml` links the isolated project (its built-in guard already refuses the production ref).
3. **Apply schema to staging** via the manual `staging-database.yml` `PREVIEW` → `RECONCILE` → `DEPLOY` flow (fail-closed; never production-linked).
4. **Seed synthetic data only.** The current seed script is local-only, so staging seeding needs either (a) a small guarded staging-seed path that **refuses** the production ref and any non-approved ref, or (b) an equivalent SQL seed. Run the suite with `SCOLAPRO_E2E_SKIP_SEED=1` if seeding is done separately. **Do not restore production data into staging.**
5. **Run the suite** (illustrative; values are placeholders):

   ```bash
   export SCOLAPRO_E2E_TARGET=staging
   export SCOLAPRO_E2E_SUPABASE_PROJECT_REF="<isolated-staging-ref>"
   export SCOLAPRO_E2E_SYNTHETIC_ONLY=1
   export PLAYWRIGHT_BASE_URL="http://localhost:3000"
   export NEXT_PUBLIC_SUPABASE_URL="https://<isolated-staging-ref>.supabase.co"
   export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<staging-anon-key>"
   export SCOLAPRO_E2E_PASSWORD="<>=12 chars, staging-only>"
   pnpm e2e
   ```

   The app runs locally (`localhost`, not `*.vercel.app`); the guard resolves target `staging` and refuses anything that could reach production.

## 5. Guard and safety rules (non-negotiable)

- **Do not modify, weaken or bypass `e2e/support/env-guard.mjs`.** The sanctioned `staging` branch is used as-is.
- Any new staging seed path must be **fail-closed**: refuse the production ref `jhgumnvhoxmapmgotchu` and refuse any unapproved ref.
- Staging is **synthetic-only**: no production learner/staff data, no production credentials, separate/rotated staging credentials, never shared with production.
- No `supabase migration repair` and no production-linked staging commands without explicit Control Room authorization.
- Staging project settings are shared infrastructure; no agent changes them unilaterally.

## 6. Acceptance criteria

- `pnpm e2e:guard` passes for the staging env and **refuses** a poisoned production env (negative test).
- Suite exercises the six items: login, dashboard, staff directory, role/HOD visibility, managed-credential UI presence, sign-out.
- Evidence captured: guard-resolved target/base URL/ref (no secrets), synthetic account emails only, no session material persisted.

## 7. ADR assessment

**Recommendation: an ADR is warranted (proposed `decisions/ADR-0007`).**

- **Why an ADR (vs. an operational note):** it establishes a durable cross-stream invariant future agents must honour — *staging is synthetic-only and the E2E guard is the authoritative gate* — comparable to ADR-0004's binding "Rule". Without it, the boundary lives only in prose and is at risk of being re-opened.
- **Alternative considered:** extend `docs/09-architecture/AUTHENTICATED-E2E-TESTING.md` §"Hosted staging". Acceptable if the Control Room classifies this as purely operational; weaker because it is not part of the `decisions/` record.
- **Proposed decision text (if promoted):**
  > Authenticated browser QA runs only against **synthetic-only** hosted staging or the local stack. The fail-closed `e2e/support/env-guard.mjs` is the authoritative gate and must not be weakened. Production (`*.vercel.app`, ref `jhgumnvhoxmapmgotchu`) is never a valid authenticated-browser target. Staging never holds production data or credentials.
- **Status while proposed:** `Proposed` — do not treat as accepted until Control Room approves.

## 8. Control Room decisions required

1. Approve Option A (or C as time-boxed risk acceptance).
2. Approve Supabase provisioning and whether a free slot exists or Pro (~$25/mo) is accepted.
3. Approve the guarded staging-seed path (a repo change) or an SQL-seed alternative.
4. Assign ownership (this touches shared secrets and `staging-database.yml`).
5. Decide ADR-0007 vs. extending `AUTHENTICATED-E2E-TESTING.md`.

## 9. Out of scope

No provisioning, deploy, guard change, secret change, migration push or production mutation is performed by this proposal. It is a decision request only.
