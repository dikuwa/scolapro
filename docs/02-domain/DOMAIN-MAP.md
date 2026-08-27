# ScolaPro Domain Map

## Purpose

This document defines the major business domains of ScolaPro before implementation. It describes ownership and relationships, not screen layout.

## Hierarchy

Platform -> Education Authority -> Region -> Circuit -> School -> Academic Year -> Term -> Grade -> Class Group -> Subject Offering -> Learner/Teacher Activity

A class group may support more than one grade where multigrade teaching is required. Grade and class must therefore remain separate concepts.

## 1. Platform & Education Network

Owns platform tenants, education authorities, regions, circuits, schools, subscriptions, feature flags, curriculum/reference registries and platform-level support.

Key entities:
- Tenant
- EducationAuthority
- Region
- Circuit
- School
- FeatureFlag
- Subscription
- ReferenceCode

## 2. School & Academic Structure

Owns the operational structure of a school.

Key entities:
- AcademicYear
- Term
- SchoolCalendar
- Phase
- Grade
- ClassGroup
- Department
- Room
- BellSchedule

Namibia phase defaults must support:
- Pre-Primary
- Junior Primary: Grades 1-3
- Senior Primary: Grades 4-7
- Junior Secondary: Grades 8-9
- Senior Secondary: Grades 10-12

These are configurable/reference-driven rather than scattered hard-coded conditions.

## 3. Identity, Staff & Access

Owns people who work in or access the platform, their appointments, roles and scoped permissions.

Key entities:
- User
- Person
- StaffMember
- StaffAppointment
- Qualification
- Role
- Permission
- RoleAssignment

One person may hold multiple responsibilities, e.g. Teacher + Class Teacher + HOD.

## 4. Learners, Guardians & Enrolment

Owns national learner identity and school-specific enrolment history.

Key entities:
- Learner
- LearnerIdentifier
- Guardian
- LearnerGuardianRelationship
- Enrolment
- ClassMembership
- SubjectEnrolment
- Transfer

A learner is not recreated on every transfer. Learner identity is longitudinal; enrolments belong to schools and periods.

Historical enrolments become read-only after transfer/completion and remain attributable to the originating school.

## 5. Curriculum Registry

Owns approved curriculum structures and versions.

Key entities:
- CurriculumVersion
- Qualification
- Subject
- CurriculumSubject
- CurriculumUnit
- Topic
- Competency
- GeneralObjective
- SpecificObjective
- PracticalRequirement
- AssessmentRequirement
- CurriculumSource

Curriculum records must retain source document/page/version traceability.

## 6. Teaching Allocation & Timetable

Owns who teaches what, to whom, where and when.

Key entities:
- TeachingAssignment
- TimetableCycle
- Period
- TimetableEntry
- SchedulingConstraint
- RoomAllocation

TeachingAssignment is authoritative for teacher access to classes/subjects and feeds timetable, marks, lesson preparation, workload and EMIS.

## 7. Teaching Planning Engine

Owns planned and actual curriculum delivery.

Key entities:
- PacingPlan
- PacingUnit
- SchemeOfWork
- LessonPreparation
- LessonDelivery
- SyllabusCoverage
- Reflection

Flow:
Curriculum -> Calendar + Timetable -> Pacing Plan -> Scheme/Year Planner -> Lesson Preparation -> Actual Delivery -> Coverage

Planned and actual dates/statuses must remain separate.

## 8. Attendance

Owns school attendance and lesson/period attendance.

Key entities:
- AttendanceSession
- AttendanceRecord
- AttendanceReason
- AttendanceConfirmation
- AttendanceFollowUp

Daily/register attendance and subject/period attendance are distinct but related.

Attendance date is distinct from recorded/submitted time so retrospective capture is valid.

## 9. Assessment & Marks

Owns assessment definitions, raw marks, calculations, moderation and locking.

Key entities:
- AssessmentSchemeVersion
- AssessmentComponent
- Assessment
- ExamPaper
- Mark
- MarkCalculation
- MarkSubmission
- Moderation
- MarkLock

Assessment rules are driven by qualification + grade + subject + curriculum version, not generic grade conditions.

