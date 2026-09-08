# ScolaPro Implementation Status

> **Living handoff document.** Update this file whenever a meaningful implementation slice is completed or materially changes. Read this file together with `ARCHITECTURE-ROADMAP.md`, `CONTROL-ROOM.md`, `COORDINATED-DELIVERY-LEDGER.md`, domain documents and design-system documents before proposing new architecture or duplicate work.

Last updated: **8 September 2026**

## Status meanings

- **DONE / INTEGRATED** — implemented and present on current `main`.
- **VERIFY** — source implementation is present but broader role/device/live-production verification remains.
- **PENDING MERGE** — implementation work exists or is assigned but is not yet authoritative on `main`.
- **SOURCE-GATED** — implementation must wait for verified authoritative external source material.
- **REQUIREMENTS-GATED** — implementation must wait for confirmed requirements.

## Current implementation mode

ScolaPro remains in a backend/domain-first implementation pass. Authoritative operational facts, RLS, effective dating, auditability and reproducible snapshots take precedence over duplicate form-specific stores. UI work should consume those governed foundations rather than recreate them.

## Coordinated roadmap reconciliation

| ID | Area | Status | Current implementation state |
|---|---|---|---|
| N05 | Statutory lifecycle/network review | DONE / INTEGRATED / VERIFY | Governed reporting cycles, readiness, snapshots, certification and read-only network review are integrated. |
| N06 | Fifteenth School Day / AEC mappings | SOURCE-GATED | Current official Ministry source must be verified before field mappings/export logic are published. No guessed field names/codes/definitions. |
| N07 | Operational statutory snapshot coverage | DONE / INTEGRATED / VERIFY | Existing statutory snapshot compiler now reuses canonical staffing establishment, hostel/feeding, education-network and external-school-identifier facts with reference-date and frozen-history semantics. |
| N08 | DNEA readiness | DONE / INTEGRATED / VERIFY | Candidate/readiness foundation and governed review scope are integrated. |
| N09 | Examination centre model | DONE / INTEGRATED / VERIFY | Examination centre is modeled separately from school; designated/external centre handling is supported. |
| N10 | Examination access arrangements | DONE / INTEGRATED / VERIFY | Restricted access-arrangement workflow/evidence boundary is integrated without granting broad network-role detail access. |
| N11 | Coursework/moderation evidence | REQUIREMENTS-GATED | Official subject/evidence requirements must be confirmed before implementation. |
| N12 | Frozen examination registration + governed results ingest | DONE / INTEGRATED / VERIFY | Versioned immutable submission evidence and source-provenanced import staging reuse canonical candidates/subject registrations and the existing `official_results` workflow. |
| N13 | Staffing establishment/vacancies | DONE / INTEGRATED / VERIFY | Effective-dated establishment posts and occupancies reuse canonical staff placements. |
| N14 | Staffing operational reconciliation | DONE / INTEGRATED / VERIFY | As-of establishment/occupied/vacant and linked/unlinked placement aggregates are integrated without exposing named occupancy through the aggregate surface. |
| N15 | Hostel/feeding | DONE / INTEGRATED / VERIFY | Lean hostel/residency and feeding programme/service-day operations are integrated with governed school scope. |
| N16 | Inclusion/SEN aggregate reporting | DONE / INTEGRATED / VERIFY | Privacy-preserving school/network aggregate reporting is integrated; no support-case identities, notes or classifications are exposed through the aggregate surface. |
| N17 | Calendar teaching-impact semantics | DONE / INTEGRATED / VERIFY | NORMAL/NO_TEACHING/PARTIAL_DAY/ALTERED_TIMETABLE/EXAM_TIMETABLE semantics are integrated. |
| N18 | Seasonal/day-specific bell schedules | DONE / INTEGRATED / VERIFY | Effective-dated and day-aware bell schedule resolution is integrated. |
| N19 | Bell schedule fixtures/tests | DONE / INTEGRATED | Summer/winter and weekday fixtures are integrated as tests, not universal school policy. |
| N20 | Control templates/cycles | DONE / INTEGRATED / VERIFY | Governed configurable control-form versioning/lifecycle/RLS/audit foundation is integrated. |
| N21 | Symbol distribution/exam-series comparisons | PENDING MERGE | Do not treat as authoritative until merged. Must reuse canonical official results and existing academic authorization. |
| N24 | Canonical metric registry | PENDING MERGE | Do not create competing metric definitions before the registry implementation is merged. |

## Foundation

