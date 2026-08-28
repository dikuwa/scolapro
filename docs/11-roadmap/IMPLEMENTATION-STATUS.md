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
| Notifications | DONE FOUNDATION | User-scoped inbox exists; invitations and published report cards now create durable domain notifications. |
| Account profile | DONE FOUNDATION / VERIFY | Avatar, password workspace and account menu implemented. |
| Calendar | DONE FOUNDATION / VERIFY | Academic year/term and expected-school-day overrides exist. |

## Learner, structure, timetable and attendance

| Area | Status | Notes |
|---|---|---|
| Learner identity / enrolment | DONE FOUNDATION | Long-lived learner identity, stable school admission number and effective-dated school enrolment exist. |
| Academic structure | DONE / VERIFY | Grades/classes configurable; uppercase codes; safe class correction/deletion. |
| Staff | DONE FOUNDATION | Staff identities, memberships and scoped data access exist. |
| Timetable | DONE FOUNDATION / VERIFY | Subjects, offerings, teacher allocations, periods and conflict-safe slots exist. |
| Timetable → lesson attendance | DONE FOUNDATION / VERIFY | Scheduled teaching slots link directly to the separate subject-period attendance workflow. |
| Attendance events | DONE FOUNDATION | Append-only attendance observations exist. |
| Daily / weekly register | DONE FOUNDATION / VERIFY | Exception-first daily and Monday-Friday weekly capture exist; mobile capture is operational. |
| Attendance evidence | DONE FOUNDATION / VERIFY | Private evidence metadata/storage and mobile camera capture exist. |
| Attendance class scope | DONE FOUNDATION / VERIFY | Teachers/class teachers are limited to register classes they own or are allocated to; leaders/HOD retain support scope. |
| Subject-period attendance | DONE FOUNDATION / VERIFY | Lesson attendance is separate from official morning/Ministry attendance and is entered from timetable slots. |
| Late arrival / detention | DONE FOUNDATION / VERIFY | Delegated late-coming workflow is separate from statutory attendance; 3 late arrivals/week can create Friday detention obligations with carry-over. |
| Expected school days | DONE FOUNDATION / VERIFY | Monday-Friday default plus explicit closure/special-day overrides. |

## Guardians, parents and learner onboarding

| Area | Status | Notes |
|---|---|---|
| Guardian identities | DONE FOUNDATION / VERIFY | Guardian is a reusable tenant person identity, not repeated fields embedded in each learner. |
| Learner guardian relationships | DONE FOUNDATION / VERIFY | Effective-dated legal/emergency/pickup relationships and contact history exist. |
| Sibling guardian reuse | DONE FOUNDATION / VERIFY | Existing guardian identities can be linked to another learner without duplicating the parent/guardian. |
| Parent account claim | DONE DB FOUNDATION / VERIFY | Authenticated account may claim a guardian profile only when its Auth email matches an active guardian email contact. |
| Parent portal | NEXT | Child-switching parent experience and published report consumption still need the dedicated role UI. |
| Learner CSV import | DONE FOUNDATION / VERIFY | Staging, validation, review and atomic create/skip commit path exist. |
| Import reconciliation | DONE FOUNDATION / VERIFY | Admission number, national ID and birth-certificate matches are deterministic; names alone never silently merge. Conflicting identifiers block the row. |
| XLSX / broader imports | PLANNED | Add only with a deliberate dependency and the same staging/reconciliation rules. |

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
| Delivery outbox/jobs | DONE FOUNDATION / VERIFY | Queue now materializes provider-neutral recipient jobs with claim/retry/dead-letter lifecycle; worker RPCs are service-role only. |
| Provider adapters | NEXT | Actual MTC/Telecom/email/WhatsApp transport adapters and credentials remain external worker integrations. Secrets must never enter canonical communication tables. |

## Admissions, transfers and progression

| Area | Status | Notes |
|---|---|---|
| Admission applications | DONE FOUNDATION / VERIFY | Pre-enrolment workflow remains separate from authoritative learner identity. |
| Transfers | DONE FOUNDATION / VERIFY | Source provenance preserved; source enrolment closes as transferred rather than being rewritten. |
| Year-end progression | DONE FOUNDATION / VERIFY | Version-aware outcome record supports reviewed/approved/locked lifecycle. |
| Promotion rule sets | DONE FOUNDATION / VERIFY | Versioned grade/year rule sets and explicit conditions exist without hard-coding Namibia rules. |
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

## Academic assessment, official results and reports

