# ScolaPro Control Room

This document is the coordination contract for parallel development in ScolaPro. It exists so multiple ChatGPT threads, Codex sessions, human contributors, or other coding agents can work safely without relying on private chat context.

## 1. Authority and reading order

Before changing code, every workstream must read:

1. `AGENTS.md`
2. `docs/11-roadmap/CONTROL-ROOM.md` — this file
3. `docs/11-roadmap/COORDINATED-DELIVERY-LEDGER.md`
4. `docs/11-roadmap/IMPLEMENTATION-STATUS.md`
5. Relevant domain/architecture/design documents referenced by `AGENTS.md`

The repository is authoritative. A chat transcript is not a source of truth when it conflicts with current `main` or these documents.

Current reconciled `main` baseline: `5d6958dce25f160b0a6b58567386521066d713a7` (8 September 2026).

## 2. Core product principle

> ScolaPro is not a collection of school forms. ScolaPro maintains authoritative operational records from which school, circuit, regional and national information is derived. A user should enter a fact once, at the point where that fact originates. Every authorised report, document, dashboard and statutory return should reuse that fact rather than request it again.
>
> Digital-first does not mean paper-hostile. Where schools, circuits or the Ministry still require physical evidence, ScolaPro must generate clean, professional printable documents from the same authoritative digital record.

Every implementation decision must preserve **capture once → use everywhere**.

## 3. Integrated roadmap state

The following roadmap foundations are integrated in current `main` and must not be reopened as “missing” work without a new Control Room assignment:

- **N02/N03/N04** — education authority/region/circuit/cluster hierarchy, effective-dated school-network placement, external school identifiers and scoped network roles.
- **N05** — statutory reporting lifecycle workspace, readiness, frozen snapshots, certification and network review boundaries.
- **N07** — statutory snapshot operational extensions from canonical staffing-establishment, hostel/feeding, education-network and school-identifier sources.
- **N08/N09/N10/N12** — DNEA readiness, examination-centre model, restricted examination-access arrangements, frozen examination-registration submissions and governed results ingest.
- **N13/N14/N15/N16/N20/N21** — staffing establishment/reconciliation, lean hostel/feeding, privacy-preserving inclusion aggregates, versioned control forms and official-result symbol/comparison read models.
- **N17/N18/N19 + T04/T05** — calendar teaching-impact semantics, seasonal/day-specific bell schedules, fixtures and timetable setup UI refinements.
- **N24 canonical metric registry** — PR #370 established the registry/network-safe aggregate boundary; PR #373 expanded it across authoritative staffing, hostel/feeding and examination-centre metrics without creating a second fact store.
- **N25 bounded circuit/regional read models** — PR #374 integrated aggregate-only operational summaries over current authorized network scope; PR #376 then hardened the shared historical network-authority boundary so historical `p_as_of` reads cannot revive expired circuit/regional memberships.

N21 is integrated via PR #361. N24 is integrated through PRs #370/#373. The current N25 source foundation is integrated through PR #374 with network-authority hardening in PR #376.

## 4. Verification state and remaining gates

### Verification terminology

- **SOURCE-INTEGRATED** — merged in `main`; this does not imply production deployment or browser/live-data acceptance.
- **SOURCE-VERIFIED** — repository tests/CI or bounded source audit verified the claimed behavior.
- **LIVE/DEPLOYMENT VERIFIED** — exercised in a connected deployed environment against deployed schema/runtime/provider configuration.
- **UNVERIFIED** — an acceptance dimension has not actually been exercised and must not be inferred from source completion.

### N06 — source-gated statutory mappings
Authoritative Fifteenth School Day/AEC/Ministry form mappings remain **SOURCE-GATED**. Do not invent Ministry field names, codes, validation rules or form definitions. Implementation resumes only from verified current official source material.

### N11 — requirements-gated coursework/moderation evidence
N11 remains **REQUIREMENTS-GATED**. Do not infer universal subject/coursework/moderation requirements. Implementation resumes only when authoritative requirements are confirmed.

### Production/shared database migration drift
Production/shared-environment migration drift remains a **DEPLOYMENT RECONCILIATION** concern. Source-controlled implementations can be newer than a connected environment. A connected ScolaPro Supabase inspection on 8 September 2026 confirmed an active project and a substantial deployed migration history, but the deployed migration list observed during communications-readiness QA did not include the later 7–8 September network/roadmap migrations now present in `main`. Treat those newer slices as source-integrated/source-verified until their deployment is explicitly confirmed. Do not reimplement source features or hide drift with route-specific fallbacks.

