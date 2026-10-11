# Control Room — Vercel deployment quota governance (2026-10-10)

Status: **Approved policy; Control Room documentation corrections applied (2026-10-11) — pending final PR acceptance.** Applies to all ScolaPro development streams and agents (Codex, Kiro, GPT, and others).

## Shared project and repository

- GitHub: `dikuwa/scolapro`; Vercel project: `scola-pro`.
- Keep `vercel.json` on every development branch reconciled with current `main`:
  `"git": { "deploymentEnabled": { "main": true, "*": false } }`.
- Preserve `regions: ["dub1"]` and the report-card cron `15 1 * * *`.
- Vercel's **project-level Preview deployment suppression** is also enabled. The source-file policy alone did not suppress builds on older branches; a branch inherited the older configuration and subsequent pushes still deployed.
- Treat the project-level setting as **shared infrastructure**: no agent changes it without explicit Control Room approval.

## Deployment quota verification (operational — recheck each release)

- The `scola-pro` Vercel project is on the **Hobby** plan. Hobby applies a finite daily deployment allowance (documented as roughly 100 deployments/day per project); exceeding it blocks further builds until the window resets.
- Deployment headroom is an **operational observation, not a guarantee**. Before any release, recheck it read-only (Vercel dashboard, or the deployments API/CLI) rather than assuming capacity is available.
- Snapshot observed at the 2026-10-11 policy review: `scola-pro` had **3 deployments in the preceding 24 h** and 58 production-target deployments over 30 days — ample headroom for one release build. This figure is a point-in-time snapshot and may be stale; do not treat it as reserved capacity.
- A quota-safe release advances `main` exactly once and therefore consumes exactly one production build (see *Quota-safe stacked-release integration*). Do not spend quota on duplicate or exploratory production builds.

## Required sequence

1. Develop on the assigned issue branch and existing draft PR. Do not deploy every commit. Do not merge merely to get a Preview.
2. Verify **GitHub CI and database tests at the exact latest HEAD**. Prefer authenticated local browser QA with safe test data and a suitable nonproduction database.
3. A hosted Preview requires Control Room approval and an exact intended SHA. Prefer a single explicitly authorized manual Preview *without* enabling automatic branch builds, **only if supported by the Vercel project configuration**. If project-wide suppression blocks manual Previews, request a coordinated temporary exception, avoid concurrent pushes, and immediately restore suppression.
4. Before production release, obtain PR merge acceptance and separate approval for production schema changes. Validate migration order, forward compatibility, RLS and rollback/recovery as relevant.
5. After merge, inspect Vercel deployments for the approved SHA **before** any manual deployment. Never duplicate a queued, building or ready deployment. Retry only when appropriate and explicitly authorized.
6. Verify that the **production alias serves the approved exact SHA**. A ready build by itself does not prove production promotion or alias assignment.
7. Require **risk-based production functional smoke checks** for authentication, authorization, tenancy/RLS, sensitive data, migrations, and other high-risk changes. Lower-risk changes may be accepted on deployment/alias/SHA/database evidence when explicitly approved.
8. Report PR, branch, BASE MAIN, HEAD SHA, exact-head CI/DB results, migration status, Preview activity, deployment/alias evidence, blockers and remaining acceptance work in the Control Room completion format.

## Quota-safe stacked-release integration

When several approved PRs form a dependent stack (each branch based on the previous), landing them one-by-one onto `main` would trigger one production build **per merge**. Use a single release integration branch instead:

1. Create a **non-`main`** release branch from current `main` (e.g. `release/<name>-<yyyymm>`). Because `deploymentEnabled` is `{ "main": true, "*": false }` and project-level Preview suppression is on, pushes and merges on this branch produce **zero** Vercel deployments.
2. Integrate the stack in dependency order by retargeting each PR's base to the release branch and merging it there (preserving each PR's history and review record), or by merging the branches locally with `--no-ff`. Before each retarget, verify that the PR's diff against the new base still equals its own changeset — retargeting out of order can contaminate the diff.
3. Open **one** release PR from the release branch to `main` and require exact-head CI.
4. Advance `main` **exactly once** by merging that single release PR. This is the only push to `main`, so it is the only production build.
5. Apply any migration afterwards, separately gated.

Retargeting is a PR-metadata change only; it does not alter commits or review history.

## Staging database safety guard

- Hosted schema rehearsal uses `.github/workflows/staging-database.yml` (manual `workflow_dispatch`). It is **fail-closed**: it refuses to proceed when `STAGING_PROJECT_ID` equals the production project ref `jhgumnvhoxmapmgotchu`.
- **Prohibition:** never run staging commands, and never push migrations, against a `STAGING_PROJECT_ID` that resolves to the production project. If the guard fires, treat it as a hard stop, not an obstacle to work around.
- Snapshot observed at the 2026-10-11 policy review: `STAGING_PROJECT_ID` resolved to the production ref, so the workflow correctly refused and **no isolated scolapro staging project existed**. In that state hosted rehearsal is unavailable; either provision an isolated staging project (and correct the secret) or record an explicit, time-boxed **risk acceptance** with an alternative rehearsal (fresh local database plus `supabase test db`, with read-only production inspection).
- Never edit shared secrets to point staging at production, or production at staging, without explicit Control Room approval.

## Safety and quota rules

- Automatic Preview deploys remain disabled by default. GitHub CI continues normally.
- Never change another workstream's branch or shared project settings without coordination.
- Do not use a production merge to obtain development QA.
- A successful build is not authorization to merge, promote, apply a migration or release credentials.
- If suppression unexpectedly fails, halt unnecessary Preview requests and investigate project-level settings and branch-specific `vercel.json` before continuing deployment-heavy work.
- Recheck Hobby deployment headroom read-only before each release; treat earlier figures as stale.
- Land stacked PRs through one non-`main` release branch and a single authorized advancement of `main`.
- Do not use a production-linked staging reference for rehearsal; the `staging-database.yml` guard is authoritative.

Related: `docs/11-roadmap/CONTROL-ROOM.md`, §9 (branch/migration/security) and §10 (completion contract).
