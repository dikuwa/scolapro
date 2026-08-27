# ScolaPro CI/CD & Release Strategy

## Goals

CI/CD must prevent architectural, security, design-system and migration regressions from reaching production.

## Pull Request Checks

Every PR should run:

1. install with locked dependencies;
2. formatting/lint checks;
3. TypeScript type checking;
4. unit tests;
5. integration tests relevant to changed domains;
6. database migration validation when migrations change;
7. RLS/policy tests when data access changes;
8. build verification;
9. critical accessibility checks;
10. representative E2E smoke tests.

## UI Quality Gate

Frontend PRs should be reviewed against:
- `AGENTS.md`;
- `docs/08-ui-ux/DESIGN-SYSTEM.md`;
- `docs/08-ui-ux/MOTION-INTERACTION.md`;
- `docs/08-ui-ux/COMPONENT-INVENTORY.md`.

A page is incomplete if it lacks responsive, loading, empty, error or disabled states where applicable.

## Preview Deployment

Create preview deployments for material UI/workflow PRs. Preview must use non-production services and must not send real parent/learner communications.

## Staging Promotion

Merge to `main` should deploy to staging or produce a staging-ready artifact first while production release remains controlled.

Staging checks include:
- auth and role scopes;
- tenant isolation;
- core teacher workflows;
- offline/PWA behavior;
- print/PDF output;
- background jobs;
- provider adapters.

## Production Release

Production releases should be small and reversible where practical.

Before release:
- backup status healthy;
- migrations reviewed;
- error monitoring configured;
- release notes prepared for material workflow changes.

## Migration Safety

Prefer expand/migrate/contract for risky schema changes:
1. add compatible schema;
2. deploy code capable of old/new state;
3. migrate/backfill;
4. verify;
5. remove obsolete schema later.

Avoid destructive one-step migrations on critical academic history.

## Branching

Baseline:
- `main` is protected and releasable;
- feature/fix branches are short-lived;
- PR review before material changes;
- no force pushes to shared protected branches.

## Rollback

Application rollback and database rollback are distinct. Database migrations should generally be forward-fixed unless a safe explicit rollback exists.

## Automated Dependency Updates

Use controlled automated updates. Major framework/database/auth changes require deliberate review and must not auto-merge merely because tests pass.