### Operational QA waves completed
Completed source/operational QA has already established, among other boundaries:
- canonical/network aggregate reconciliation and non-leakage for the N24/N25 slices;
- current-membership authorization and expired-membership denial for historical network reads, including the PR #376 correction;
- recipient-specific notification RLS, authoritative communication-recipient scope, retry/attempt/receipt state semantics and secret-free provider-routing source boundaries.

Communications provider delivery remains **not live-verified**: the connected ScolaPro DB inspection found no configured provider routes and no communication outbox/receipt history to exercise end-to-end. No real provider delivery success is claimed.

### UI/runtime consistency
PR #375 is the separate active draft UI/runtime consistency lane: `chatgpt/ui-runtime-consistency-fixes`. It covers shell/shared Button/Conduct/late-arrival-detention/absence/calendar consistency work. Do not absorb, duplicate or reopen that scope from roadmap/domain streams.

## 5. Current coordinated sequence

1. **Finish deployment reconciliation** — apply/confirm later source-controlled migrations and retest affected deployed routes/RPCs; keep source completion distinct from deployed verification.
2. **Complete PR #375 bounded UI/runtime consistency lane** — review/rebase/verify independently; do not fold its UI scope into domain roadmap work.
3. **Targeted operational/live QA for still-unverified surfaces** — especially real communication provider onboarding/send/webhook receipt handling, production data/device/browser acceptance, and any environment-specific workflows not yet exercised.
4. **N24/N25 extension only when justified** — add canonical metrics or safe network read models only from authoritative source facts and explicit disclosure policy; no dashboard-local semantics or parallel metric stores.
5. **N06 statutory mappings** — only when verified Ministry source material is available.
6. **N11 coursework/moderation evidence** — only when authoritative requirements are confirmed.
7. **Consolidated UI/IA and document-lane polish** after deployment and bounded QA stabilize.

## 6. Parallel workstream model

Each thread owns one bounded branch and one bounded area. The Control Room owns merge order, shared-file coordination and integration status.

### Integrated historical streams

- **Bell/calendar foundation** — PR #354.
- **Education-network foundation** — PR #355.
- **Runtime-stability audit/fix** — PR #353; deployment findings must be verified per environment rather than treated as missing source work.
- **Statutory N05** — PR #357.
- **DNEA N08** — PR #358, with readiness hardening in PR #367.
- **N13 staffing establishment** — PR #359.
- **N14 staffing reconciliation** — PR #360.
- **N21 official-result distributions/comparisons** — PR #361.
- **N20 control forms** — PR #362.
- **N15 hostel/feeding** — PR #363.
- **N16 inclusion aggregate** — PR #364.
- **N09 examination centres** — PR #365.
- **N10 examination access arrangements** — PR #366.
- **N12 frozen registration/results ingest** — PR #368.
- **N07 statutory operational extensions** — PR #369.
- **N24 canonical metric registry/network-safe aggregate foundation** — PR #370.
- **N24 canonical metric expansion** — PR #373.
- **N25 bounded network operational analytics read model** — PR #374.
- **Historical network-authority hardening** — PR #376.

### Active bounded lane — UI/runtime consistency

- **PR #375** — draft; separate UI/runtime consistency scope. Its files and unfinished runtime/UI acceptance remain owned by that lane until Control Room disposition.

### Governance lane

Roadmap/ledger/status docs are high-conflict coordination files. Only the explicitly assigned governance stream should edit:
- `docs/11-roadmap/CONTROL-ROOM.md`
- `docs/11-roadmap/COORDINATED-DELIVERY-LEDGER.md`
- `docs/11-roadmap/IMPLEMENTATION-STATUS.md`

### Paused bounded lane — report cards/documents

Report-card/document work remains isolated around:
- `src/features/reporting/server/*`
- `src/features/documents/server/*`
- renderer version files
- official document/artifact logic
- `public/brand/*`

Do not touch these files from unrelated streams unless the Control Room explicitly reassigns them.

## 7. One-owner rule for high-conflict files

At any moment, only one workstream may own a high-conflict area. Central navigation, generated DB types, global middleware, global/shared role registries, renderer/server files and governance documents require explicit ownership when multiple streams could overlap.

