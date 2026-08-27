# ScolaPro Architecture Principles

## 1. Multi-Tenant by Default

Every school-operational record must have an explicit tenant/school ownership strategy. Cross-school and Ministry views must be authorised, scoped and auditable.

## 2. PostgreSQL as the System of Record

Use PostgreSQL as the primary relational database. Supabase is the leading implementation candidate because PostgreSQL, RLS, storage and auth/integration options align with the product needs. Final service choices remain subject to an ADR before implementation.

## 3. Version Rules, Never Rewrite History

Curriculum, grading, assessment, promotion and statutory forms must be versioned with effective dates. Historical results and certified submissions retain the versions used at the time.

## 4. National Learner Identity, School Enrolment History

Learner identity and school enrolment are separate. Transfers create new enrolments while preserving read-only provenance of previous school records.

## 5. Authoritative Domain Ownership

Each fact has one authoritative owner. Other modules reference it or create immutable snapshots only when historical/legal requirements justify duplication.

## 6. Offline-Capable Critical Workflows

Attendance and marks/teacher capture workflows must be designed for local persistence, queued mutations and conflict-aware synchronisation. Offline capability is an architectural concern, not a late PWA cosmetic feature.

## 7. Event and Audit History for Sensitive Changes

Important academic, enrolment, permission, support, finance and statutory actions require an audit trail. Lock/unlock, moderation, transfer, certification and rule overrides must retain actor, timestamp and reason where appropriate.

## 8. Separate Operational Data from Analytical Aggregates

School operations use transactional records. Heavy circuit/regional/Ministry dashboards should use precomputed/materialized aggregates where appropriate for performance and privacy.

## 9. Privacy by Scope and Sensitivity

Access is not just role-based. Authorisation should consider role, school/department/class relationship, workflow state and record sensitivity. Counselling/health/support data needs stronger controls than ordinary academic records.

## 10. Provider Abstraction for Replaceable Services

AI, SMS, WhatsApp, email, OCR and similar external services should sit behind provider interfaces so ScolaPro is not tightly coupled to one vendor.

## 11. Documents Are Generated Products

Official PDFs, report cards, promotion schedules, statutory forms and certificates should be generated from structured data and versioned templates. The print layer must not depend on rendering the normal app UI.

## 12. Reference Data Is Managed Centrally

Official subject codes, phase structures, EMIS codes, absence reasons and other national/reference vocabularies should live in controlled reference registries with effective/version metadata where needed.

## 13. Configuration Hierarchy

Where appropriate, configuration should resolve through levels such as:

`National/Platform Default -> School/Department Override -> Class/Teacher Operational State`

Overrides must be governed and auditable when they affect official academic results or statutory reporting.

## 14. API and UI Must Share Business Rules

Critical calculations and permission decisions must live in domain/server logic, not only in client components. UI validation improves usability but is not the authority.

## 15. Build Around Workflows, Not Pages

Data models and services should support end-to-end workflows such as admission, teaching allocation, assessment, promotion, transfer and census certification. Screens are views/actions over those workflows.

## Decisions Still To Formalise

The following require ADRs before application implementation:
- exact application framework and deployment topology;
- Supabase/auth strategy;
- offline storage and sync implementation;
- object/document storage;
- PDF generation approach;
- timetable solver strategy;
- AI/provider gateway;
- notification providers;
- observability, backups and disaster recovery.