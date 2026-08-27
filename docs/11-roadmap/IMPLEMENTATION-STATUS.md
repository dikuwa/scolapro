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
| Platform administration | IN PROGRESS | Tenant/school onboarding and governed school-user invitations implemented. |
| Design system | DONE / EVOLVING | Plus Jakarta Sans, spacing/radius/surface tokens, soft borders, contextual accents, hierarchy utilities, shared picker/time controls and CTA motion. |
| Loading system | DONE | Structural skeletons plus centered global shadcn-style Spinner; no loading text is required for normal route transitions. |
| Persistent notifications | DONE FOUNDATION | User-scoped inbox, unread count, mark-all-read and clear actions are wired into the app shell. Invitation acceptance is the first database-driven notification producer. |
| Account profile | DONE FOUNDATION / VERIFY | Avatar storage/upload/remove and password workspace implemented. File input is custom-styled and avatar selection previews instantly. `must_change_password` exists for first-login governance. |
| Calendar route | DONE FOUNDATION | Role-aware `/calendar` page now uses academic-year/term data instead of returning a 404. |

## First operational vertical slice

| Area | Status | Notes |
|---|---|---|
| Learner identity | DONE FOUNDATION | Core learner identity model and secure registration workflow implemented. |
| Enrolment | DONE FOUNDATION | School/year enrolment model, integrity constraints and audit-safe registration RPC. |
| Academic structure | DONE / VERIFY | Grades and register classes configurable by school admin; identifiers normalize uppercase. Register classes can be corrected and safely deleted only while unused. |
| School calendar | DONE FOUNDATION | Academic-year/term schema plus explicit school-day overrides now support normal weekdays, closures and approved special school days. |
| Staff | DONE FOUNDATION | Staff model, directory and role-aware data-scope hardening exist. |
| Invitations | DONE / VERIFY | Platform admin can choose authorized schools; school admin is limited to active school-admin scope. |

## Timetable and attendance slice

| Area | Status | Notes |
|---|---|---|
| Subjects / subject offerings | DONE / VERIFY | Schema plus governed school-admin UI/RPCs. Subject codes normalize uppercase. |
| Teacher allocations | DONE FOUNDATION / VERIFY | Canonical teacher-to-subject-to-class allocation is the scheduling source of truth and is reused across timetable/marks/planning/workload. |
| Timetable periods | DONE FOUNDATION / VERIFY | Numbered teaching periods and optional times exist. |
| Timetable slots | IN PROGRESS / VERIFY | Conflict-safe slot creation is implemented; database constraints prevent class/teacher double booking. |
| Timetable role views | IN PROGRESS / VERIFY | Leadership sees school timetable; linked teachers/class teachers see allocated slots. |
| Attendance events | DONE FOUNDATION | Date-aware append-only attendance events and reason registry exist. |
| Daily register | DONE FOUNDATION / VERIFY | Exception-first daily capture, auditable revisions and optional private evidence are implemented. |
| Weekly register | DONE FOUNDATION / VERIFY | Monday-Friday grid capture is implemented with atomic daily submissions. |
| Attendance evidence | DONE FOUNDATION / VERIFY | Private evidence storage and RLS-backed metadata exist. |
| Attendance class scope | DONE FOUNDATION / VERIFY | Leaders/HODs retain operational support scope while ordinary teacher/class-teacher attendance capture is limited to register classes they own or are allocated to. |
| Expected school days | DONE FOUNDATION / VERIFY | Monday-Friday is the default; explicit school-day overrides support holidays/closures and exceptional weekend school days without corrupting attendance calculations. |

## Learner conduct, achievement and support

| Area | Status | Notes |
|---|---|---|
| Conduct events | DONE FOUNDATION / VERIFY | Positive and negative conduct events are longitudinal records with severity/status rather than a single points balance. |
| Achievement events | DONE FOUNDATION / VERIFY | Achievement history is separate from discipline and supports school-to-international levels plus evidence references. |
| Learner support cases | DONE FOUNDATION / VERIFY | Restricted/highly-restricted support cases exist with narrower RLS than normal learner records. |
| Support interventions | DONE FOUNDATION / VERIFY | Append-oriented intervention/review notes are attached to cases with restricted access. |

