# Coordinated delivery ledger

Baseline: `857cd71e6c82cf97fa7f12a1a15b0a28ad247fa9` (`main`, 8 September 2026).

This ledger is governed together with `docs/11-roadmap/CONTROL-ROOM.md`. Current `main` plus repository documents are authoritative over stale chat context. Statuses distinguish source integration from live production verification.

## Current ownership and merge order

- **Control Room / Integration** — roadmap, ownership, shared-file coordination, PR review, merge order, ledger updates and integrated `main`.
- **Integrated foundation** — N02/N03/N04, N05, N07, N08/N09/N10, N12, N13/N14, N15, N16, N17/N18/N19, N20, plus T04/T05.
- **N06 statutory/AEC mappings** — SOURCE-GATED; no implementation may invent Ministry field names, codes, definitions or mappings.
- **N11 coursework/moderation evidence** — REQUIREMENTS-GATED; official requirements must be verified first.
- **N21 symbol distribution/exam-series comparisons** — PENDING until its PR is merged.
- **Canonical metric registry** — PENDING until its PR is merged.
- **Production migration/runtime drift** — OPEN deployment concern; source integration is not proof of production application.
- **Paused document lane** — report cards, official documents, renderers/artifacts and branding remain isolated unless explicitly reassigned.

## Integration log

- **6 Sep 2026 — Conduct merged.** PR #340 merged into `main` at `535cdfab426d9fd9930b63daea81addc3f22528c`.
- **6–7 Sep 2026 — Official document/report-card infrastructure advanced.** PRs #341–350 established shared document chrome, brand assets, report-card fidelity and combined export foundations.
- **7 Sep 2026 — Control-room protocol merged.** PR #352 established repository coordination and dependency rules.
- **7 Sep 2026 — Bell/calendar foundation integrated.** PR #354 landed N17/N18/N19 plus T04/T05.
- **7 Sep 2026 — Education-network foundation integrated.** PR #355 landed N02/N03/N04.
- **7 Sep 2026 — Runtime-stability fix integrated.** PR #353 fixed Data Corrections membership selection and identified unresolved production database drift affecting School Settings, CRC Custody and Academic Setup.
- **7–8 Sep 2026 — Statutory/DNEA/structural foundation advanced and integrated.** N05, N08, N09, N10, N13, N14, N15, N16 and N20 are present on current `main` with their governed database/test foundations.
- **8 Sep 2026 — N12 integrated.** Frozen examination-registration submission and governed official-results ingest foundation merged before the current baseline.
- **8 Sep 2026 — N07 integrated.** PR #369 merged at `857cd71e6c82cf97fa7f12a1a15b0a28ad247fa9`, extending statutory snapshots with authoritative operational staffing-establishment, hostel/feeding, education-network and external-school-identifier facts while preserving the existing statutory fact store and frozen/reference-date semantics.

## Requirement ledger

