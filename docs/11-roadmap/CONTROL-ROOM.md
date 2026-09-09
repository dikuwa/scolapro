# ScolaPro Control Room

This document is the coordination contract for parallel development in ScolaPro. Current `main` and repository documents are authoritative over stale chat context.

## 1. Authority and reading order

Before changing code, read:

1. `AGENTS.md`
2. `docs/11-roadmap/CONTROL-ROOM.md`
3. `docs/11-roadmap/COORDINATED-DELIVERY-LEDGER.md`
4. `docs/11-roadmap/IMPLEMENTATION-STATUS.md`
5. relevant domain/architecture/design documents referenced by `AGENTS.md`

Current reconciled `main`: `186fd1cde778ff3ab872361b4a83cb42d03221bf` (9 September 2026), including PR #381.

## 2. Product principle

> Capture once → use everywhere.

ScolaPro maintains authoritative operational records from which school, circuit, regional and national information is derived. Do not create parallel authoritative stores merely to satisfy forms, dashboards or reports. Digital-first workflows must still support clean printable evidence where required.

## 3. Integrated roadmap state

The following foundations are integrated in current `main` and must not be reopened as missing without new repository evidence:

- N02/N03/N04 — education-network hierarchy, effective-dated placement, external identifiers and scoped network roles.
- N05/N07 — statutory lifecycle and operational statutory snapshots.
- N08/N09/N10/N12 — DNEA readiness, examination centres, restricted access arrangements, frozen registration and governed results ingest.
- N13/N14 — staffing establishment, occupancy, vacancies and reconciliation.
- N15 — lean hostel/feeding.
- N16 — privacy-preserving inclusion/SEN aggregates.
- N17/N18/N19 + T04/T05 — calendar teaching impact, effective-dated bell schedules, fixtures and timetable setup refinements.
- N20 — versioned control forms.
- N21 — official-result distributions/comparisons.
- N22/N23 — shared document identity/print foundation and committed brand assets; further work remains a bounded document QA/polish lane, not a missing backend foundation.
- N24 — canonical metric registry/network-safe aggregate foundation and bounded expansion through PRs #370/#373.
- N25 — bounded circuit/regional operational aggregate read models via PR #374, with historical authorization hardening via PR #376.
- Guardian/parent claim hardening — PR #378 requires a current effective matching guardian relationship.
- LTSM/library operational integrity — PR #379 binds subject-linked resources to canonical subjects and makes completed loan returns idempotent/final.
- Finance/contributions lifecycle hardening — PR #380 governs learner-linked invoice enrolment scope and terminal invoice transitions.
- Platform tenant/school onboarding and invitations — PR #381 hardens consumed invitation finality/idempotence while preserving canonical staff placement and platform/school boundaries.
- UI/runtime consistency package #375 is merged; it is no longer an active lane.

## 4. Verification classifications

- **COMPLETE / INTEGRATED** — merged source exists.
- **SOURCE-VERIFIED** — repository tests/CI or bounded source audit verified the claimed behavior.
- **DEPLOYMENT-GATED** — source exists but connected deployment parity/runtime still requires verification.
- **SOURCE-GATED** — implementation requires verified authoritative source material.
- **REQUIREMENTS-GATED** — implementation requires authoritative functional requirements.
- **LIVE-QA-GATED** — source exists but browser/device/provider/real-data acceptance remains.
- **ACTUAL IMPLEMENTATION GAP** — documented required behavior is absent from source and is not blocked by source/requirements/deployment/live-QA gates.

Do not label a source-integrated feature as an implementation gap merely because a deployed environment is behind.

## 5. Remaining hard gates

### N06 — SOURCE-GATED

The Fifteenth School Day/AEC/Ministry mapping slice still requires verified current official Ministry forms/rules. Later merged work did not supply those authoritative mappings. Do not invent fields, codes, validation rules, export layouts or mapping definitions.

Recommendation: **KEEP SOURCE-GATED**.

### N11 — REQUIREMENTS-GATED

Coursework/moderation evidence still lacks authoritative subject/coursework/moderation requirements. Generic assessment and moderation infrastructure does not define which subjects require coursework, what evidence is mandatory, moderation stages, thresholds or official outputs.

Recommendation: **KEEP REQUIREMENTS-GATED**.

## 6. Remaining coordinated work

Connected migration parity through PR #381 is confirmed. Remaining work is:

1. Complete/review draft PR #382 as its own bounded UI package.
2. Implement the still-uncovered T06 continuous guardian-background visual requirement.
3. Implement T07 avatar diagnosis plus JPG/WebP upload behavior.
4. Implement T08 learner-photo immediate preview/pending overlay.
5. Implement T09 privacy-safe learner-photo link/upload diagnostics.
6. Run targeted live/provider/device/real-data QA for integrated features whose remaining acceptance is environmental.
7. Resume bounded document/reporting visual/print QA only under explicit ownership; preserve N22/N23 foundations.
8. Extend N24/N25 only from authoritative source facts and explicit disclosure semantics.
9. Implement N06 only after verified Ministry source material becomes available.
10. Implement N11 only after authoritative coursework/moderation requirements are confirmed.

T06–T09 are the confirmed ungated roadmap UI/runtime implementation gaps left on current `main`. PR #382 is additional active unmerged implementation work but does not cover T06–T09.

## 7. Active ownership

- **Control Room / Integration** — merge order, roadmap, shared-file coordination and integrated-main status.
- **Governance reconciliation** — this docs-only lane owns the three files under `docs/11-roadmap/` named above.
- **Deployment reconciliation** — connected-environment migration/runtime parity only; current migration parity is confirmed through PR #381.
- **UI consistency package** — draft PR #382 (`chatgpt/ui-consistency-package-c`), separate from this governance lane.
- **Paused document lane** — report-card/document renderers, artifacts and `public/brand/*`; change only under explicit assignment.

High-conflict files such as central navigation, generated DB types, global middleware, global role registries, renderers and governance documents require explicit ownership.

## 8. Branch, migration and security rules

- Start branches from latest agreed `main`.
- Never rename a migration that may have been deployed.
- Database CI must be green for migration-owning PRs.
- Shared-environment migration execution is deployment work, not an automatic consequence of source merge.
- School, network and platform scope are distinct.
- Circuit/regional roles do not imply unrestricted learner/staff access.
- Historical `p_as_of` controls fact date, not current authorization.
- Sensitive learner support, welfare, examination-access and HR-sensitive staff information require stronger authorization than aggregates.
- Official codes/identifiers/mappings must not be invented.
- Every governed mutation domain requires audit provenance.
- Permission-sensitive read models require explicit non-leakage tests.
- Canonical metrics must reuse N24/N25 architecture.

## 9. Completion contract

Use exactly:

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

Do not report DONE while required CI is running/failed or while required dependencies remain unresolved.

## 10. Local sync

```bash
git checkout main
git pull --ff-only origin main
```

## 11. Standing guardrails

Do not rebuild integrated architecture, model circuits/regions as unrestricted school tenants, expose learner-level national data by default, hardcode administrative names/codes, duplicate canonical learner/staff/subject facts in forms, hardcode pass/promotion rules, assume one bell schedule for a year, assume examination centre equals school, overbuild hostel/feeding, create a second metric registry, or remove print/PDF workflows in favour of digital-only.