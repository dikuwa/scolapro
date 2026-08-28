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
| Tenant isolation | DONE / HARDENING | RLS plus role-aware authorization. Cross-table tenant/school scope triggers now protect major assessment, LTSM, communications, DNEA, finance, statutory, transfer and progression chains. |
| Physical indexes | DONE CURRENT PASS / VERIFY | High-value foreign-key/query indexes added across core and newly introduced operational domains. |
| Platform administration | DONE FOUNDATION / VERIFY | Tenant/school onboarding, invitations, feature entitlements, school settings and tenant lifecycle history. |
| Design system | DONE / EVOLVING | UI foundation is intentionally frozen except where operational implementation requires controls. |
| Notifications | DONE FOUNDATION | User-scoped inbox and first domain producer exist. |
| Account profile | DONE FOUNDATION / VERIFY | Avatar and password workspace implemented. |
| Calendar | DONE FOUNDATION / VERIFY | Academic year/term and expected-school-day overrides exist. |

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
| Learner support cases | DONE FOUNDATION / VERIFY | Restricted/highly-restricted cases use narrower permissions. |
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
| Provider adapters | NEXT | Actual transport integrations remain provider adapters/jobs. |

## Admissions, transfers and progression

| Area | Status | Notes |
|---|---|---|
| Admission applications | DONE FOUNDATION / VERIFY | Pre-enrolment workflow remains separate from authoritative learner identity. |
| Transfers | DONE FOUNDATION / VERIFY | Source provenance preserved; source enrolment closes as transferred rather than being rewritten. |
| Year-end progression | DONE FOUNDATION / VERIFY | Version-aware outcome record supports reviewed/approved/locked lifecycle. |
| Promotion rule sets | DONE FOUNDATION / VERIFY | Versioned grade/year rule sets and explicit conditions now exist without hard-coding Namibia rules. |
| Promotion evaluation | DONE FOUNDATION / VERIFY | Explainable deterministic recommendations can evaluate configured subject/pass/fail/average/attendance conditions and generate reviewed progression records. |

## DNEA / examinations

| Area | Status | Notes |
|---|---|---|
| Examination cycles | DONE FOUNDATION / VERIFY | School examination cycle model exists. |
| Candidate registration | DONE FOUNDATION / VERIFY | Candidate identity links to authoritative learner/enrolment. |
| Subject registration | DONE FOUNDATION / VERIFY | Official subject codes preserved and may map to school subject offerings. |
| Readiness issues | DONE FOUNDATION / VERIFY | Regenerable identity/no-subject/mapping validations. |

## Finance basics

| Area | Status | Notes |
|---|---|---|
| Charge types | DONE FOUNDATION / VERIFY | School-defined charge catalog. |
| Invoices / lines | DONE FOUNDATION / VERIFY | Basic NAD school billing; intentionally not a full ERP. |
| Payments | DONE FOUNDATION / VERIFY | Bank transfer/cash/card/mobile/other with references and optional proof path. |
| Payment allocation | DONE FOUNDATION / VERIFY | Verified payments allocate atomically to compatible invoices with auditable balance recalculation. |

## Academic assessment and official results

| Area | Status | Notes |
|---|---|---|
| Assessment schemes/components | DONE FOUNDATION / VERIFY | Versioned schemes support detailed and final-result capture plus task/test/practical/project/oral/exam components. |
| Assessment instances | DONE FOUNDATION / VERIFY | Class/teacher-allocation scoped operational assessment records. |
| Working marks | DONE FOUNDATION / VERIFY | Append-only revisions; numeric values remain distinct from absent/exempt/incomplete/withheld statuses. |
| Mark submission/moderation | DONE FOUNDATION / VERIFY | Complete-class submission, HOD/leader return-or-verify workflow and lock transitions now have governed RPCs. |
| Grading scales | DONE FOUNDATION / VERIFY | Versioned grading scales/bands are explicit and separate from assessment schemes. |
| Deterministic calculation | DONE FOUNDATION / VERIFY | Weighted explainable subject-result calculation preserves component inputs and never silently turns missing/absent required evidence into zero. |
| Official results | DONE FOUNDATION / VERIFY | Approval requires verified contributing assessments and an active grading scale; immutable result snapshots carry calculation/scheme/grading provenance. |