| Area | Status | Notes |
|---|---|---|
| Product/domain architecture | DONE | Namibia-first multi-school model, source-of-truth map, role model and core architecture documented. |
| PostgreSQL/Supabase baseline | DONE | Supabase-backed PostgreSQL, source-controlled migrations and RLS baseline established. |
| Authentication | DONE | Authenticated user context includes school/platform memberships and guardian links. |
| Tenant isolation | DONE / VERIFY | RLS plus role-aware authorization and cross-domain scope triggers protect major operational chains. |
| Education-network hierarchy | DONE / INTEGRATED / VERIFY | Authorities/regions/circuits/optional clusters, effective school placement, versioned external identifiers and network memberships are integrated. Network scope does not imply learner/staff-sensitive access. |
| Platform administration | DONE FOUNDATION / VERIFY | Tenant/school onboarding, invitations, feature entitlements, school settings and lifecycle history. |
| Design system | DONE / EVOLVING | UI foundation is stable and shared controls/tokens are used for operational slices. |
| Notifications | DONE FOUNDATION | User-scoped inbox; invitations and published reports create durable notifications. |
| Account profile | DONE FOUNDATION / VERIFY | Avatar, password workspace and account menu implemented. |

## Learner, staff, timetable and attendance

| Area | Status | Notes |
|---|---|---|
| Learner identity / enrolment | DONE FOUNDATION | Long-lived learner identity, stable admission number and effective-dated enrolment. |
| Academic structure | DONE / VERIFY | Configurable grades/classes/subjects with safe correction semantics. |
| Staff identity / school placements | DONE FOUNDATION / VERIFY | Tenant staff identity is separate from Auth accounts; effective-dated school assignments support operational staff without login accounts. |
| Staffing establishment/reconciliation | DONE / INTEGRATED / VERIFY | N13/N14 are integrated and reconcile establishment against canonical effective staff placement/occupancy facts. |
| Timetable | DONE FOUNDATION / VERIFY | Offerings, allocations, periods, rooms and conflict-safe slots. |
| Bell/calendar foundation | DONE / INTEGRATED / VERIFY | N17/N18/N19 plus T04/T05 are integrated, including teaching-impact and date/day-aware schedule resolution. |
| Daily / weekly register | DONE FOUNDATION / VERIFY | Exception-first daily and Monday-Friday weekly capture; mobile capture operational. |
| Subject-period attendance | DONE FOUNDATION / VERIFY | Physically separate from official morning/Ministry attendance. |
| Expected school days | DONE FOUNDATION / VERIFY | Monday-Friday default plus closure/special-day overrides; report/statutory logic preserves expected-vs-recorded semantics. |

## Guardians, parents and onboarding

| Area | Status | Notes |
|---|---|---|
| Guardian identities/relationships | DONE FOUNDATION / VERIFY | Reusable guardian identity with effective-dated learner relationships, contacts and addresses. |
| Parent account claim / portal | DONE FOUNDATION / VERIFY | Exact-email claim and linked-child portal flows remain governed and isolated. |
| Learner/staff/guardian/academic imports | DONE FOUNDATION / VERIFY | CSV/XLSX source-preserving staging/reconciliation and governed commit boundaries are integrated. |

## Learner conduct, support, inclusion and LTSM

| Area | Status | Notes |
|---|---|---|
| Conduct / achievement | DONE / VERIFY | Policy-driven incidents/achievements and governed history are integrated; legacy-category reconciliation remains a follow-up before stricter historical constraints. |
| Learner support | DONE FOUNDATION / VERIFY | Restricted/highly-restricted cases and append-oriented interventions. |
| Inclusion/SEN aggregates | DONE / INTEGRATED / VERIFY | N16 aggregate reporting is integrated without exposing support identities or case details. |
| Resource catalog / loans | DONE FOUNDATION / VERIFY | Shared resources and governed issue/return model. |

## Admissions, examinations, finance and progression

| Area | Status | Notes |
|---|---|---|
| Admission applications / transfers | DONE FOUNDATION / VERIFY | Pre-enrolment and transfer workflows preserve provenance/history. |
| Promotion / year-end progression | DONE FOUNDATION / VERIFY | Versioned deterministic promotion rules and reviewed/approved/locked progression. |
| DNEA readiness | DONE / INTEGRATED / VERIFY | N08 integrated. |
| Examination centres | DONE / INTEGRATED / VERIFY | N09 integrated. |
| Examination access arrangements | DONE / INTEGRATED / VERIFY | N10 integrated with restricted evidence boundaries. |
| Frozen registration/results ingest | DONE / INTEGRATED / VERIFY | N12 integrated; canonical candidate/registration/result truth remains authoritative. |
| Coursework/moderation evidence | REQUIREMENTS-GATED | N11 remains blocked until official requirements are established. |
| Finance basics | DONE FOUNDATION / VERIFY | Charge types, invoices, payments and governed allocation; intentionally not a full ERP. |

## Academic assessment and report cards

