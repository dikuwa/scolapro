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
| Calendar route | DONE FOUNDATION | Role-aware `/calendar` page now uses academic-year/term data instead of returning a 404. Calendar editing and richer event layers remain later work. |

## First operational vertical slice

| Area | Status | Notes |
|---|---|---|
| Learner identity | DONE FOUNDATION | Core learner identity model and secure registration workflow implemented. |
| Enrolment | DONE FOUNDATION | School/year enrolment model, integrity constraints and audit-safe registration RPC. |
| Academic structure | DONE / VERIFY | Grades and register classes configurable by school admin; new identifiers normalize to uppercase. Register classes can be corrected and can only be deleted while unused. |
| School calendar | DONE FOUNDATION | Academic-year/term schema and read view exist as attendance/timetable/planning dependencies. |
| Staff | DONE FOUNDATION | Staff model, directory and role-aware data-scope hardening exist. |
| Invitations | DONE / VERIFY | Platform admin can choose authorized schools; school admin is explicitly limited to active school-admin scope, with a single-school fixed-context UI when appropriate. |

## Timetable and attendance slice

| Area | Status | Notes |
|---|---|---|
| Subjects / subject offerings | DONE / VERIFY | Schema plus governed school-admin UI/RPCs. New subject codes normalize uppercase. |
| Teacher allocations | DONE FOUNDATION / VERIFY | Canonical teacher-to-subject-to-class allocation is configurable through the timetable workspace and reused as scheduling source of truth. |
| Timetable periods | DONE FOUNDATION / VERIFY | School admin can configure numbered teaching periods through ScolaPro-owned time pickers rather than browser-native time UI. |
| Timetable slots | IN PROGRESS / VERIFY | Conflict-safe slot creation is implemented; database constraints prevent class/teacher double booking. |
| Timetable role views | IN PROGRESS / VERIFY | School admin receives setup + full timetable; leadership sees school timetable; linked teachers/class teachers see their allocated slots. |
| Timetable navigation | DONE | Route is exposed only to relevant school roles. |
| Attendance events | DONE FOUNDATION | Date-aware append-only attendance events and reason registry exist. |
| Daily register | DONE FOUNDATION / VERIFY | Exception-first daily capture, auditable revisions, faster weekday navigation and optional private JPG/PNG/WebP/PDF evidence are implemented. |
| Weekly register | DONE FOUNDATION / VERIFY | Monday-Friday spreadsheet-style capture is implemented. Each learner/day has its own status/reason/note, and one atomic confirmation creates separate daily submissions. Weekends are rejected by the weekly database RPC. |
| Attendance evidence | DONE FOUNDATION / VERIFY | Private `attendance-evidence` storage bucket and RLS-backed evidence metadata exist. Evidence is optional and limited to 5 MB. |
| Attendance navigation | DONE | Visible to authorized operational roles. |

## UI/UX corrections completed in current pass

- Global route spinner is centered across authenticated and public pages; route loading text was removed.
- Sonner toasts are positioned top-right.
- Body caret is suppressed outside editable controls to remove the stray blinking page cursor.
- Desktop sidebar is sticky, full-height and independently scrollable.
- Shared accessible Picker closes on outside pointer interaction and Escape.
- Browser-native timetable time picker was replaced with a ScolaPro-owned hour/minute control.
- Browser-native avatar file presentation was replaced with a custom file control and instant local preview.
- Learner search/filter controls now use design-system radii instead of pill/full rounding.
- Shared section/record hierarchy classes distinguish page titles, section titles/descriptions and row/item titles.
- Dashboard/timetable/attendance/academic/staff/invitation metric values now visually match their contextual icon accent colors where applicable.
- Grade/class/subject/cycle identifiers normalize uppercase for new writes; grade helpers use `G8`, `G9`, `G10`, etc.
- Academic grade picker no longer renders duplicated inline grade numbers and shared pickers close outside correctly.
- Register classes now have governed edit and safe-delete controls; used classes are preserved instead of destructively removed.
- `/calendar` now renders academic calendar context instead of a not-found page.

## Current timetable workflow

The implemented school-admin path is:

`Academic structure → Subjects → Grade/year offerings → Teacher allocation → Teaching periods → Timetable slot → Role-aware timetable view`

Teacher allocation remains the canonical relationship shared by timetable, marks, teaching planning, workload and future statutory reporting. Timetable slot creation never accepts an arbitrary teacher/class/subject combination that bypasses this allocation.

## Current attendance workflow

Two complementary capture paths now exist:

`Day → class → default present → mark exceptions → reason/note/evidence → confirm/revise`

`Week → class → Monday-Friday grid → choose learner/day → status/reason/note → confirm week atomically`

Saturday and Sunday are not normal register days. Future calendar-readiness work should also exclude school holidays/closures from expected attendance while still permitting explicitly configured special school events.

## Approved next implementation sequence

1. **Finish current CI/database validation and timetable/attendance QA across school-admin/teacher roles.**
2. Tighten role-appropriate class access (teachers/register teachers) and attendance reporting/readiness summaries.
3. Conduct, achievement and learner-support operational slice.
4. LTSM / textbooks / library operational slice.
5. Communications engine and additional domain notification producers.
6. Admissions, transfers and year-end progression.
7. DNEA readiness.
8. Finance basics.
9. Continue statutory/EMIS and curriculum/planning vertical slices according to the architecture roadmap.

## Takeover rule

Before beginning work, inspect the repository and this document. Do not recreate completed schema, replace established token systems, hard-code tenant modes, invent new colors, or bypass the existing authorization architecture. Continue from the first **IN PROGRESS** or **NEXT** item that matches the requested feature.