| ID | Requirement | Current source status | Acceptance / remaining gate |
|---|---|---|---|
| N01 | Capture once; reuse authoritative backend | STANDING RULE | No parallel authoritative records |
| N02 | Normalized authority/region/circuit/optional cluster hierarchy | INTEGRATED | Effective hierarchy/history; no invented official codes |
| N03 | Versioned external school identifiers/official registries | INTEGRATED | Effective dating/source provenance; legacy EMIS compatibility preserved |
| N04 | Circuit/regional permission tier | INTEGRATED | Network school scope without automatic learner/staff-sensitive access |
| N05 | Statutory cycle/readiness/snapshot/certify + network review foundation | INTEGRATED | Canonical lifecycle, frozen history and read-only network review available; production remains VERIFY where migrations are not applied |
| N06 | Fifteenth School Day form then AEC | SOURCE-GATED | Verified current Ministry source required before mappings/export logic |
| N07 | Operational statutory snapshot coverage | INTEGRATED | Reference-date operational staffing/hostel-feeding/network/identifier facts derive from canonical sources; no second statutory fact store |
| N08 | DNEA candidate readiness | INTEGRATED | Governed readiness/review scope and blocker handling present |
| N09 | Examination centre separate from school | INTEGRATED | External/designated centre model present; school ≠ centre assumption removed |
| N10 | Examination access arrangements/special considerations | INTEGRATED | Restricted workflow/evidence boundary present; network roles do not gain unrestricted detail |
| N11 | Coursework/moderation evidence | REQUIREMENTS-GATED | Verify official subject/evidence requirements before implementation |
| N12 | Frozen exam registration submission + governed results import | INTEGRATED | Immutable/versioned submission evidence and source-provenanced import staging reuse canonical candidates/registrations and `official_results` |
| N13 | Staffing establishment/vacancies | INTEGRATED | Effective-dated establishment and occupancy facts reuse staff assignments |
| N14 | Staffing establishment operational reconciliation | INTEGRATED | Safe as-of establishment/occupied/vacant and linked/unlinked placement aggregates available |
| N15 | Lean hostel/feeding | INTEGRATED | Canonical hostel/residency/feeding operations with governed school scope and aggregates |
| N16 | Inclusion/SEN aggregate reporting | INTEGRATED | Privacy-preserving aggregate layer; no case notes/identity exposure; network aggregate remains deliberately coarse |
| N17 | Calendar teaching-impact semantics | INTEGRATED | NORMAL/NO_TEACHING/PARTIAL_DAY/ALTERED_TIMETABLE/EXAM_TIMETABLE semantics preserved |
| N18 | Seasonal/day-specific bell schedules | INTEGRATED | Effective-dated/day-aware schedule resolution |
| N19 | Bell schedule fixtures/tests | INTEGRATED | Summer/winter and weekday fixtures remain tests, not universal policy |
| N20 | Control templates/cycles | INTEGRATED | Governed configurable control-form lifecycle/versioning/RLS/audit foundation |
| N21 | Symbol distribution and exam-series comparisons | PENDING UNTIL MERGED | Must reuse authoritative official results and academic authorization; no result re-entry or SECURITY DEFINER bypass |
| N22 | Shared school identity header and print chrome | DONE FOUNDATION | Preserve paused document lane boundaries |
| N23 | Official logo/watermark artwork | DONE ASSET BASELINE | Use committed approved assets only |
| N24 | Canonical metric registry/restrained charts | PENDING UNTIL MERGED | One authoritative definition per metric before downstream dashboards/charts |
| N25 | Circuit/regional/Ministry read models | LATER ANALYTICS/NETWORK WAVE | Purpose-built aggregates with non-leakage and separately permissioned drill-down |
| N26 | Previously missing directive content | CLOSED | Requirements supplied/reconciled |

## Timetable / conduct carry-forward

- T04 numbered setup steps and T05 configured-subject collapsed state are integrated with the N17–N19 delivery.
- Existing T01–T03 and other timetable foundations remain VERIFY where broader role/device/live checks are still outstanding.
- Conduct C01–C12 remain implemented; legacy-category reconciliation is still required before tightening historical category references.

## Immediate dependency gates

### Gate A — Integrated statutory/DNEA/structural foundations
**SATISFIED IN SOURCE.** N05/N07/N08/N09/N10/N12/N13/N14/N15/N16/N17/N18/N19/N20 are integrated on current `main`.

### Gate B — N06 authoritative statutory mappings
**BLOCKED ON SOURCE.** Current official Ministry source material must be verified before publishing mappings or field-specific export logic.

### Gate C — N11 coursework/moderation evidence
**BLOCKED ON REQUIREMENTS.** Official subject/evidence requirements must be established before schema/workflow implementation.

### Gate D — N21 result analytics/comparison
**PENDING MERGE.** Do not record as integrated or build downstream assumptions on it until its PR is merged.

### Gate E — Canonical metric registry
**PENDING MERGE.** Do not create competing metric definitions in dashboards/read models while the registry remains unintegrated.

### Deployment/runtime drift gate
**OPEN / UNRESOLVED.** Source-controlled migrations are ahead of at least one production/shared environment. Prior runtime audit identified missing database objects affecting School Settings, CRC Custody and Academic Setup, and further drift may surface through the same cause. Do not hide this with UI fallbacks. Apply and verify migrations in repository order through the designated deployment path, then test affected production routes before marking them fixed.

## Integration checklist

- Read `AGENTS.md` and `CONTROL-ROOM.md` before starting a branch.
- Preserve another active stream's owned files.
- Review migration timestamps against latest `main`; never rename a deployed migration.
- Require Database CI green for migration-owning PRs.
- Require exact-head required CI before declaring merge-ready.
- Apply shared-environment migrations only through the designated integration/deployment workflow.
- Treat source integration and production migration application as separate statuses.
- Record tests, unverified scenarios, dependencies and merge SHA honestly.
- Use the mandatory DONE / IN PROGRESS / BLOCKED handback template from `CONTROL-ROOM.md`.
