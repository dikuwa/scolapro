# Control Room — Vercel deployment quota governance (2026-10-10)

Status: **Approved policy, pending PR acceptance**. Applies to all ScolaPro development streams and agents (Codex, Kiro, GPT, and others).

## Shared project and repository

- GitHub: `dikuwa/scolapro`; Vercel project: `scola-pro`.
- Keep `vercel.json` on every development branch reconciled with current `main`:
  `"git": { "deploymentEnabled": { "main": true, "*": false } }`.
- Preserve `regions: ["dub1"]` and the report-card cron `15 1 * * *`.
- Vercel's **project-level Preview deployment suppression** is also enabled. The source-file policy alone did not suppress builds on older branches; a branch inherited the older configuration and subsequent pushes still deployed.
- Treat the project-level setting as **shared infrastructure**: no agent changes it without explicit Control Room approval.

## Required sequence

1. Develop on the assigned issue branch and existing draft PR. Do not deploy every commit. Do not merge merely to get a Preview.
2. Verify **GitHub CI and database tests at the exact latest HEAD**. Prefer authenticated local browser QA with safe test data and a suitable nonproduction database.
3. A hosted Preview requires Control Room approval and an exact intended SHA. Prefer a single explicitly authorized manual Preview *without* enabling automatic branch builds, **only if supported by the Vercel project configuration**. If project-wide suppression blocks manual Previews, request a coordinated temporary exception, avoid concurrent pushes, and immediately restore suppression.
4. Before production release, obtain PR merge acceptance and separate approval for production schema changes. Validate migration order, forward compatibility, RLS and rollback/recovery as relevant.
5. After merge, inspect Vercel deployments for the approved SHA **before** any manual deployment. Never duplicate a queued, building or ready deployment. Retry only when appropriate and explicitly authorized.
6. Verify that the **production alias serves the approved exact SHA**. A ready build by itself does not prove production promotion or alias assignment.
7. Require **risk-based production functional smoke checks** for authentication, authorization, tenancy/RLS, sensitive data, migrations, and other high-risk changes. Lower-risk changes may be accepted on deployment/alias/SHA/database evidence when explicitly approved.
8. Report PR, branch, BASE MAIN, HEAD SHA, exact-head CI/DB results, migration status, Preview activity, deployment/alias evidence, blockers and remaining acceptance work in the Control Room completion format.

## Safety and quota rules

- Automatic Preview deploys remain disabled by default. GitHub CI continues normally.
- Never change another workstream's branch or shared project settings without coordination.
- Do not use a production merge to obtain development QA.
- A successful build is not authorization to merge, promote, apply a migration or release credentials.
- If suppression unexpectedly fails, halt unnecessary Preview requests and investigate project-level settings and branch-specific `vercel.json` before continuing deployment-heavy work.

Related: `docs/11-roadmap/CONTROL-ROOM.md`, §9 (branch/migration/security) and §10 (completion contract).