| Area | Status | Notes |
|---|---|---|
| Assessment schemes/components | DONE FOUNDATION / VERIFY | Versioned schemes support detailed and final-result capture. |
| Working marks / moderation / calculation | DONE FOUNDATION / VERIFY | Append-only working evidence, governed review and deterministic calculation preserve provenance. |
| Official results | DONE FOUNDATION / VERIFY | Approved immutable results remain the canonical authoritative result store. |
| Report-card snapshots / certification / publication | DONE FOUNDATION / VERIFY | Immutable result/report history and guardian publication boundaries remain integrated. |
| Durable bulk PDF/document workflow | DONE CURRENT PASS / VERIFY | Existing report-card/document lane remains preserved and outside unrelated roadmap work. |
| N21 result analytics/comparisons | PENDING MERGE | Must not be marked integrated until merged. |

## Statutory / EMIS

| Area | Status | Notes |
|---|---|---|
| Form registry / cycles | DONE FOUNDATION / VERIFY | Effective-dated definitions, form versions and school reporting cycles. |
| Operational snapshots | DONE / INTEGRATED / VERIFY | N07 extends the existing fixed-reference snapshot generator with canonical operational staffing, hostel/feeding and network/reference facts; no second statutory fact store. |
| Readiness / certification / network review | DONE / INTEGRATED / VERIFY | N05 lifecycle and read-only network review are integrated. |
| Generic mapping compiler | DONE FOUNDATION / VERIFY | Declarative `source_path → target_path` compiler validates required values/types without inventing Ministry fields. |
| Authoritative EMIS/AEC mappings | SOURCE-GATED | N06 remains blocked pending verified current official source material. |

## Structural operations

| Area | Status | Notes |
|---|---|---|
| Staffing establishment | DONE / INTEGRATED / VERIFY | N13 integrated. |
| Staffing operational reconciliation | DONE / INTEGRATED / VERIFY | N14 integrated. |
| Hostel/feeding | DONE / INTEGRATED / VERIFY | N15 integrated. |
| Inclusion aggregate reporting | DONE / INTEGRATED / VERIFY | N16 integrated with privacy-preserving boundaries. |
| Control forms | DONE / INTEGRATED / VERIFY | N20 integrated with versioning, RLS and audit coverage. |

## Production migration/runtime drift

**OPEN / UNRESOLVED.** Source-controlled migrations on `main` are not proof that every production/shared environment has applied them.

The runtime audit previously identified missing database objects affecting at least:

- School Settings
- CRC Custody
- Academic Setup

The same class of drift may affect other routes whose runtime RPC/table dependencies are newer than the deployed database state.

Until deployment verification closes this gap:

- do not add UI fallbacks that hide missing database objects;
- do not treat generated DB types as deployment authority;
- apply migrations in repository order through the designated deployment path;
- verify affected production routes against the deployed database after migration application;
- keep those routes in VERIFY even when source implementation is complete.

## Current core workflow summaries

Attendance: `day/week → class scope → expected school day → default present → exceptions/evidence → auditable confirmation/revision`

Staff: `tenant staff identity → effective school placement → staffing establishment/occupancy where applicable → optional account membership → operational use → effective-dated end without deleting history`

Assessment: `versioned scheme → assessment instance → append-only marks → review → deterministic result → immutable official result`

Examinations: `cycle/candidate/subject registration → readiness/centre/access checks → frozen registration submission version → source-provenanced external result staging → governed promotion into official results`

Statutory: `versioned authoritative form → cycle/reference date → operational snapshot from canonical sources → generic mapping/readiness → certification → form-specific export only when authoritative mapping exists`

## Approved next implementation sequence

1. **Governance/integration discipline** — keep `CONTROL-ROOM.md`, `COORDINATED-DELIVERY-LEDGER.md` and this status file synchronized with merged `main`.
2. **N21** — remains pending until its implementation PR is merged; downstream work must not assume it is integrated beforehand.
3. **Canonical metric registry** — remains pending until merged; avoid competing metric definitions.
4. **Production migration drift closure** — apply/verify source-controlled migrations in the production/shared environment and retest affected routes.
5. **N06** — proceed only after verified current Ministry source material is available.
6. **N11** — proceed only after official coursework/moderation evidence requirements are confirmed.
7. **Broader role/device/live-data QA** across integrated foundations after deployment state is current.

## Security / advisor notes

- School operational, education-network and platform scopes remain distinct.
- Network membership never grants automatic learner/staff/support/examination-sensitive access.
- Aggregation and `SECURITY DEFINER` functions must not become authorization bypasses.
- Certified/frozen historical records must not be recomputed from later live data.
- Official external codes/identifiers are source facts and must never be invented.
- Import staging is not an authoritative second truth store.
- Provider secrets stay outside domain records.

## Takeover rule

Before beginning work, inspect current `main`, `AGENTS.md`, `CONTROL-ROOM.md`, `COORDINATED-DELIVERY-LEDGER.md` and this file. Do not recreate integrated N05/N07/N08/N09/N10/N12/N13/N14/N15/N16/N17/N18/N19/N20 foundations. Preserve N06 source gating, N11 requirements gating, N21 pending-merge status, canonical metric registry pending-merge status, and the distinction between source integration and unresolved production migration application.
