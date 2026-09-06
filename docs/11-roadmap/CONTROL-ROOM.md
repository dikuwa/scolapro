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

## 2. Core product principle

> ScolaPro is not a collection of school forms. ScolaPro maintains authoritative operational records from which school, circuit, regional and national information is derived. A user should enter a fact once, at the point where that fact originates. Every authorised report, document, dashboard and statutory return should reuse that fact rather than request it again.
>
> Digital-first does not mean paper-hostile. Where schools, circuits or the Ministry still require physical evidence, ScolaPro must generate clean, professional printable documents from the same authoritative digital record.

Every implementation decision must preserve **capture once → use everywhere**.

## 3. Current coordinated sequence

The active roadmap order is:

1. **Bell schedules + calendar teaching-impact foundation** — N17/N18/N19 plus T04/T05.
2. **Education network foundation** — N02/N03/N04: authorities, regions, circuits, optional clusters, external school identifiers, network memberships, scoped network access.
3. **DNEA UI/workflow completion** — build against the real network-role tier; never fake regional review with platform-admin permissions.
4. **Statutory reporting UI/workflow completion** — build against the real network-role tier; load authoritative Ministry mappings only from verified source material.
5. **Structural domains** — staffing establishment/vacancies, control forms, symbol distribution/exam comparisons, lean hostel/feeding, inclusion/SEN aggregate reporting.
6. **Canonical metric registry and network read models** — only after the underlying authoritative domains exist.

Circuit/region/Ministry dashboards are deliberately deferred until there is real data worth aggregating.

## 4. Parallel workstream model

This repository may be developed by multiple concurrent threads. Each thread owns one bounded branch and one bounded area. The integration/control-room thread coordinates merge order and shared files.

### Active workstreams

#### Stream A — Bell schedule + calendar foundation
- Suggested branch: `chatgpt/bell-calendar-foundation`
- Owns: N17/N18/N19, T04/T05, bell/calendar migrations, bell schedule UI, current timetable date-aware resolution, fixtures/tests.
- Must reuse: `resolve_timetable_day()`, `timetable_cycle_anchors`, existing cycle-mode/length columns.
- Must not rebuild timetable cycle foundations.

#### Stream B — Education network foundation
- Suggested branch: `chatgpt/education-network-foundation`
- Owns: N02/N03/N04, education authorities/regions/circuits/clusters, school links, external identifiers, network memberships, `can_view_school_via_network()`-style scoping and non-leakage tests.
- May prepare in parallel with Stream A, but merge order is controlled by the integration thread.
- Must not build circuit/region dashboards yet.

#### Stream C — Runtime stability / broken-page audit
- Suggested branch: `chatgpt/runtime-stability-audit`
- Owns: shared runtime/database drift and broken-page causes affecting School Settings, Academic Setup, OCR Custody, Data Correction and other non-owned routes.
- May diagnose any route, but must not modify files owned by another active stream without explicit coordination.
- Must prefer shared root-cause fixes over page-by-page patches.

#### Stream D — Documentation / governance / QA
- Suggested branch: `chatgpt/project-governance-ledger`
- Owns: roadmap/ledger updates, branch ownership, dependency matrix, acceptance status, test evidence and handback consistency.
- Must not claim production verification from source inspection alone.

### Paused bounded lane — report cards/documents

Report-card/document work is preserved but is not the main roadmap lane while the foundations above are being landed. When resumed, it remains isolated around:
- `src/features/reporting/server/*`
- `src/features/documents/server/*`
- renderer version files
- official document/artifact logic
- `public/brand/*`

Do not touch these files from unrelated streams unless the control room explicitly reassigns them.

## 5. One-owner rule for high-conflict files

At any moment, only one workstream may own a high-conflict area. Examples:
- timetable/calendar UI while Stream A is active;
- education-network schema while Stream B is active;
- report-card/document server/rendering files while the document lane is active;
- central navigation, generated DB types, global middleware and shared role registries when more than one stream needs them.

When two streams need the same shared file, the integration/control-room thread owns the final shared-file edit unless one stream is explicitly delegated ownership.

## 6. Branch and migration rules

- Start every branch from the latest agreed `main` unless the control room explicitly supplies a dependency branch.
- Never work directly on `main` for feature implementation.
- Use one logical branch per workstream/slice.
- Never rename a migration that may have been deployed.
- Before adding a migration, inspect current migration timestamps on latest `main` and choose a unique later timestamp.
- Do not rewrite another stream's migration. Add a follow-up migration if correction is required.
- Database CI must be green before a migration-owning PR is merge-ready.
- Production/shared-environment migration execution is an integration/deployment action, not an automatic consequence of source changes.

## 7. Security and data rules across all streams

- School operational scope, education-network scope and platform scope are distinct concepts.
- A circuit or regional role must not imply unrestricted learner-level access.
- Aggregation must never become a permission bypass.
- Sensitive learner support, health/welfare, examination-access evidence, counselling and HR-sensitive staff data require stronger access than aggregate operational data.
- Official codes and identifiers are authoritative external facts. Never invent region, circuit, DNEA centre, DNEA candidate, EMIS or similar official codes.
- Versioned/effective-dated facts must remain historically reproducible.
- Every governed mutation domain needs an audit story before merge.
- Permission-sensitive read models need explicit non-leakage tests, not only successful-access tests.

## 8. Completion contract for every thread

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

Do not use **DONE** if CI is still running, required tests failed, known acceptance criteria remain unmet, or the branch depends on another unmerged branch.

## 9. Integration/control-room responsibilities

The control room:
- keeps `COORDINATED-DELIVERY-LEDGER.md` current;
- assigns branch/file ownership;
- reviews dependency order;
- inspects PRs before merge;
- resolves shared-file conflicts;
- requires exact-head CI before merge where appropriate;
- merges in dependency order;
- records merge SHAs and newly unlocked work;
- tells the user when local `main` is safe to sync.

The control room does not silently merge a blocked or stale branch merely because implementation looks complete.

## 10. Local sync for the user

The normal user workflow after the control room reports an integrated merge is:

```bash
git checkout main
git pull --ff-only origin main
```

The user does not need a separate local clone for every ChatGPT thread. The remote GitHub branches are the coordination surface. Local branch/worktree management is only needed if the user personally wants to inspect or run an individual workstream before merge.

## 11. Current non-goals / guardrails

- Do not restart or replace the architecture merely to rename/reorganize features.
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
- Do not overbuild hostel/feeding before core operations are stable.
- Do not overuse charts/animation.
- Do not remove print/PDF workflows in favour of digital-only.
