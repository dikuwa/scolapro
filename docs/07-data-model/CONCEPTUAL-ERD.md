# ScolaPro Conceptual ERD

## Purpose

This document defines the first conceptual relationship map for ScolaPro. It is deliberately domain-level rather than SQL-level. Physical schemas, column types, indexes and migration details come after these relationships are validated against the remaining workflow documents.

## Identity and tenancy

```text
UserIdentity
  └──< Membership >── Tenant
                      └──< School

Membership
  ├── RoleAssignment
  └── ScopeAssignment
```

A user identity may participate in multiple contexts. Roles are attached to memberships/scopes rather than stored as one global role on the user.

## School and academic structure

```text
Tenant
  └──< School
        ├──< AcademicYear
        │     └──< AcademicTerm
        ├──< Department
        ├──< Phase
        ├──< Grade
        │     └──< ClassGroup
        ├──< Room
        └──< SchoolCalendarEvent
```

Academic years, terms and organizational structure are school-scoped but may inherit platform/reference defaults.

## People and staff

```text
Person
  ├── StaffProfile
  │     ├──< StaffPositionHistory
  │     ├──< Qualification
  │     └──< TeacherAllocation
  ├── GuardianProfile
  └── LearnerIdentity
```

One underlying person model may support multiple role-specific profiles where appropriate, but domain permissions must keep contexts separate.

## Learner and enrolment

```text
LearnerIdentity
  ├──< GuardianRelationship >── GuardianProfile
  ├──< LearnerEnrolment >── School
  │      ├──< ClassPlacement
  │      ├──< SubjectEnrolment
  │      └── PromotionOutcome
  ├──< AttendanceEvent
  ├──< ConductEvent
  ├──< AchievementEvent
  ├──< LearnerSupportRecord
  ├──< LearnerDocument
  └──< TransferEvent
```

Learner identity persists across enrolments. School-specific operational history is attached to an enrolment and retains originating-school provenance.

## Curriculum

```text
CurriculumSubject
  └──< CurriculumVersion
        ├──< CurriculumUnit
        │     ├──< CurriculumObjective
        │     ├──< CurriculumCompetency
        │     └──< CurriculumPractical
        ├──< CurriculumAssessmentRequirement
        └── CurriculumSource
```

School SubjectOffering links the official/reference subject to an academic year, grade/phase and school context.

```text
School
  └──< SubjectOffering >── CurriculumSubject / CurriculumVersion
```

## Teaching allocation and timetable

```text
StaffProfile
  └──< TeacherAllocation
        ├── SubjectOffering
        ├── ClassGroup
        └── AcademicYear

Timetable
  └──< TimetableSlot
        ├── TeacherAllocation
        ├── Room
        ├── Day/CycleDay
        └── Period
```

Teacher allocation is the source for marks permission, timetable, teaching planning, HOD scope and workload reporting.

## Teaching planning

```text
CurriculumVersion
  └──< PacingPlan
        └──< TeachingScheduleItem
              ├── CurriculumUnit/Competency
              ├── ClassGroup
              ├── planned periods/dates
              └──< LessonPreparation
                    └──< TeachingActual/Reflection
```

Year Planner, Scheme of Work, lesson plans and syllabus coverage are views/outputs over this connected structure.

## Attendance

```text
LearnerEnrolment
  └──< AttendanceEvent
        ├── attendance_date
        ├── optional period/timetable slot
        ├── AttendanceStatus
        ├── optional AttendanceReason
        └── recorder/audit metadata
```

Attendance status and reason are separate concepts. Capture timestamp is separate from the date/period being recorded.

## Assessment and marks

```text
AcademicRuleSet
  ├──< AssessmentScheme
  │     └──< AssessmentComponent
  ├── GradingScheme
  └── PromotionRuleSet

SubjectOffering
  └── AssessmentSchemeVersion
        └──< AssessmentInstance
              └──< LearnerMark
```

LearnerMark preserves raw mark/status and calculation provenance.

```text
AssessmentInstance
  └── MarkSubmission
        └── MarkReview/Moderation
              └── MarkLock
```

OfficialResult is produced from approved/locked inputs and stores the academic rules/version used.

## Reporting and promotion

```text
LearnerEnrolment
  └──< OfficialResult
        └── PromotionEvaluation
              └── PromotionOutcome

ReportCardSnapshot
  ├── OfficialResult[]
  ├── AttendanceSummary
  ├── PromotionOutcome
  └── TemplateVersion
```

Official snapshots remain historically stable even after later configuration changes.

## Conduct, achievement and learner support

```text
LearnerIdentity
  ├──< ConductEvent
  ├──< AchievementEvent
  └──< LearnerSupportRecord
        └──< SupportIntervention
```

LearnerSupportRecord carries stricter visibility classification and access auditing than ordinary learner records.

## LTSM / library

```text
LearningResourceTitle
  └──< ResourceCopy
        ├── Barcode/AssetIdentifier
        ├── ConditionHistory
        └──< ResourceLoan
              ├── LearnerEnrolment OR StaffProfile
              └── Issue/Return/Loss/Damage events
```

A ResourceTitle may be linked to SubjectOffering or CurriculumSubject to support textbook sufficiency analysis.

## Communication

```text
Communication
  ├── CommunicationRecipient[]
  ├── ChannelAttempt[]
  └── optional DomainReference
```

DomainReference may point to attendance, conduct, assessment, finance or general school communication while keeping channel delivery in one communication subsystem.

## Statutory / EMIS

```text
StatutoryFormDefinition
  └──< StatutoryFormVersion
        ├──< FieldDefinition
        ├──< MappingRule
        └──< ValidationRule

ReportingCycle
  └── StatutorySnapshot
        ├── SnapshotValue[]
        ├── ValidationIssue[]
        ├── CertificationEvent[]
        └── GeneratedExport[]
```

Snapshot values originate from effective-dated operational data wherever possible and retain their reporting date/template version.

## Documents

```text
DocumentTemplate
  └──< DocumentTemplateVersion
        └──< GeneratedDocument
              ├── DomainSnapshotReference
              └── StorageObject
```

Official documents use dedicated templates and preserve template/source/version metadata.

## Audit

```text
AuditEvent
  ├── tenant_id
  ├── school_id where applicable
  ├── actor
  ├── action
  ├── domain/entity reference
  ├── before/after or event metadata as appropriate
  └── timestamp
```

Sensitive-data access may produce additional access audit events.

## Important relationship rules

1. Tenant and school scope must be explicit on operational data where applicable.
2. Learner identity must not be duplicated merely because a learner changes class/year/school.
3. Historical school records retain originating-school provenance.
4. Curriculum, grading, promotion and statutory definitions are versioned.
5. Teacher allocation is reused instead of copied into timetable, marks and preparation permissions.
6. Official academic results are separated from working marks.
7. Report cards and statutory submissions are snapshots, not live recalculations of today's state.
8. Sensitive learner-support access is narrower than ordinary learner-profile access.
9. Reference/official codes are mappings, not primary identities.
10. Audit history accompanies high-integrity transitions.

## Next physical-model pass

The next ERD iteration should add:

- key identifiers and tenant/school ownership
- effective_from/effective_to rules
- unique constraints
- soft-close vs immutable record policy
- RLS policy groups
- indexes for school/class/date workflows
- deletion/retention policy
- import/external identifiers
- conflict/sync metadata for offline-capable entities
