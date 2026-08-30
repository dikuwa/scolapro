# ScolaPro QA Continuation — 31 August 2026

This progress note continues from `docs/11-roadmap/IMPLEMENTATION-STATUS.md` and the merged report-card/guardian bulks on `main`.

## Authoritative starting point

- Base branch: `main`
- Starting commit: `fbf59aaa2689c78e15fa373ce9c5641d44fec60f`
- Current implementation mode remains backend/domain bulk implementation with operational UI only where needed to prove workflows.
- Do not recreate the durable bulk report-card workflow, guardian enrichment/import reconciliation, private report-document flow, combined PDF export, or report-document registration boundary. Those are already implemented.

## Latest merged closure after the previous handoff

The repository now includes:

- durable bulk report-card generation/certification/publication/PDF preparation;
- explicit report-card operational role QA coverage;
- cross-school report-document isolation tests;
- parent family/report/finance/message isolation tests;
- staff import idempotency and effective-period tests;
- closure of direct authenticated report-document registration so rendered artifacts are registered through the governed worker boundary;
- guardian authoritative enrichment closure and retirement of the one-time loader.

## Parallel development split

To avoid collisions, continuation work is split into two lanes starting from the same latest `main`.

### ChatGPT lane — backend/security/data/workflow QA

Branch: `chatgpt/qa-continuation-2026-08-31`

Primary scope:

1. Audit remaining behavioral-integrity gaps rather than duplicating existing tests.
2. Extend cross-school invalid-write fixtures where a mutation boundary is still only happy-path tested.
3. Verify parent/child isolation across all governed read-model RPCs and artifact authorization paths.
4. Verify staff-without-account and staff-import idempotency/effective-dating edge cases.
5. Verify worker-only privileges for report-card/communication claim, completion, failure and recovery functions after recent changes.
6. Keep all fixtures non-sensitive and deterministic.
7. Update the living implementation handoff only when a QA slice is actually demonstrated or merged.

Do not touch broad page composition or visual styling in this lane unless a backend defect requires a minimal operational UI correction.

### Codex lane — bounded frontend role/responsive QA

Recommended branch: `codex/role-responsive-qa-2026-08-31`

Codex should stay frontend-facing and avoid Supabase migrations/tests except when a UI defect conclusively exposes a backend contract issue that must be handed back to the ChatGPT lane.

Scope:

1. Exercise management report-card bulk screens using Whole School / Grade / Class / Custom scopes.
2. Verify Generate → Certify → Publish → Prepare PDFs states, progress, skips, failures and retry affordances.
3. Verify individual mode remains usable for exceptions/reprints without competing visually with Bulk mode.
4. Verify parent portal child switching, published report artifacts, finance summaries and directly delivered messages.
5. Verify staff directory/timetable selectors correctly surface active staff who do not yet have login accounts.
6. Check loading, empty, error, disabled and pending states.
7. Check keyboard/focus accessibility and mobile/tablet/desktop behavior.
8. Check dark/light theme behavior.
9. Follow the repository design documents and reuse existing ScolaPro components/tokens; do not redesign the application or introduce a generic dashboard style.

### File-conflict rule

- ChatGPT lane owns `supabase/**`, backend/domain/security tests, and backend-oriented roadmap notes during this pass.
- Codex lane should prefer `src/app/**`, `src/components/**` and frontend-specific tests/docs.
- Do not edit the same file in both lanes unless the change is explicitly coordinated first.

## QA priorities from here

### Priority A — report-card operational closure

Verify that the current durable report-card workflow behaves correctly for:

- authorized school management;
- ordinary teachers who must not gain management actions;
- management users from another school;
- linked guardians versus unrelated guardians;
- certified, draft, already-published and failed/skipped learner states;
- combined export retry and authorization;
- individual artifact opening versus combined batch opening;
- audit actor provenance and guardian notification idempotency.

### Priority B — behavioral integrity

Continue the approved integrity pass across:

- cross-school invalid writes;
- staff placement overlaps and ended placements;
- repeat imports and reconciliation idempotency;
- guardian relationship/contact/address history boundaries;
- parent read models;
- worker-only execution functions;
- tenant/school mismatch triggers in recently added domains.

### Priority C — real provider integrations

Do not start vendor transport implementation until the QA pass above is stable. When started, credentials remain outside PostgreSQL and delivery state must reflect actual provider results rather than optimistic success.

### Priority D — statutory mappings

Do not invent EMIS/AEC fields or Ministry rules. Form-specific mappings remain blocked until current authoritative Namibian forms/rules are verified.

## Completion rule

A QA item is complete only when the repository contains durable evidence appropriate to the risk (for example pgTAP coverage, reproducible UI verification, or a documented verified operational flow). Do not mark a broad area DONE merely because one happy path renders.
