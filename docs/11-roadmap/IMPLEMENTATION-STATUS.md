# ScolaPro Implementation Status

> **Living handoff document.** Update this file whenever a meaningful implementation slice is completed or materially changes. Any developer or AI taking over ScolaPro should read this file, `ARCHITECTURE-ROADMAP.md`, the domain documents and the design-system documents before proposing new architecture or starting duplicate work.

Last updated: **28 August 2026**

## How to use this document

Statuses:

- **DONE** — implemented and integrated into the current codebase.
- **IN PROGRESS** — architecture exists and implementation is actively advancing.
- **NEXT** — approved next implementation target.
- **PLANNED** — architecture/design defined but implementation has not reached the operational slice yet.
- **VERIFY** — implemented but still needs broader role/device/real-data QA.

## Current implementation mode

The project is intentionally in a **backend/domain bulk implementation pass**. Avoid spending cycles on visual polish while the remaining core modules are being established. UI refinement will be handled as a later consolidated pass once the operational foundations are complete.

## Foundation

| Area | Status | Notes |
|---|---|---|
| Product/domain architecture | DONE | Namibia-first multi-school model, source-of-truth map, role model and core architecture documented. |
| PostgreSQL/Supabase baseline | DONE | Supabase-backed PostgreSQL, source-controlled migrations and RLS baseline established. |
| Authentication | DONE | Authenticated user context with school/platform memberships. |
| Tenant isolation | DONE | RLS and role-aware authorization helpers; dedicated database isolation tests exist. |
| Platform administration | DONE FOUNDATION / VERIFY | Tenant/school onboarding, governed invitations, tenant feature entitlements, school settings and tenant lifecycle history now have persistent foundations. |
| Design system | DONE / EVOLVING | Existing UI foundation remains frozen for now except where operational work requires functional controls. |
| Persistent notifications | DONE FOUNDATION | User-scoped inbox and first domain producer exist. |
| Account profile | DONE FOUNDATION / VERIFY | Avatar and password workspace implemented. |
| Calendar | DONE FOUNDATION / VERIFY | Academic year/term plus explicit expected-school-day overrides exist. |

## Learner, structure, timetable and attendance

| Area | Status | Notes |
|---|---|---|
| Learner identity / enrolment | DONE FOUNDATION | Long-lived learner identity and effective-dated school enrolment exist. |
| Academic structure | DONE / VERIFY | Grades/classes configurable; uppercase codes; safe class correction/deletion. |
| Staff | DONE FOUNDATION | Staff identities, memberships and scoped data access exist. |
| Timetable | DONE FOUNDATION / VERIFY | Subjects, offerings, teacher allocations, periods and conflict-safe slots exist. |
| Attendance events | DONE FOUNDATION | Append-only attendance observations exist. |
| Daily / weekly register | DONE FOUNDATION / VERIFY | Exception-first daily and Monday-Friday weekly capture exist. |
| Attendance evidence | DONE FOUNDATION / VERIFY | Private evidence metadata/storage foundation exists. |
| Attendance class scope | DONE FOUNDATION / VERIFY | Teachers/class teachers are limited to register classes they own or are allocated to; leaders/HOD retain support scope. |
| Expected school days | DONE FOUNDATION / VERIFY | Monday-Friday default plus explicit closure/special-day overrides. |

## Learner conduct, achievement and support

| Area | Status | Notes |
|---|---|---|
| Conduct events | DONE FOUNDATION / VERIFY | Positive and negative longitudinal events with severity/status. |
| Achievement events | DONE FOUNDATION / VERIFY | Separate positive achievement history with evidence reference. |
| Learner support cases | DONE FOUNDATION / VERIFY | Restricted/highly-restricted case records use narrower permissions. |
| Support interventions | DONE FOUNDATION / VERIFY | Append-oriented intervention/review history. |

## LTSM / textbooks / library

| Area | Status | Notes |
|---|---|---|
| Resource catalog | DONE FOUNDATION / VERIFY | Shared titles support textbooks, library books, resources and devices. |
| Tracked copies | DONE FOUNDATION / VERIFY | Barcode/asset, condition, location and availability. |
| Loans | DONE FOUNDATION / VERIFY | Learner/staff borrowing with one-open-loan-per-copy protection. |
| Issue / return | DONE FOUNDATION / VERIFY | Governed audited transactions update copy state atomically. |

## Communications

| Area | Status | Notes |
|---|---|---|
| Message model | DONE FOUNDATION / VERIFY | Provider-independent app/email/SMS/WhatsApp/letter intent. |
| Recipient / delivery model | DONE FOUNDATION / VERIFY | Delivery state is separate from domain records. |
| Queue transition | DONE FOUNDATION / VERIFY | Draft must have recipients before queueing; transition audited. |
| Provider adapters | NEXT | SMS/WhatsApp/email jobs/integrations remain adapters rather than sources of truth. |

## Admissions, transfers and progression

| Area | Status | Notes |
|---|---|---|
| Admission applications | DONE FOUNDATION / VERIFY | Pre-enrolment application workflow stays separate from authoritative learner identity. |
| Transfers | DONE FOUNDATION / VERIFY | Source provenance preserved; source enrolment closes as transferred rather than being rewritten. |
| Year-end progression | DONE FOUNDATION / VERIFY | Version-aware outcome record supports reviewed/approved/locked lifecycle. |
| Promotion engine integration | NEXT | Versioned academic rules must generate deterministic progression outcomes. |

