# ScolaPro Database Migration Implementation Plan

## Goal

Translate the conceptual/physical data model into safe, reviewable PostgreSQL migrations without mixing schema design with feature UI implementation.

## Migration Principles

1. Forward-only migrations are the normal deployment path.
2. Every migration is small enough to review.
3. RLS is introduced alongside tenant-scoped tables, not as a later hardening phase.
4. Constraints belong in the database when they protect authoritative invariants.
5. Seed/reference data is versioned separately from transactional data.
6. Destructive changes require explicit migration notes and recovery plan.

## Initial Migration Sequence

### 001 — platform and tenancy
- tenants
- schools
- school settings baseline
- academic years
- memberships
- role/permission primitives

### 002 — school structure and staff
- departments
- phases
- grades
- classes
- staff profiles
- staff-school assignments
- subject/teaching allocations

### 003 — learner identity and enrolment
- learners
- guardians
- learner-guardian relationships
- enrolments
- class memberships with effective dates
- transfer records

### 004 — curriculum registry
- curriculum packs/versions
- subjects
- official subject codes
- curriculum units/topics/competencies
- assessment scheme definitions
- grading/promotion rule versions

### 005 — timetable and calendar
- calendar layers/events
- timetable cycles
- periods
- rooms
- timetable slots
- teacher/class/subject scheduling constraints

### 006 — attendance
- attendance sessions
- attendance observations
- reason registry
- confirmations/revisions

### 007 — assessments and marks
- assessment periods
- assessments/components
- mark sheets
- learner marks/statuses
- moderation/submission/lock history

### 008 — teaching planning
- pacing plans
- teaching schedules
- lesson preparations
- lesson delivery/coverage events
- HOD submission/review records

### 009 — learner timeline/support
- conduct events
- achievement events
- support cases/interventions
- restricted records and scoped assignments

### 010 — LTSM/library
- titles/items/copies
- allocations/issues/returns
- conditions/loss/damage
- stocktakes

### 011 — communications and documents
- communication intents/deliveries
- templates
- generated documents
- file metadata

### 012 — statutory reporting
- statutory template/version registry
- readiness results
- census/submission snapshots
- certification/audit references

### 013 — audit/jobs/integration support
- audit events
- domain/outbox events
- background jobs
- provider delivery references
- idempotency records where required

## RLS Rollout

Each tenant-scoped migration must include policies or remain unavailable to production application roles until policies exist. Add automated tests proving cross-tenant reads/writes fail.

## Reference Data

Namibian regions, official subject codes, attendance reason registries, curriculum versions and statutory templates should use controlled seed/reference migrations. Do not overload migrations with unverified policy assumptions.

## Environments

Maintain local/development, preview/staging and production environments with separate databases. Migrations run automatically only after CI validation; production destructive changes require explicit approval.

## Before Application Feature Work

The first implementation slice should successfully create a tenant, school, staff membership, learner and enrolment through real authorization boundaries before broad UI development begins.
