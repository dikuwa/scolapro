# ScolaPro Architecture Roadmap

## Current status

The foundational product, domain, academic, curriculum, learner-history, statutory and technical architecture is now defined at conceptual level.

## Completed architecture blocks

- product vision and principles
- domain map
- source-of-truth map
- role matrix
- UI/UX principles
- architecture principles
- academic rules engine
- assessment and marks lifecycle
- versioned academic-rule ADR
- NIED Curriculum Registry
- Teaching Planning Engine
- learner longitudinal / CRC foundation
- EMIS & statutory reporting architecture
- modular-monolith ADR
- PostgreSQL/Supabase baseline ADR
- conceptual ERD

## Next architecture blocks

### 1. Timetable Engine

Define:

- school week/cycle
- periods and bell times
- rooms
- teacher availability
- subject/class allocation
- constraints and preferences
- conflict detection
- spread rules
- locked slots
- partial regeneration
- timetable publication/versioning
- teacher/learner/class views

### 2. Attendance Engine

Define:

- register vs subject-period attendance
- default-present interaction model
- backdated capture
- status vs reason registry
- evidence/notes
- weekly verification
- parent notification hooks
- attendance corrections and audit
- statutory/CRC aggregation

### 3. Conduct, Achievement & Learner Support

Define:

- discipline incidents
- positive achievements
- configurable categories/severity/points where schools use them
- referrals/interventions
- restricted wellbeing/support records
- parent communication
- access classifications
- CRC integration

### 4. LTSM / Textbooks / Library

Define:

- title/copy inventory
- barcode/mobile scanning
- subject textbook allocation
- class bulk issue
- return/loss/damage
- stocktake
- shortage analytics
- learner liability/history
- Ministry aggregation

### 5. Communications

Define one communication service for:

- app/in-app
- email
- SMS
- WhatsApp integration where available
- recipient selection
- approval rules where schools require them
- delivery status
- templates
- domain-triggered notifications

### 6. Admissions, Transfers & Year-End Progression

Define:

- learner onboarding
- guardian links
- document verification
- class/subject placement
- admission numbering
- transfer packages
- receiving-school continuation
- year-end promotion and rollover
- archive/read-only history

### 7. DNEA

Define:

- candidate readiness
- official identity checks
- subject registration
- code mapping
- export/submission preparation
- national examination result import/reference where legally/technically possible

### 8. Finance

Keep intentionally lightweight initially:

- fee/invoice records where school needs them
- bank-transfer reference generation
- payment capture/reconciliation
- parent visibility
- exemptions/adjustments where applicable
- hostel/LTSM liabilities integration

Avoid building a full accounting ERP without a validated need.

### 9. Platform & Tenant Administration

Define:

- school onboarding
- tenant lifecycle
- subscriptions
- feature flags/modules
- demo/sandbox tenants
- support
- reference-data publishing
- curriculum/statutory version publication
- safe tenant reset/recovery where required

### 10. Physical Data Model

Convert conceptual ERD into implementation schema:

- tables
- keys
- constraints
- effective dating
- RLS
- indexes
- retention
- storage references
- audit
- offline-sync metadata

### 11. Application Information Architecture

Translate role matrix into role-centric navigation and core screens.

Priority journeys:

- Teacher: Today → Classes → Teaching → Assessment → Reports
- HOD: Overview → Department → Curriculum → Teachers → Assessment → Reports
- Admin: Learners → Staff → Academic Setup → School Operations → Communication → Reports → Settings
- Principal: Readiness → Academics → Attendance → Staff → Statutory → Reports
- Parent: Children → Attendance → Results → Tasks → Messages → Payments
- Learner: Today → Timetable → Tasks → Results → Messages

### 12. Wireframes and Design System

Before production feature implementation:

- design tokens
- responsive shell
- navigation
- forms
- searchable selects
- data grids
- marks sheet
- attendance capture
- dashboards
- status patterns
- empty/loading/error states
- print/document system

### 13. Implementation Plan

Build vertical slices instead of isolated modules.

Recommended first production slice:

School setup → staff/teacher allocation → learners/classes → timetable → teacher dashboard → attendance → basic communication

Second slice:

Academic rules → marks → moderation → report cards → promotion

Third slice:

Curriculum registry → planning engine → year plan/scheme/lesson prep/coverage

Fourth slice:

LTSM + statutory readiness/EMIS + longitudinal CRC expansion

## Decision rule

Do not begin implementing a complex domain merely because its screen is easy to mock. Implement only after its source-of-truth, permissions, lifecycle and relationships are understood.
