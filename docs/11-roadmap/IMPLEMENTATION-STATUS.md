# ScolaPro Implementation Status

> Living handoff document. Read with `ARCHITECTURE-ROADMAP.md`, `CONTROL-ROOM.md`, the coordinated delivery ledger and relevant domain/design documents before proposing new architecture or duplicate work.

Last updated: **10 September 2026**

Current reconciled source baseline: `01dec838a0dfc3cb93dd5a4b3a3720203e8cded0` (through merged PR #401).

Canonical 10 September product directive: `docs/11-roadmap/2026-09-10-ABSENCE-LTSM-UI-DIRECTIVE.md`.

## Status meanings

- **COMPLETE / INTEGRATED** — implemented and merged in source.
- **SOURCE-VERIFIED** — repository tests/CI or bounded source audit verified the stated behavior.
- **DEPLOYMENT-GATED** — required source exists but connected deployment parity is not reconciled.
- **SOURCE-GATED** — implementation waits for verified authoritative source material.
- **REQUIREMENTS-GATED** — implementation waits for authoritative functional requirements.
- **LIVE-QA-GATED** — source/deployment exist; provider/browser/device/real-data acceptance remains.
- **ACTUAL IMPLEMENTATION GAP** — required documented behavior is absent from merged source and not blocked by another gate.

## Current implementation mode

The major backend/domain foundation remains integrated, including N02–N05, N07–N10 and N12–N25 bounded foundations plus later guardian, LTSM/library, finance and platform-onboarding integrity hardening.

The post-runtime/security wave through PR #394 is source-complete/source-verified, and the subsequent connected-production reconciliation confirmed migration parity through #394. The five runtime/security migrations are therefore no longer deployment-gated solely for parity. That reconciliation does **not** constitute browser/device/real-data acceptance.

PR #400 is merged at `870a4ef8d4830ebe8ffdf923102f48ae2a90cca2`. Its Academic Setup alignment, Conduct filter alignment and transparent ScolaPro brand-colour route loader are **COMPLETE / INTEGRATED** in source. Live browser/device visual acceptance remains LIVE-QA-GATED where not re-tested.

PR #401 is merged at `01dec838a0dfc3cb93dd5a4b3a3720203e8cded0`. `/library` is now the canonical **COMPLETE / INTEGRATED** Library / Textbooks operational UI over the existing canonical LTSM backend/domain. No duplicate `/ltsm` or `/textbooks` route is required. PR #401 added no migration. Existing #379/#394 lifecycle and school-local authorization remain authoritative. Live browser/device/populated-real-data acceptance remains LIVE-QA-GATED where not exercised.

One approved ungated source gap remains:

1. **Absence Reviews operational expansion**, active in PR #402 and defined by the 10 September directive.

## Attendance / Absence Reviews decision

`/school/absence-reviews` is the canonical school absenteeism operational workspace. PR #402 owns the active source implementation.

Required source behavior:

- official daily/register absences are viewable even when no guardian absence notice exists;
- subject-period absences are also viewable;
- daily/register and subject-period absences use separate counts/views;
- official daily/register attendance and subject-period attendance remain separate authoritative datasets;
- subject-period absence never inflates official daily/statutory absence;
- guardian absence notices primarily contextualize official daily/register absences;
- accepting/reviewing a guardian notice must not silently rewrite attendance;
- subject-period records remain lesson-level evidence;
- late-arrival/detention remains a third separate operational domain.

Authorization constraints:

- existing school leadership/review roles may manage guardian notice reviews according to current authority;
- teachers/class teachers receive only appropriate absenteeism awareness within their existing learner/class authority;
- subject teachers receive subject-period visibility only within existing subject/timetable authorization;
- the Absence Reviews workspace must not infer school-wide learner access, attendance-correction authority or guardian-review authority for roles that do not already have it.

Classification: **ACTUAL IMPLEMENTATION GAP — ACTIVE PR #402** until this workspace is implemented and merged.

## T/C roadmap status

| ID | Classification | Evidence / remaining constraint |
|---|---|---|
| T01 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Weekday/rotating-cycle foundation exists; runtime/device acceptance may remain. |
| T02 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Dynamic timetable day/grid behavior exists; UI acceptance may remain. |
| T03 | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | Calendar resolution/anchors integrated. |
| T04 | COMPLETE / INTEGRATED | Numbered setup steps and “Anytime” teaching periods integrated. |
| T05 | COMPLETE / INTEGRATED | Configured subjects collapsed by default. |
| T06–T09 | COMPLETE / INTEGRATED; SOURCE-VERIFIED; LIVE-QA-GATED | Source-integrated/evidenced; browser/provider/device acceptance remains where not exercised. |
| T10 | LIVE-QA-GATED | CRC source/deployment exists; route/browser acceptance remains. |
| T11 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Official identity write boundaries integrated. |
| T12 | REQUIREMENTS-GATED | Optional administrator correction auto-approval remains a deferred product decision. |
| C01–C12 | COMPLETE / INTEGRATED; SOURCE-VERIFIED; LIVE-QA-GATED | Conduct workflow integrated; PR #392 production migration parity is reconciled. Remaining browser/device/real-data acceptance stays separate. |

## N-roadmap status

| ID | Classification | Evidence / remaining constraint |
|---|---|---|
| N01 | COMPLETE / STANDING ARCHITECTURE | Capture once; derive everywhere. |
| N02–N05 | COMPLETE / INTEGRATED | Network hierarchy/identifiers/roles/statutory lifecycle foundations integrated. |
| N06 | SOURCE-GATED | Verified current Fifteenth School Day/AEC/Ministry field mappings, codes, rules and official layouts remain absent. |
| N07–N10 | COMPLETE / INTEGRATED | Statutory snapshots, DNEA readiness, examination centres and restricted examination-access foundations integrated. |
| N11 | REQUIREMENTS-GATED | Authoritative subject/coursework/moderation requirements remain absent. |
| N12–N20 | COMPLETE / INTEGRATED | Frozen exam registration/results, staffing, hostel/feeding, inclusion, calendar/bell and control-form foundations integrated. |
| N21 | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | Official-result comparison source and PR #391 cleanup integrated; production migration parity reconciled. Unexercised external/live acceptance remains separate. |
| N22/N23 | COMPLETE FOUNDATION / ASSET BASELINE; SOURCE-VERIFIED; LIVE-QA-GATED | Shared document identity/assets and PR #386 pagination correction integrated; bounded live print/PDF/device QA remains. |
| N24/N25 | COMPLETE / SOURCE-VERIFIED | Canonical metric registry and bounded network operational analytics integrated. |
| N26 | COMPLETE / CLOSED | Requirement reconciliation complete. |

## Foundation / tenancy / onboarding

| Area | Classification | Notes |
|---|---|---|
| PostgreSQL/Supabase baseline | COMPLETE / INTEGRATED | Source-controlled migrations/RLS/RPC architecture established. |
| Tenant isolation | SOURCE-VERIFIED; LIVE-QA-GATED | RLS/integrity boundaries exist; scenario-specific live acceptance may remain. |
| Platform tenant/school onboarding | SOURCE-VERIFIED | PR #381 preserves platform/school admin boundaries and canonical provisioning semantics. |
| School invitations | SOURCE-VERIFIED | PR #381 preserves invitation finality/idempotence and grant identity/role integrity. |
| Education network | COMPLETE / SOURCE-VERIFIED | N02–N04 plus historical authorization hardening. |
| Canonical metric registry | COMPLETE / SOURCE-VERIFIED | N24 integrated. |
| Network operational analytics | COMPLETE BOUNDED FOUNDATION / SOURCE-VERIFIED | N25 integrated. |
| Notifications | SOURCE-VERIFIED | Recipient-specific authorization and relationship integrity. |
| Communications delivery | SOURCE-VERIFIED; LIVE-QA-GATED | Durable delivery architecture exists; real configured-provider acceptance remains. |

## Learner, staff, timetable and attendance

| Area | Classification | Notes |
|---|---|---|
| Learner identity/enrolment | COMPLETE FOUNDATION; LIVE-QA-GATED | Long-lived identity/effective enrolment. |
| Learner operational profile | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | Governed identity correction and learner-photo behavior integrated. |
| Academic structure | COMPLETE FOUNDATION; LIVE-QA-GATED | Grades/classes/subjects and correction-safe semantics integrated. |
| Staff identity/placements | COMPLETE FOUNDATION | Tenant-wide identity plus effective school placements. |
| Timetable | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | Offerings/allocations/conflicts/cycle/calendar foundation integrated; PR #400 alignment correction is merged. |
| Bell/calendar integration | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | N17–N19 integrated. |
| Daily/weekly attendance | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | Official register remains authoritative daily/statutory attendance. |
| Subject-period attendance | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | Lesson-level attendance remains separately authoritative inside subject/timetable authorization. PR #388 migration parity is reconciled. |
| Absence Reviews operational workspace | ACTUAL IMPLEMENTATION GAP — ACTIVE PR #402 | Must expose official daily/register absences with or without notices plus a separately counted/viewed subject-period absence surface without collapsing datasets or widening authorization. |

## Guardians, parents and communications

| Area | Classification | Notes |
|---|---|---|
| Guardian identities/relationships | COMPLETE FOUNDATION | Reusable identities/effective relationships. |
| Guardian directory presentation | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | Integrated; live browser/device acceptance remains where unexercised. |
| Parent account claim | SOURCE-VERIFIED | Current effective guardian relationship required. |
| Parent absence notices | COMPLETE FOUNDATION; LIVE-QA-GATED | Governed explanation/evidence workflow remains; notices contextualize official daily/register absences and do not silently rewrite attendance. |
| Parent portal | COMPLETE FOUNDATION; LIVE-QA-GATED | Published results/reports/finance/messages foundations integrated. |

## Learner conduct, support, inclusion and LTSM

| Area | Classification | Notes |
|---|---|---|
| Conduct/achievement | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | PR #392 source and production parity complete; PR #400 filter-row alignment source-integrated. Live acceptance remains separate where not re-tested. |
| Late-arrival/detention | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | Separate operational domain; must not be merged into official or subject-period absence counts. |
| Learner support | COMPLETE FOUNDATION; LIVE-QA-GATED | Restricted/highly restricted support data remains separate from aggregates. |
| Inclusion/SEN aggregates | COMPLETE / SOURCE-VERIFIED | Aggregate-only/non-leakage model integrated. |
| LTSM/library backend/domain | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | PR #379 canonical subject/return finality plus PR #394 school-local circulation authority/Namibia dates integrated; production migration parity through #394 reconciled. |
| Library / Textbooks operational UI | COMPLETE / INTEGRATED; LIVE-QA-GATED | PR #401 merged `/library` over the canonical backend/domain. No duplicate `/ltsm` or `/textbooks` route is required; no migration added. Live browser/device/populated-real-data acceptance remains where unexercised. |

## Admissions, examinations, finance and progression

| Area | Classification | Notes |
|---|---|---|
| Admissions/transfers | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | PR #393 source and production parity complete; live workflow acceptance remains where unexercised. |
| Promotion/progression | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | Versioned provenance/finality/source-enrolment safeguards integrated; production parity reconciled. |
| DNEA readiness | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | Integrated/hardened. |
| Examination centres | COMPLETE / SOURCE-VERIFIED | Centre remains independent from school. |
| Examination access arrangements | COMPLETE / INTEGRATED; LIVE-QA-GATED | Restricted individual-data scope integrated. |
| Exam registration/results ingest | COMPLETE / INTEGRATED; LIVE-QA-GATED | Frozen registration and governed result ingest integrated. |
| Official result comparisons | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | PR #391 cleanup source and production parity complete; external/live acceptance remains where unexercised. |
| Finance/contributions | SOURCE-VERIFIED | Existing payment/allocation/reversal and invoice lifecycle hardening remain authoritative. |

## Academic assessment and report cards

| Area | Classification | Notes |
|---|---|---|
| Assessment schemes/components | COMPLETE FOUNDATION; LIVE-QA-GATED | Versioned scheme architecture. |
| Working marks/moderation engine | COMPLETE FOUNDATION; LIVE-QA-GATED | Generic mechanics integrated; this does not satisfy N11's missing authoritative coursework/moderation requirements. |
| Official results | COMPLETE FOUNDATION | Approved immutable provenance. |
| Report-card snapshots | COMPLETE FOUNDATION; LIVE-QA-GATED | Immutable approved-result/attendance/rule/template provenance. |
| Certification/publication | COMPLETE FOUNDATION; LIVE-QA-GATED | Exact snapshot versions certified/published. |
| Durable bulk reports/artifacts | COMPLETE FOUNDATION; LIVE-QA-GATED | Durable generation/certify/publish/PDF/HTML pipeline exists. |
| N22/N23 document identity/assets | COMPLETE FOUNDATION / ASSET BASELINE; SOURCE-VERIFIED; LIVE-QA-GATED | PR #386 correction integrated; remaining visual/print/browser/PDF/device scenarios are bounded QA. |

## Statutory / EMIS / structural operations

| Area | Classification | Notes |
|---|---|---|
| Form registry/cycles | COMPLETE FOUNDATION | Effective-dated definitions/versions/reporting cycles. |
| Generic mapping compiler | COMPLETE FOUNDATION | Declarative source→target compiler; no invented Ministry fields. |
| Authoritative Fifteenth School Day/AEC mappings | SOURCE-GATED | N06 gate remains unresolved. |
| Staffing establishment/vacancies | COMPLETE / INTEGRATED | N13/N14. |
| Hostel/feeding | COMPLETE / INTEGRATED | N15. |
| Inclusion aggregates | COMPLETE / SOURCE-VERIFIED | N16. |
| Control forms | COMPLETE / INTEGRATED | N20. |
| Canonical metrics/network aggregates | COMPLETE / SOURCE-VERIFIED | N24/N25. |

## Deployment and live-QA state

Connected-production migration parity has been reconciled through PR #394, including:

- `20260909153000_subject_attendance_cycle_day_resolution.sql`
- `20260909170000_retire_legacy_official_result_comparison.sql`
- `20260909201500_conduct_late_arrival_enrolment_period_hardening.sql`
- `20260910032000_enrolment_progression_school_local_authority.sql`
- `20260910050000_library_circulation_school_local_date_hardening.sql`

Do not continue to mark those five migrations DEPLOYMENT-GATED solely from stale pre-reconciliation text. Do not replay applied DDL because ledger timestamps/names differ. PR #401 added no migration.

Migration parity does not make every workflow live-verified. Remaining LIVE-QA-GATED areas include browser/device/real-data/provider scenarios not explicitly exercised, including PR #400 visual acceptance, PR #401 Library / Textbooks browser/device/populated-real-data acceptance, Absence Reviews after PR #402 source integration, communications provider acceptance, statutory/DNEA external interfaces, learner photo/avatar provider cases and bounded N22/N23 print/PDF/device cases.

## N06 decision

**KEEP SOURCE-GATED.** Current source still lacks verified Ministry form field definitions, codes, mappings, validation rules and official export layouts.

## N11 decision

**KEEP REQUIREMENTS-GATED.** Generic assessment/moderation mechanics do not provide the authoritative subject/coursework requirement matrix, evidence obligations, moderation stages/thresholds or official output contract.

## T12 decision

**KEEP REQUIREMENTS-GATED.** Optional administrator correction auto-approval remains a deferred product decision.

## Remaining-source conclusion

**Confirmed current ACTUAL IMPLEMENTATION GAP:**

1. **Absence Reviews operational expansion — active PR #402**: official daily/register absences with or without guardian notices plus separately counted/viewed subject-period absenteeism, preserving separate authoritative datasets, lesson-level evidence, guardian-notice non-rewrite semantics, late-arrival/detention separation and existing authorization boundaries.

Library / Textbooks is no longer an implementation gap. PR #401 is merged and `/library` is COMPLETE / INTEGRATED over the canonical #379/#394 backend/domain. PR #400 is also source-integrated and not an implementation gap. Their remaining unexercised browser/device/real-data acceptance is LIVE-QA-GATED.

## Active parallel work

- PR #399 — docs-only canonical reconciliation of the 10 September directive and current governance state.
- PR #402 — active Absence Reviews implementation.
- N06 remains SOURCE-GATED.
- N11 and T12 remain REQUIREMENTS-GATED.

## Takeover rule

Before starting implementation, inspect current `main`, this status file, `CONTROL-ROOM.md`, the coordinated ledger and the 10 September directive when relevant. Do not recreate integrated backend/domain or `/library` operational UI work, do not collapse daily/register and subject-period attendance, do not let guardian notices rewrite attendance, do not infer school-wide learner access from the Absence Reviews workspace, do not duplicate the canonical LTSM/library model or route, and do not confuse production parity or CI success with live browser/device/real-data acceptance.