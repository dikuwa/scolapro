# ScolaPro Control Room

This document is the coordination contract for parallel development in ScolaPro. Current `main` and repository documents are authoritative over stale chat context.

## 1. Authority and reading order

Before changing code, read:

1. `AGENTS.md`
2. `docs/11-roadmap/CONTROL-ROOM.md`
3. `docs/11-roadmap/COORDINATED-DELIVERY-LEDGER.md`
4. `docs/11-roadmap/IMPLEMENTATION-STATUS.md`
5. relevant domain/architecture/design documents referenced by `AGENTS.md`

Current reconciled `main`: `05f55fefffce2648634dcc85824aeb02164c01a8` (9 September 2026), including PR #386.

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
- N22/N23 — shared document identity/print foundation and committed brand assets; PR #386 corrects shared browser-print pagination and repeats table headers for continuation pages. Live browser, app-generated PDF, dark-theme print and device acceptance remain LIVE-QA-GATED where not exercised.
- N24 — canonical metric registry/network-safe aggregate foundation and bounded expansion through PRs #370/#373.
- N25 — bounded circuit/regional operational aggregate read models via PR #374, with historical authorization hardening via PR #376.
- Guardian/parent claim hardening — PR #378 requires a current effective matching guardian relationship.
- LTSM/library operational integrity — PR #379 binds subject-linked resources to canonical subjects and makes completed loan returns idempotent/final.
- Finance/contributions lifecycle hardening — PR #380 governs learner-linked invoice enrolment scope and terminal invoice transitions.
- Platform tenant/school onboarding and invitations — PR #381 hardens consumed invitation finality/idempotence while preserving canonical staff placement and platform/school boundaries.
- UI consistency package — PR #382 is merged; its form/loading/report-settings/conduct/timetable consistency work is no longer an active lane.
- T06 — PR #385 integrates the continuous expanded guardian-background visual correction; browser/device visual acceptance remains LIVE-QA-GATED.
- T07 — PR #384 integrates avatar JPG/JPEG/PNG/WebP upload handling and actionable diagnostics while preserving the existing storage/authorization boundary; live provider/browser acceptance remains LIVE-QA-GATED.
- T08/T09 — learner-photo immediate preview/pending overlay and upload/link diagnostics were already integrated before this reconciliation. Commit `5e006ed7a8488ac3510c2eacefc8ab720e0ccc12` is an ancestor of current `main` and source-evidences the preview/pending behavior and actionable upload diagnostics; related learner-photo storage/link failure handling is also integrated. Do not create duplicate T08/T09 work merely because live browser/provider scenarios remain unexercised.

## 4. Verification classifications

- **COMPLETE / INTEGRATED** — merged source exists.
- **SOURCE-VERIFIED** — repository tests/CI or bounded source audit verified the claimed behavior.
- **DEPLOYMENT-GATED** — source exists but connected deployment parity/runtime still requires verification.
- **SOURCE-GATED** — implementation requires verified authoritative source material.
- **REQUIREMENTS-GATED** — implementation requires authoritative functional requirements.
- **LIVE-QA-GATED** — source exists but browser/device/provider/real-data acceptance remains.
- **ACTUAL IMPLEMENTATION GAP** — documented required behavior is absent from source and is not blocked by source/requirements/deployment/live-QA gates.

Do not label a source-integrated feature as an implementation gap merely because a deployed environment is behind or live acceptance was not exercised.

## 5. Remaining hard gates

### N06 — SOURCE-GATED

The Fifteenth School Day/AEC/Ministry mapping slice still requires verified current official Ministry forms/rules. Later merged work did not supply those authoritative mappings. Do not invent fields, codes, validation rules, export layouts or mapping definitions.

Recommendation: **KEEP SOURCE-GATED**.

### N11 — REQUIREMENTS-GATED

Coursework/moderation evidence still lacks authoritative subject/coursework/moderation requirements. Generic assessment and moderation infrastructure does not define which subjects require coursework, what evidence is mandatory, moderation stages, thresholds or official outputs.

Recommendation: **KEEP REQUIREMENTS-GATED**.

## 6. Remaining coordinated work

No confirmed ungated roadmap source implementation gap remains after reconciling current `main` through PR #386. Remaining work is gated or bounded verification/extension work:

1. Run targeted live/provider/device/real-data QA for integrated features whose remaining acceptance is environmental, including T06–T09 where relevant.
2. Continue bounded N22/N23 document QA only under explicit ownership. PR #386 source-exercised a representative 70-row paged-media class-list fixture and source-reviewed the PDF/report-card paths, but did not exercise live Chromium print, dark-theme print, app-generated PDF bytes, browser page-number/header parity, or optional backdrop rendering.
3. Extend N24/N25 only from authoritative source facts and explicit disclosure semantics.
4. Implement N06 only after verified Ministry source material becomes available.
5. Implement N11 only after authoritative coursework/moderation requirements are confirmed.

T06–T09 are integrated/source-evidenced and are not current implementation gaps. PR #382 is merged and is not active implementation work.

## 7. Active ownership

- **Control Room / Integration** — merge order, roadmap, shared-file coordination and integrated-main status.
- **Governance reconciliation** — this docs-only lane owns the three files under `docs/11-roadmap/` named above.
- **Deployment reconciliation** — connected-environment migration/runtime parity only; environment-specific route/browser/provider acceptance remains distinct from source completeness.
- **Document QA** — N22/N23 remains a bounded visual/print QA lane only when explicitly assigned; preserve the integrated document foundation and PR #386 correction.

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