## DNEA / examinations

| Area | Status | Notes |
|---|---|---|
| Examination cycles | DONE FOUNDATION / VERIFY | Version-neutral school examination cycle model exists. |
| Candidate registration | DONE FOUNDATION / VERIFY | Candidate identity is linked to authoritative learner/enrolment rather than duplicated. |
| Subject registration | DONE FOUNDATION / VERIFY | Official subject codes are preserved and may map to school subject offerings. |
| Readiness issues | DONE FOUNDATION / VERIFY | Regenerable identity/no-subject/mapping validation issues make readiness exception-driven. |

## Finance basics

| Area | Status | Notes |
|---|---|---|
| Charge types | DONE FOUNDATION / VERIFY | School-defined charge catalog exists. |
| Invoices / lines | DONE FOUNDATION / VERIFY | Basic NAD school billing model; explicitly not a general ledger/ERP. |
| Payments | DONE FOUNDATION / VERIFY | Bank transfer/cash/card/mobile/other with references and optional proof path. |
| Payment allocation | DONE FOUNDATION / VERIFY | Only verified payments allocate to compatible invoices; balances recalculate atomically and remain auditable. |

## Academic assessment and official results

| Area | Status | Notes |
|---|---|---|
| Assessment schemes | DONE FOUNDATION / VERIFY | Versioned subject-offering schemes support detailed and final-result capture modes. |
| Assessment components | DONE FOUNDATION / VERIFY | Tasks/tests/practicals/projects/orals/exam papers/final result components supported. |
| Assessment instances | DONE FOUNDATION / VERIFY | Class/teacher-allocation scoped operational assessment records exist. |
| Working marks | DONE FOUNDATION / VERIFY | Append-only revisions; numeric value and absent/exempt/incomplete/withheld status are separate. |
| Mark submissions | DONE FOUNDATION / VERIFY | Submitted/returned/verified/locked review persistence exists. |
| Official results | DONE FOUNDATION / VERIFY | Approved locked result snapshots preserve assessment-scheme and academic-rule version provenance. |
| Calculation / moderation services | NEXT | Deterministic calculation and lifecycle RPC/service layer still needs to connect scheme configuration to official result creation. |

## Statutory / EMIS

| Area | Status | Notes |
|---|---|---|
| Form registry | DONE FOUNDATION / VERIFY | Form definitions and effective-dated versions preserve source/mapping/validation schemas. |
| Reporting cycles | DONE FOUNDATION / VERIFY | School, academic year, version and fixed reference date are explicit. |
| Snapshots | DONE FOUNDATION / VERIFY | Generated statutory values are separated from changing live data. |
| Readiness issues | DONE FOUNDATION / VERIFY | Blocking/warning/info exceptions have a governed lifecycle. |
| Certification | DONE FOUNDATION / VERIFY | Principal/school-admin certification binds a role, user and timestamp to one snapshot; blocking issues prevent certification. |
| Actual EMIS/AEC generators | NEXT | Source-to-form aggregation logic must now be implemented from enrolment, attendance, staff, timetable, LTSM and support data. |

## Tenant configuration

| Area | Status | Notes |
|---|---|---|
| Tenant feature entitlements | DONE FOUNDATION / VERIFY | Effective-dated feature keys/config replace hard-coded tenant modes. |
| School settings | DONE FOUNDATION / VERIFY | School operational settings are separate from tenant entitlements and domain records. |
| Tenant lifecycle history | DONE FOUNDATION / VERIFY | Platform lifecycle events are append-oriented. |

## Existing UI/UX corrections

Existing shared UI corrections remain in place, but new modules should not receive heavy visual polish until the consolidated UI pass. ScolaPro-owned controls, hierarchy, sticky shell, contextual metrics, uppercase codes and safe destructive-action rules remain mandatory.

## Current core workflows

Attendance:
`Day or week → class-scoped authorization → expected school-day validation → default present → explicit exceptions → evidence where needed → auditable confirmation/revision`

LTSM:
`Catalog title → tracked copy → issue → open loan → return/lost/damaged → copy state + audit`

Transfer:
`Current enrolment → transfer request → governed completion → source enrolment closed → receiving school appends its own enrolment`

Assessment:
`Versioned scheme → assessment instance → append-only working marks → submission → HOD/leader review → locked official result snapshot`

Statutory:
`Versioned form → reporting cycle/reference date → generated snapshot → readiness exceptions → principal certification → later submission/export`

## Approved next implementation sequence

1. **Physical data-model hardening** across the newly added modules: composite tenant/school integrity, narrower write guards, index review and security tests.
2. **Assessment calculation/moderation RPCs** and deterministic official-result creation from approved scheme/rule versions.
3. **Promotion engine integration** into `year_end_progressions`.
4. **EMIS/AEC source generators** beginning with enrolment/class/staff/attendance/LTSM readiness metrics.
5. **Curriculum registry physical persistence** and NIED source/version/provenance tables.
6. **Teaching-planning persistence** for pacing plans, teaching schedule items, lesson preparations, actual teaching and coverage.
7. **Communication provider adapters/jobs** after the canonical communications layer is stable.
8. Consolidated navigation, information architecture, responsive QA and UI refinement after core domain implementation.

## Takeover rule

Before beginning work, inspect the repository and this document. Do not recreate completed schema, replace established token systems, hard-code tenant modes, invent new colors, or bypass the existing authorization architecture. Continue from the first **IN PROGRESS** or **NEXT** item that matches the requested feature.
