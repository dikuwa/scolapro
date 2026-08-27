# ScolaPro Implementation Status

> **Living handoff document.** Update this file whenever a meaningful implementation slice is completed or materially changes. Any developer or AI taking over ScolaPro should read this file, `ARCHITECTURE-ROADMAP.md`, the domain documents and the design-system documents before proposing new architecture or starting duplicate work.

Last updated: **27 August 2026**

## How to use this document

Statuses:

- **DONE** — implemented and integrated into the current codebase.
- **IN PROGRESS** — architecture exists and implementation is actively advancing.
- **NEXT** — approved next implementation target.
- **PLANNED** — architecture/design defined but implementation has not reached the operational slice yet.
- **VERIFY** — implemented but still needs broader role/device/real-data QA.

## Foundation

| Area | Status | Notes |
|---|---|---|
| Product/domain architecture | DONE | Namibia-first multi-school model, source-of-truth map, role model and core architecture documented. |
| PostgreSQL/Supabase baseline | DONE | Supabase-backed PostgreSQL, source-controlled migrations and RLS baseline established. |
| Authentication | DONE | Authenticated user context with school/platform memberships. |
| Tenant isolation | DONE | RLS and role-aware authorization helpers; dedicated database isolation tests exist. |
| Platform administration | IN PROGRESS | Tenant/school onboarding and governed school-user invitations implemented. |
| Design system | DONE / EVOLVING | Plus Jakarta Sans, spacing/radius/surface tokens, soft borders, shared CTA motion, Sonner semantics, contextual color system. |
| Loading system | DONE | Structural skeletons plus shared shadcn-style Spinner for slower/localized loads. |
| Persistent notifications | DONE FOUNDATION | User-scoped notification inbox, unread count, mark-all-read and clear actions wired into app shell. Invitation acceptance is the first database-driven notification producer. |
| Account profile | DONE FOUNDATION | Avatar storage/upload/remove and password-change workspace implemented. `must_change_password` profile flag exists for governed first-login flow. |

## First operational vertical slice

| Area | Status | Notes |
|---|---|---|
| Learner identity | DONE FOUNDATION | Core learner identity model and secure registration workflow implemented. |
| Enrolment | DONE FOUNDATION | School/year enrolment model, integrity constraints and audit-safe registration RPC. |
| Academic structure | DONE FOUNDATION | Grades and register classes configurable by authorized school administrators. |
| School calendar | DONE FOUNDATION | Calendar schema exists as a timetable/planning dependency. |
| Staff | DONE FOUNDATION | Staff model and role-aware data-scope hardening exist. |
| Invitations | DONE / VERIFY | Platform admin can choose authorized schools; school admin is explicitly limited to schools where they hold active school-admin scope, with a single-school fixed-context UI when appropriate. Invitation expiry RPC ambiguity fixed. |

## Timetable and attendance slice

| Area | Status | Notes |
|---|---|---|
| Subjects / subject offerings | DONE / VERIFY | Schema plus governed school-admin UI and RPCs now exist for subject definitions and grade/year offerings. |
| Teacher allocations | DONE FOUNDATION / VERIFY | Canonical teacher-to-subject-to-class allocation is now configurable through the timetable workspace and reused as the scheduling source of truth. |
| Timetable periods | DONE FOUNDATION / VERIFY | School admin can configure numbered teaching periods and optional start/end times. |
| Timetable slots | IN PROGRESS / VERIFY | Conflict-safe slot creation is implemented. Database constraints and governed RPCs prevent class/teacher double booking; current timetable UI is available. |
| Timetable role views | IN PROGRESS / VERIFY | School admin receives setup + full timetable. Principal/deputy/HOD receive school timetable. Teacher/class-teacher views filter scheduled slots to their staff allocation when linked. |
| Timetable navigation | DONE | Timetable route is exposed only to relevant school roles, not platform-only roles. |
| Attendance events | DONE FOUNDATION | Date-aware attendance model and reason registry foundation exist. |
| Daily register | IN PROGRESS / VERIFY | Teacher/admin daily register UI, exception-first capture and auditable revisions implemented; continue role/device and class-scope QA. |
| Attendance navigation | DONE | Visible to authorized operational roles. |

## User experience improvements completed in current pass

- Invitation form rows normalized to a shared field rhythm so paired fields align horizontally.
- A user with only one authorized school no longer receives a misleading multi-school picker; their school scope is displayed as fixed context.
- Server-side invitation school options are explicitly narrowed to active school-admin scope unless the user is a platform administrator.
- Central contextual accent palette added: indigo, mint, rose, amber, orange and sky, each with soft companions.
- Contextual colors are distinct from success/warning/danger/info status semantics.
- Dashboard, invitations, academic setup and attendance summary surfaces now use restrained contextual accents instead of remaining visually flat.
- Persistent notification center added to the global shell with accurate unread count sourced from the authenticated user's notification rows.
- Mark-all-read and clear notification actions added.
- Invitation acceptance now produces a persistent success notification for the inviter.
- Avatar upload/change/delete foundation added through protected Supabase Storage paths.
- Account password change UI added.
- Shared shadcn-style Spinner primitive added and combined with page skeleton loading.

## Current timetable workflow

The implemented school-admin path is now:

`Academic structure → Subjects → Grade/year offerings → Teacher allocation → Teaching periods → Timetable slot → Role-aware timetable view`

Teacher allocation remains the canonical relationship shared by timetable, marks, teaching planning, workload and future statutory reporting. Timetable slot creation never accepts an arbitrary teacher/class/subject combination that bypasses this allocation.

## Approved next implementation sequence

1. **Finish timetable operational QA and publishing/readiness behavior.**
2. Complete attendance operational flow, especially role-appropriate class access and reporting/readiness summaries.
3. Conduct, achievement and learner-support operational slice.
4. LTSM / textbooks / library operational slice.
5. Communications engine and additional domain notification producers.
6. Admissions, transfers and year-end progression.
7. DNEA readiness.
8. Finance basics.
9. Continue statutory/EMIS and curriculum/planning vertical slices according to the architecture roadmap.

## Takeover rule

Before beginning work, inspect the repository and this document. Do not recreate completed schema, replace established token systems, hard-code tenant modes, invent new colors, or bypass the existing authorization architecture. Continue from the first **IN PROGRESS** or **NEXT** item that matches the requested feature.
