# ScolaPro Role-Centric Navigation Architecture

## Goal
Users should see tasks relevant to their responsibilities rather than the database/module structure underneath ScolaPro.

## Global shell
All authenticated roles share a small stable shell:
- Dashboard
- Notifications
- Search
- My Profile
- Help/Support
- Tenant/school switcher only when the user actually has multiple contexts

Everything else is role- and scope-aware.

## Teacher
Primary navigation:
- Today
- My Classes
- Teaching
- Assessment
- Learners
- Reports

`Today` prioritizes:
- today's timetable;
- register/attendance actions;
- preparations due;
- lessons not yet reflected as taught;
- marks windows/actions;
- important learner or school notices.

`Teaching` groups year planner, scheme, lesson preparation, syllabus coverage and teaching resources as one connected workspace.

`Assessment` exposes only allocated subjects/classes and active assessment periods.

## Register/Class Teacher
Uses the Teacher navigation plus contextual register-class responsibilities:
- Morning Register
- Class Overview
- Parent/Guardian details within permission
- Class attendance follow-up
- Class reports
- learner-profile change requests or verification tasks as permitted

Avoid creating a completely separate application role UI when these are additive responsibilities.

## HOD
Primary navigation:
- Overview
- Department
- Teachers
- Curriculum & Planning
- Assessment
- Learners
- Reports

The HOD dashboard emphasizes exceptions and readiness:
- lesson preparation awaiting review;
- syllabus coverage risk;
- marks awaiting moderation;
- subject performance trends;
- teacher timetable/workload context.

## Principal / Deputy
Primary navigation:
- Overview
- Academics
- Learners
- Staff
- Operations
- Statutory Readiness
- Communication
- Reports

Principal views should prioritize certification/readiness and school-level exceptions, not require navigation through individual teacher screens.

## School Admin
Primary navigation:
- Dashboard
- Learners
- Staff & Access
- Academic Setup
- Timetable
- School Operations
- Communication
- Reports
- Settings

Administrative complexity belongs here, but setup screens must still be guided and searchable.

## Librarian / LTSM
Primary navigation:
- Overview
- Issue / Return
- Learners & Allocations
- Catalogue
- Stocktake
- Shortages
- Reports

The most common action, barcode issue/return, should be reachable immediately.

## Learner Support / Counsellor
Primary navigation:
- Overview
- Cases
- Referrals
- Learners
- Interventions
- Follow-up
- Reports

Restricted information is displayed only when explicitly authorized.

## Parent/Guardian
Primary navigation:
- Home
- My Children
- Attendance
- Academics
- Timetable & Tasks
- Messages
- Documents
- Payments (when enabled)

A parent with multiple children should switch child context quickly without re-authentication.

## Learner
Primary navigation:
- Home
- Timetable
- Tasks
- Attendance
- Results
- Documents
- Messages

Keep the learner experience substantially simpler than staff interfaces.

## Platform Administrator
Separate platform-level workspace:
- Tenants
- Subscriptions
- Feature Flags
- Support
- Reference Data
- Curriculum Registry
- Ministry/Statutory Definitions
- Platform Audit

Platform administration must not be mixed into ordinary school navigation.

## Report discovery
Do not recreate SchoolLink-style report trees. Reports should be:
1. contextual to the screen/entity where they make sense;
2. searchable from a report centre;
3. filterable by scope/date/year;
4. available as print/PDF/CSV/XLSX only where useful.

Example: from a Grade 8A class page, `Class List`, `Attendance Summary`, `Subject Performance` and `Promotion Schedule` are contextual actions.

## Mobile navigation
Teacher workflows are the mobile priority. Core actions must work comfortably on phones:
- take attendance;
- open today's timetable;
- prepare/edit lesson;
- record marks;
- view learner summary;
- issue/return a textbook with camera barcode scanner.

Do not simply shrink desktop data tables. Provide mobile-specific interaction patterns.

## Interaction principle
Permissions should hide irrelevant navigation where possible, but authorization still occurs server-side. Hidden UI is convenience, not security.

## Status
Approved baseline for wireframing and implementation.