| Area | Status | Notes |
|---|---|---|
| Assessment schemes/components | DONE FOUNDATION / VERIFY | Versioned schemes support detailed and final-result capture plus task/test/practical/project/oral/exam components. |
| Assessment instances | DONE FOUNDATION / VERIFY | Class/teacher-allocation scoped operational assessment records. |
| Working marks | DONE FOUNDATION / VERIFY | Append-only revisions; numeric values remain distinct from absent/exempt/incomplete/withheld statuses. |
| Mark submission/moderation | DONE FOUNDATION / VERIFY | Complete-class submission, HOD/leader return-or-verify workflow and lock transitions have governed RPCs. |
| Grading scales | DONE FOUNDATION / VERIFY | Versioned grading scales/bands are explicit and separate from assessment schemes. |
| Deterministic calculation | DONE FOUNDATION / VERIFY | Weighted explainable subject-result calculation preserves component inputs and never silently turns missing/absent required evidence into zero. |
| Official results | DONE FOUNDATION / VERIFY | Approval requires verified contributing assessments and an active grading scale; immutable result snapshots carry calculation/scheme/grading provenance. |
| Report-card snapshots | DONE FOUNDATION / VERIFY | Term report snapshots are generated only from approved official results and preserve result/rule/template/attendance provenance. |
| Report-card certification | DONE FOUNDATION / VERIFY | Draft snapshots require governed certification; regenerated versions never overwrite historical snapshots. |
| Report-card publication | DONE FOUNDATION / VERIFY | Certified snapshots can be published; linked guardian accounts receive read access only to published reports plus a durable notification. |
| Print/PDF report renderer | NEXT | Dedicated official print/PDF templates must consume certified/published snapshots rather than live page state. |

## Curriculum and teaching planning

| Area | Status | Notes |
|---|---|---|
| NIED source registry | DONE FOUNDATION / VERIFY | Source provenance, checksums/status and authority metadata have physical persistence. |
| Curriculum subjects/versions | DONE FOUNDATION / VERIFY | Versioned official curriculum registry supports effective years and governed publication states. |
| Units/objectives/competencies/practicals | DONE FOUNDATION / VERIFY | Structured curriculum content has first-class persistence. |
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
| Operational source generator | DONE FOUNDATION / VERIFY | Fixed-date snapshot derives learner totals/sex/age/grade/class, staffing/teacher workload, attendance readiness and LTSM counts from live source tables. |
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

Lesson attendance:
`Timetable slot → allocated teacher/class roster → default present → subject-period exceptions → separate auditable lesson record`

Assessment:
`Versioned scheme → assessment instance → append-only marks → complete-class submission → HOD/leader return or verify → deterministic weighted result → grading band → immutable official result`

Report cards:
`Approved official results → immutable report snapshot → certify exact version → publish exact version → guardian access/notification → dedicated print/PDF renderer`

Progression:
`Locked official results + active versioned promotion rules → explainable evaluation → reviewed progression → governed approval/lock`

Curriculum/planning:
`Verified NIED source → curriculum version → units/objectives/competencies → school overlay → pacing → class teaching schedule → lesson prep → actual teaching/coverage`

Statutory:
`Versioned form → reporting cycle/reference date → live operational source generator → numbered provisional snapshot → readiness → certification → later form-specific export/submission`

Imports:
`CSV → source-preserving staging → structural validation → stable-identifier reconciliation → human review of matches → ready batch → atomic governed commit → audit`

Communications:
`Provider-independent message → recipients → queue → delivery outbox → service worker/provider adapter → delivered/retry/dead state`

## Approved next implementation sequence

1. **CI/database closure for the current reporting/guardian/import/outbox bulk**, including fresh-database migration reconstruction and advisor review.
2. **Parent portal foundation**: child switching, published report consumption, attendance/results visibility and guardian-scoped navigation.
3. **Report-card document renderer** using certified/published snapshots, not live database recomputation.
4. **Import reconciliation expansion** only where deterministic rules exist; no name-only merge. Add broader staff/guardian/academic-structure import commits later.
5. **Communication provider adapter worker** with provider secrets outside PostgreSQL; actual Namibia SMS/email/WhatsApp provider choice remains configuration/integration work.
6. **Form-specific EMIS/AEC mapping framework** and readiness validators once authoritative current Ministry form definitions are loaded.
7. **RLS/performance hardening and cross-domain invalid-write fixtures** across remaining high-value tables.
8. Consolidated application information architecture, responsive QA and UI refinement once the remaining operational slices are stable.

## Takeover rule

Before beginning work, inspect the repository and this document. Do not recreate completed schema, replace established token systems, hard-code tenant modes, invent new colors, bypass the existing authorization architecture, merge learner identities by name, or expose provider secrets in domain tables. Continue from the first **IN PROGRESS** or **NEXT** item that matches the requested feature.
