# ScolaPro PostgreSQL Physical Schema Baseline

## Purpose
This document translates the approved conceptual architecture into a physical PostgreSQL baseline. It is intentionally implementation-oriented while remaining independent of any ORM.

## Core conventions
- UUID primary keys (`uuid`) for externally referenced records.
- `tenant_id` on every tenant-owned table unless the table is global reference data.
- `school_id` on school-scoped operational records where one tenant can own multiple schools.
- `created_at`, `updated_at`, `created_by`, `updated_by` on mutable business records.
- Effective-dated relationships use `effective_from` and `effective_to` rather than destructive overwrites.
- Official/certified data uses immutable snapshots or append-only revisions.
- Human-readable codes are stored separately from primary keys.
- Soft deletion is reserved for business entities where recovery/history is required; historical academic records are never deleted through ordinary UI actions.

## Schema namespaces
Recommended PostgreSQL schemas:

- `platform` — tenants, plans, feature flags, platform administration.
- `identity` — user profiles and actor mapping.
- `school` — schools, campuses, academic structures, staff assignments.
- `learner` — learner identity, guardians, enrolments, transfers, support profile.
- `curriculum` — NIED registry, curriculum versions, competencies, assessment requirements.
- `teaching` — allocations, timetable, planning, lessons, syllabus coverage.
- `attendance` — attendance sessions, observations, reasons, confirmations.
- `assessment` — schemes, components, assessments, mark entries, moderation, results.
- `student_support` — conduct, achievements, interventions and protected support records.
- `ltsm` — titles, copies, allocations, stocktakes and transactions.
- `communication` — audiences, messages, deliveries, templates.
- `statutory` — EMIS/AEC/DNEA definitions, snapshots, validations, certifications.
- `document` — generated document metadata and stored-file references.
- `audit` — audit events and security-sensitive history.
- `reference` — versioned national codes and shared lookup registries.

## High-value physical tables

### Platform and tenancy
- `platform.tenants`
- `platform.tenant_features`
- `platform.tenant_subscriptions`
- `school.schools`
- `school.school_years`
- `school.terms`
- `school.phases`
- `school.grades`
- `school.classes`
- `school.departments`
- `school.rooms`

### Identity and roles
- `identity.profiles`
- `identity.tenant_memberships`
- `identity.school_memberships`
- `identity.role_assignments`
- `identity.permission_overrides`

Role assignments must be scope-aware. Example scopes include tenant, school, department, grade, class and learner-support team.

### Staff
- `school.staff`
- `school.staff_qualifications`
- `school.staff_positions`
- `school.staff_subject_qualifications`
- `school.staff_assignments`

### Learners
- `learner.learners`
- `learner.guardians`
- `learner.learner_guardians`
- `learner.enrolments`
- `learner.class_memberships`
- `learner.subject_enrolments`
- `learner.transfer_cases`
- `learner.profile_change_requests`
- `learner.documents`

`learner.learners` represents the person. `learner.enrolments` represents participation at a specific school/year. This separation is mandatory.

### Curriculum
- `curriculum.curriculum_releases`
- `curriculum.subjects`
- `curriculum.subject_versions`
- `curriculum.curriculum_units`
- `curriculum.competencies`
- `curriculum.unit_competencies`
- `curriculum.assessment_requirements`
- `curriculum.source_documents`

Curriculum content must be versioned and traceable to the official source document.

### Teaching and timetable
- `teaching.teacher_allocations`
- `teaching.timetable_cycles`
- `teaching.timetable_periods`
- `teaching.timetable_slots`
- `teaching.timetable_constraints`
- `teaching.pacing_plans`
- `teaching.pacing_items`
- `teaching.lesson_plans`
- `teaching.lesson_delivery_events`
- `teaching.coverage_records`

### Attendance
- `attendance.reason_registry`
- `attendance.sessions`
- `attendance.observations`
- `attendance.daily_confirmations`
- `attendance.parent_notification_requests`

An observation is an event for one learner in one attendance context. Status and reason are separate columns.

### Assessment
- `assessment.rule_sets`
- `assessment.grading_scales`
- `assessment.assessment_schemes`
- `assessment.scheme_components`
- `assessment.assessments`
- `assessment.mark_entries`
- `assessment.result_calculations`
- `assessment.result_revisions`
- `assessment.moderation_actions`
- `assessment.result_locks`
- `assessment.promotion_rule_sets`
- `assessment.promotion_decisions`

Raw marks and calculated marks must be stored separately. A recalculation must never destroy the original raw mark.

### Conduct, achievement and support
- `student_support.conduct_categories`
- `student_support.conduct_events`
- `student_support.achievement_events`
- `student_support.support_cases`
- `student_support.support_interventions`
- `student_support.restricted_notes`

Restricted support records are intentionally separate from general conduct records so access policies can be stricter.

### LTSM
- `ltsm.titles`
- `ltsm.editions`
- `ltsm.copies`
- `ltsm.copy_transactions`
- `ltsm.learner_allocations`
- `ltsm.stocktakes`
- `ltsm.stocktake_items`
- `ltsm.shortage_snapshots`

### Communications
- `communication.templates`
- `communication.messages`
- `communication.message_recipients`
- `communication.delivery_attempts`
- `communication.communication_preferences`

### Statutory reporting
- `statutory.form_definitions`
- `statutory.form_versions`
- `statutory.field_definitions`
- `statutory.submission_snapshots`
- `statutory.validation_results`
- `statutory.certifications`
- `statutory.export_artifacts`

### Documents
- `document.files`
- `document.generated_documents`
- `document.document_versions`
- `document.signature_events`

### Audit
- `audit.events`
- `audit.security_events`

## Indexing baseline
At minimum:
- every foreign key used in tenant-filtered queries;
- `(tenant_id, school_id)` on high-volume school tables;
- `(school_id, academic_year_id)` for academic records;
- `(learner_id, effective_from)` for longitudinal history;
- `(teacher_id, academic_year_id)` for teacher allocations;
- `(class_id, attendance_date)` for attendance;
- `(assessment_id, learner_id)` unique for single-value mark entries where applicable;
- `(tenant_id, created_at)` for audit/event browsing;
- barcode and copy-number unique indexes for LTSM.

## Data integrity rules
Use PostgreSQL constraints wherever possible rather than only application validation.

Examples:
- no enrolment end date before start date;
- one active primary enrolment per learner/school/year unless explicitly modelled otherwise;
- mark cannot exceed raw maximum unless the assessment explicitly allows bonus marks;
- attendance observation must reference a valid learner enrolment for the observation date;
- locked official result cannot be changed without creating a revision/reopen event;
- curriculum assignment must reference an effective curriculum version.

## Derived data
Computed operational dashboards may use materialized views or read models, but authoritative source data remains normalized.

Potential read models:
- current learner roster;
- teacher workload;
- class attendance summary;
- subject performance summary;
- syllabus coverage summary;
- textbook shortage summary;
- EMIS readiness summary.

## Migration discipline
Database migrations must be forward-only, reviewed and reproducible. Production data fixes belong in explicit data migrations or controlled admin actions, not hidden application startup scripts.

## Status
Approved architecture baseline. Table/column-level SQL can now be produced from this document after authorization/RLS and offline-sync rules are finalized.