Assessments may be contributing or formative/non-contributing.

## 10. Reporting, Grading & Promotion

Owns derived academic outcomes and official school academic documents.

Key entities:
- GradeScaleVersion
- TermResult
- SubjectResult
- ReportCard
- PromotionRuleVersion
- PromotionEvaluation
- PromotionDecision
- AcademicAward
- PerformanceAnalysis

Historical results must retain the rule versions used to calculate them.

## 11. Longitudinal Learner Record / CRC Foundation

Owns the learner's cross-year and authorised cross-school history.

Key domains assembled into the record:
- identity/family
- enrolment history
- academic history
- attendance
- conduct and achievements
- learner support
- authorised health/welfare records
- documents
- transfer history

The eventual official CRC is a versioned document/view over this longitudinal model, not one giant form.

## 12. Conduct, Wellbeing & Learner Support

Owns conduct events, concerns, referrals, interventions and protected notes.

Key entities:
- ConductEvent
- AchievementEvent
- LearnerConcern
- Referral
- Intervention
- SupportPlan
- ConfidentialNote

Sensitive support data requires granular permissions. Teachers may submit concerns without automatically gaining access to protected counselling records.

## 13. Learning Materials / LTSM & Library

Owns textbooks, learning materials and library resources.

Key entities:
- MaterialTitle
- MaterialCopy
- Barcode
- InventoryLocation
- MaterialIssue
- MaterialReturn
- StockTake
- LossDamageRecord

Textbooks and conventional library resources may share one inventory engine while exposing simpler role-specific workflows.

## 14. Communication

Owns messages and delivery across channels.

Key entities:
- Communication
- Audience
- MessageTemplate
- Delivery
- DeliveryChannel
- NotificationPreference

Potential channels:
- portal/in-app
- push
- SMS
- WhatsApp
- email

Attendance, conduct, results and announcements should reuse this engine.

## 15. EMIS & Statutory Reporting

Owns versioned statutory datasets, readiness checks, certification and snapshots.

Key entities:
- StatutoryFormVersion
- CensusPeriod
- CensusSnapshot
- CensusValue
- ValidationRule
- Certification
- Submission

Operational data should pre-populate statutory returns wherever possible.

Examples include:
- Fifteenth School-Day reporting
- Annual Education Census
- class-level Form C verification
- school aggregation
- staffing/workload statistics
- vacancies
- timetable cycle data

Certified historical snapshots remain immutable.

## 16. Examinations / DNEA

Owns candidate readiness, examination identifiers, registrations and examination-specific exports/documents.

Key entities:
- ExamSeries
- CandidateRegistration
- CandidateSubject
- ExamNumber
- RegistrationValidation
- ExamExport

DNEA shares learner/subject data with the school system but remains a distinct domain from ordinary internal assessment.

## 17. Finance & Payments

Initial scope is intentionally lightweight.

Key entities:
- ChargeType
- Invoice
- PaymentReference
- Payment
- ProofOfPayment
- PaymentVerification

Must distinguish voluntary school development contributions from tuition/fees and other payment categories.

## 18. Governance

Owns lightweight school governance processes.

Key entities:
- SchoolBoard
- BoardMember
- Meeting
- Resolution
- Approval
- SchoolDevelopmentPlan

## 19. Portals

Role-specific read/action surfaces for:
- Parent/Guardian
- Learner
- School Board member
- authorised circuit/regional/Ministry users

Portals consume domain data; they do not duplicate it.

## 20. Intelligence & Analytics

Owns derived, permission-scoped intelligence from operational data.

Scopes:
- teacher
- HOD/department
- school/principal
- circuit
- region
- authorised national/Ministry

Common measures include attendance, enrolment, learner-teacher ratios, assessment performance, quality symbols, promotion/repetition, syllabus coverage, staffing/workload and resource shortages.

Analytics access does not imply unrestricted access to confidential learner-level records.

## Architectural Rule

A module must not create a duplicate copy of information that another domain already owns. Consumers reference the authoritative record and generate appropriate snapshots only when historical/legal immutability requires them.