When two streams need the same shared file, the Control Room owns the final shared-file edit unless one stream is explicitly delegated ownership.

## 8. Branch and migration rules

- Start every branch from the latest agreed `main` unless the Control Room explicitly supplies a dependency branch.
- Never work directly on `main` for feature implementation.
- Use one logical branch per workstream/slice.
- Never rename a migration that may have been deployed.
- Before adding a migration, inspect current migration timestamps on latest `main` and choose a unique later timestamp.
- Do not rewrite another stream's migration. Add a follow-up migration if correction is required.
- Database CI must be green before a migration-owning PR is merge-ready.
- Production/shared-environment migration execution is an integration/deployment action, not an automatic consequence of source changes.

## 9. Security and data rules across all streams

- School operational scope, education-network scope and platform scope are distinct concepts.
- A circuit or regional role must not imply unrestricted learner-level access.
- Aggregation must never become a permission bypass.
- Historical `p_as_of` selection controls the fact date, not authorization date: expired current network membership must not regain access merely by requesting a historical date.
- Sensitive learner support, health/welfare, examination-access evidence, counselling and HR-sensitive staff data require stronger access than aggregate operational data.
- Official codes and identifiers are authoritative external facts. Never invent region, circuit, DNEA centre, DNEA candidate, EMIS or similar official codes.
- Versioned/effective-dated facts must remain historically reproducible.
- Every governed mutation domain needs an audit story before merge.
- Permission-sensitive read models need explicit non-leakage tests, not only successful-access tests.
- Canonical metrics must reuse the integrated registry and network-safe aggregate boundary; do not define parallel metric semantics in dashboards.

## 10. Completion contract for every thread

A thread is not complete because code was written. Before reporting **DONE**, it must inspect its own diff and report honestly using this exact shape:

```text
STATUS: DONE | IN PROGRESS | BLOCKED
WORKSTREAM: <name>
BRANCH: <branch>
BASE MAIN: <sha>
HEAD SHA: <sha>
PR: <number/url or NOT OPENED>
CI: <application/db/test status>
MIGRATIONS: <paths or NONE>
FILES/AREAS TOUCHED: <summary>
ACCEPTANCE VERIFIED: <what was actually verified>
NOT VERIFIED: <live/browser/device/data scenarios not actually checked>
DEPENDENCIES: <satisfied/outstanding>
CONFLICT CHECK: <overlap with other active streams>
SAFE TO MERGE: YES | NO
NEXT UNLOCKED WORK: <next dependency/slice>
```

Do not use **DONE** if required CI is still running or failed, known acceptance criteria remain unmet, or the branch depends on another unmerged branch.

## 11. Integration/control-room responsibilities

The Control Room:
- keeps `COORDINATED-DELIVERY-LEDGER.md` current;
- assigns branch/file ownership;
- reviews dependency order;
- inspects PRs before merge;
- resolves shared-file conflicts;
- requires exact-head CI before merge where appropriate;
- merges in dependency order;
- records merge SHAs and newly unlocked work;
- distinguishes source completion, source verification, and production/shared-environment verification;
- tells the user when local `main` is safe to sync.

The Control Room does not silently merge a blocked or stale branch merely because implementation looks complete.

## 12. Local sync for the user

```bash
git checkout main
git pull --ff-only origin main
```

The remote GitHub branches are the coordination surface. Local branch/worktree management is only needed if the user personally wants to inspect or run an individual workstream before merge.

## 13. Current non-goals / guardrails

- Do not restart or replace integrated architecture merely to rename/reorganize features.
- Do not model circuit/region/Ministry as ordinary unrestricted school tenants.
- Do not expose learner-level data nationally by default.
- Do not hardcode administrative names/codes that can change.
- Do not duplicate learner/staff/subject facts inside statutory forms.
- Do not make census/statutory forms editable shadow databases.
- Do not hardcode pass/promotion rules across years.
- Do not assume one bell schedule for the entire year.
- Do not assume an examination centre equals a school.
- Do not assume every calendar event is a normal teaching day.
- Do not turn staffing establishment into a payroll/HR system.
- Do not overbuild hostel/feeding beyond established operational requirements.
- Do not create a second metric registry or dashboard-local metric semantics.
- Do not remove print/PDF workflows in favour of digital-only.