## Curriculum and teaching planning

| Area | Status | Notes |
|---|---|---|
| NIED source registry | DONE FOUNDATION / VERIFY | Source provenance, checksums/status and authority metadata have physical persistence. |
| Curriculum subjects/versions | DONE FOUNDATION / VERIFY | Versioned official curriculum registry supports effective years and governed publication states. |
| Units/objectives/competencies/practicals | DONE FOUNDATION / VERIFY | Structured curriculum content now has first-class persistence. |
| School curriculum overlays | DONE FOUNDATION / VERIFY | School/year operational configuration remains separate from official curriculum content. |
| Pacing plans/items | DONE FOUNDATION / VERIFY | National/department/class plan levels connect curriculum to planned periods and dates. |
| Teaching schedule | DONE FOUNDATION / VERIFY | Class/teacher-allocation schedule items preserve original planned dates and move/cancel state. |
| Lesson preparation | DONE FOUNDATION / VERIFY | Curriculum snapshot is separated from teacher/AI-developed preparation content. |
| Teaching actuals/coverage | DONE FOUNDATION / VERIFY | Actual taught date, periods used, coverage state, reflection and compensatory action are stored separately from planning. |

## Statutory / EMIS

| Area | Status | Notes |
|---|---|---|
| Form registry | DONE FOUNDATION / VERIFY | Definitions and effective-dated form versions preserve source/mapping/validation schemas. |
| Reporting cycles | DONE FOUNDATION / VERIFY | School, academic year, form version and reference date explicit. |
| Snapshots/readiness/certification | DONE FOUNDATION / VERIFY | Numbered snapshots, blocking/warning issues and principal/admin certification exist. |
| Operational source generator | DONE FOUNDATION / VERIFY | Fixed-date snapshot now derives learner totals/sex/age/grade/class, staffing/teacher workload, attendance readiness and LTSM counts from live source tables. |
| Form-specific EMIS/AEC mapping | NEXT | Versioned field mappings for actual current Ministry forms still need authoritative form definitions and mapping rules. |

## Tenant configuration

| Area | Status | Notes |
|---|---|---|
| Tenant feature entitlements | DONE FOUNDATION / VERIFY | Effective-dated feature keys/config replace hard-coded tenant modes. |
| School settings | DONE FOUNDATION / VERIFY | Operational settings stay separate from tenant entitlements/domain data. |
| Tenant lifecycle history | DONE FOUNDATION / VERIFY | Platform lifecycle events are append-oriented. |

## Current core workflows

Attendance:
`Day/week → class scope → expected school day → default present → exceptions/evidence → auditable confirmation/revision`

Assessment:
`Versioned scheme → assessment instance → append-only marks → complete-class submission → HOD/leader return or verify → deterministic weighted result → grading band → immutable official result`

Progression:
`Locked official results + active versioned promotion rules → explainable evaluation → reviewed progression → governed approval/lock`

Curriculum/planning:
`Verified NIED source → curriculum version → units/objectives/competencies → school overlay → pacing → class teaching schedule → lesson prep → actual teaching/coverage`

Statutory:
`Versioned form → reporting cycle/reference date → live operational source generator → numbered provisional snapshot → readiness → certification → later form-specific export/submission`

## Approved next implementation sequence

1. **RLS/performance hardening**: reduce overlapping permissive policies and convert direct policy `auth.uid()` calls to init-plan-safe `(select auth.uid())` where appropriate.
2. **Cross-domain integrity expansion** for curriculum/planning/promotion plus additional pgTAP fixtures exercising invalid cross-school writes.
3. **Form-specific EMIS/AEC mapping framework** and readiness validators once authoritative current form definitions are loaded.
4. **Assessment/report-card snapshots** and term/year report generation persistence.
5. **Parent/guardian relationships and contact-history physical model** to support communication, admissions and report delivery cleanly.
6. **Communication provider adapters/jobs** after canonical recipients and guardian/contact sources are stable.
7. Consolidated application information architecture, navigation, responsive QA and UI refinement after the remaining backend passes.

## Takeover rule

Before beginning work, inspect the repository and this document. Do not recreate completed schema, replace established token systems, hard-code tenant modes, invent new colors, or bypass the existing authorization architecture. Continue from the first **IN PROGRESS** or **NEXT** item that matches the requested feature.