## LTSM / textbooks / library

| Area | Status | Notes |
|---|---|---|
| Resource titles | DONE FOUNDATION / VERIFY | Shared catalog supports textbooks, library books, teacher resources, devices and other resource types. |
| Resource copies | DONE FOUNDATION / VERIFY | Barcode/asset identity, condition, location and availability are modeled. |
| Loans | DONE FOUNDATION / VERIFY | Learner/staff borrowing history exists with one-open-loan-per-copy protection. |
| Issue / return transactions | DONE FOUNDATION / VERIFY | Governed RPCs atomically update loan history and copy availability/condition with audit events. |

## Communications

| Area | Status | Notes |
|---|---|---|
| Provider-independent message model | DONE FOUNDATION / VERIFY | App/email/SMS/WhatsApp/letter intent is stored separately from delivery provider implementation. |
| Recipient/delivery model | DONE FOUNDATION / VERIFY | Individual/custom recipients and delivery status are modeled without coupling domain records to providers. |
| Queue transition | DONE FOUNDATION / VERIFY | Draft messages require recipients before they can be queued; queuing is audited. |
| Provider adapters | NEXT | Actual SMS/WhatsApp/email transport integrations remain separate adapters/jobs. |

## Admissions, transfers and year-end progression

| Area | Status | Notes |
|---|---|---|
| Admission applications | DONE FOUNDATION / VERIFY | Pre-enrolment workflow exists and remains separate from authoritative learner identity/enrolment until accepted and enrolled. |
| Transfers | DONE FOUNDATION / VERIFY | Source-school provenance and historical enrolment are preserved; completion closes the source enrolment rather than rewriting it. |
| Year-end progression | DONE FOUNDATION / VERIFY | Outcome records preserve academic rule-set key/version provenance and can be locked after approval. |
| Promotion engine integration | NEXT | Deterministic versioned academic rules still need to generate/review these progression records operationally. |

## Existing UI/UX corrections

UI corrections already completed remain in place, but new modules should not receive heavy visual polish until the consolidated UI pass. Existing shared rules still apply: ScolaPro-owned controls, top-right toasts, centered loading, sticky shell, hierarchy utilities, contextual metrics, uppercase academic identifiers and safe class correction/deletion.

## Current workflows

Timetable:

`Academic structure → Subjects → Grade/year offerings → Teacher allocation → Teaching periods → Timetable slot → Role-aware timetable view`

Attendance:

`Day or week → class-scoped authorization → expected school-day validation → default present → explicit exceptions → reason/note/evidence → auditable confirmation/revision`

Learning resources:

`Catalog title → tracked copy → available → issue to learner/staff → open loan → return/lost/damaged → copy state + audit`

Transfer:

`Current enrolment → transfer request → governed approval/completion → source enrolment closed as transferred → receiving school appends its own enrolment`

## Approved next implementation sequence

1. **DNEA readiness foundation and candidate/subject-registration validation.**
2. **Finance basics** for invoices, bank-transfer references, payments and allocation without building a full ERP.
3. **Platform & tenant administration** expansion: feature flags/module entitlements, school configuration and governed tenant lifecycle metadata.
4. **Physical data model hardening**: cross-table tenant/school integrity checks, indexes, narrower role scopes and database test expansion.
5. **Assessment/marks operational persistence** connecting the already-approved academic rules engine to actual assessment instances, marks, moderation and official results.
6. **Statutory/EMIS readiness implementation** deriving census data from the operational source tables.
7. **Curriculum/planning implementation** from the versioned NIED registry into pacing/scheme/lesson-prep workflows.
8. Consolidated application-information-architecture and UI refinement pass after the core operational modules are in place.

## Takeover rule

Before beginning work, inspect the repository and this document. Do not recreate completed schema, replace established token systems, hard-code tenant modes, invent new colors, or bypass the existing authorization architecture. Continue from the first **IN PROGRESS** or **NEXT** item that matches the requested feature.
