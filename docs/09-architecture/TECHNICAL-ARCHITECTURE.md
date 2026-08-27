# ScolaPro Technical Architecture

## Status

Approved baseline architecture for implementation planning. Replaceable infrastructure details may evolve through ADRs, but core domain boundaries and data-integrity principles are stable.

## Architecture goals

ScolaPro must be:

- Namibia-first
- multi-tenant and multi-school
- secure by default
- fast on low-bandwidth connections
- offline-capable for selected teacher workflows
- auditable
- highly configurable without hard-coding school-specific rules
- suitable for school, regional and national aggregation
- maintainable by a small engineering team using strong automation and AI-assisted development

## Baseline stack

### Application

- Next.js
- React
- TypeScript
- Tailwind CSS
- accessible reusable component system

### Data

- PostgreSQL as the system of record
- Supabase is the preferred initial managed PostgreSQL platform
- PostgreSQL Row Level Security for tenant isolation where practical
- database migrations committed to source control

### Authentication and authorization

- central identity/account layer
- school/tenant memberships separated from identity
- role + scope + permission model rather than hard-coded route checks
- tenant/school/department/class scope attached to assignments

### Storage

Object storage for:

- learner/staff documents
- evidence uploads
- official generated files where retention is required
- curriculum source documents
- school branding assets

Sensitive files must use authorization-aware access rather than public object URLs.

### Offline/PWA

- installable PWA
- IndexedDB/local persistence for supported offline workflows
- explicit synchronization queue
- conflict-aware server reconciliation
- clear offline/sync status in the UI

Offline support should prioritize workflows where connectivity loss is realistic and disruptive, such as:

- attendance
- lesson preparation/reference
- selected class lists
- possibly marks drafts where policy and synchronization safety allow

Not every administrative workflow needs full offline mutation support.

## Application architecture

Use a modular monolith initially.

Reasons:

- domains are deeply connected
- transactional consistency matters
- a small team can reason about and deploy it more easily
- premature microservices would increase operational complexity

Internal boundaries should still be explicit so domains can be extracted later if scale requires it.

Suggested top-level domain modules:

- identity-access
- tenants-schools
- academic-structure
- people-staff
- learners-guardians
- enrolment
- curriculum
- teaching-planning
- timetable
- attendance
- assessment
- promotion-reporting
- learner-support-crc
- conduct-achievement
- ltsm-library
- communication
- statutory-emis
- dnea
- finance
- governance
- documents
- platform-admin
- audit

## Multi-tenancy model

A tenant represents the governing subscription/organization boundary.

A tenant may contain one or more schools where supported.

Most operational records must carry a tenant identity, and school-scoped records also carry school identity.

Tenant isolation is enforced at multiple layers:

1. authenticated session context
2. application authorization
3. database RLS/policies where feasible
4. audit logging
5. automated tenant-leakage tests

Never rely solely on UI filtering for tenant isolation.

## Identity vs membership

A user account is not the same as a staff/parent/learner membership.

One identity may have multiple contexts, for example:

- teacher at one school
- parent at the same or another school
- HOD assignment for a specific department

Authorization should resolve the active membership/context rather than encode a single global role directly on the user account.

## Effective-dated domain records

Historical accuracy is fundamental.

Use effective-dated/versioned records for concepts such as:

- enrolment
- class placement
- subject enrolment
- staff position
- teacher allocation
- guardian/contact relationship where required
- curriculum version
- grading/promotion rules
- statutory codes

The system must be able to reconstruct the state applicable to a historical reporting date.

## Domain events and audit

ScolaPro should record meaningful state transitions, not only generic database timestamps.

Examples:

- learner_enrolled
- learner_transferred
- attendance_confirmed
- marks_submitted
- marks_returned
- marks_verified
- marks_locked
- promotion_certified
- curriculum_version_published
- statutory_snapshot_certified
- textbook_issued
- textbook_returned

Not every event requires event sourcing. PostgreSQL remains the source of current state, with append-only audit/event tables for traceability and downstream processing.

## Workflow/state machines

High-integrity processes use explicit state transitions.

Examples:

- marks lifecycle
- curriculum publication
- parent/profile change requests
- statutory certification
- transfer workflow
- document verification

State transitions must be server-enforced and permission-checked.

## Rules engines

Avoid hard-coded grade/year logic in UI components.

Versioned rule/configuration domains include:

- academic assessment schemes
- grading bands
- promotion rules
- curriculum versions
- statutory form definitions
- official code mappings
- communication/approval policies

Rule evaluation should be deterministic and explainable.

## Generated documents

Official documents use a dedicated document-rendering layer with versioned templates.

Web pages are not print templates.

Generated documents should preserve:

- template version
- source record/snapshot
- generated timestamp
- school/tenant branding
- verification metadata where applicable

Outputs may include PDF, print HTML, CSV/XLSX or official data export formats.

## AI architecture

AI is an assistant layer, not a primary source of official truth.

Use provider abstraction so model vendors can change without rewriting domain logic.

Suitable AI uses include:

- lesson preparation drafts
- curriculum document extraction assistance
- reflection structuring
- natural-language analytics summaries
- data-quality explanation

AI must not autonomously:

- publish curriculum rules
- alter official learner marks
- determine promotion without configured deterministic rules
- certify statutory data
- expose restricted learner information

Persist provenance where AI-generated content becomes part of a user workflow.

## Background work

Use asynchronous jobs for workloads such as:

- large PDF/report generation
- bulk imports
- notification delivery
- curriculum extraction
- statutory exports
- analytics materialization

Jobs should be idempotent and observable.

## Search

Start with PostgreSQL-backed search for operational entities and reports.

Introduce specialized search infrastructure only when measured requirements justify it.

## Performance

Design targets:

- teacher's common daily actions require minimal round trips
- paginated/virtualized large learner/marks tables
- cached reference data
- selective server rendering where useful
- avoid loading school-wide datasets when user scope is one class/subject
- indexes must reflect tenant + school + effective-date query patterns

## Security

Minimum architecture expectations:

- least privilege
- server-side authorization on every sensitive mutation/read
- strong tenant isolation
- protected object storage
- audit of sensitive-record access where warranted
- rate limiting/abuse controls on public endpoints
- no secrets in client bundles
- encryption in transit and managed storage encryption
- secure backup/recovery plan
- privacy-aware exports

Sensitive learner-support domains require additional policy enforcement beyond ordinary role membership.

## Observability

Production should eventually provide:

- structured logs
- error tracking
- job monitoring
- audit queries
- performance metrics
- sync failure diagnostics

Observability must avoid leaking sensitive learner data into logs.

## Deployment

Initial deployment can use a managed web platform and managed PostgreSQL/object storage to minimize operational burden.

Production and preview environments must be separated.

Schema migrations must be repeatable and reviewed.

## Testing strategy

At minimum:

- domain unit tests for rules
- tenant-isolation tests
- authorization tests
- workflow transition tests
- academic calculation golden tests
- promotion rule fixtures
- statutory mapping fixtures
- offline/sync conflict tests
- document snapshot/structure tests where useful
- end-to-end tests for critical teacher/admin workflows

## Architecture constraint

ScolaPro should remain simple to operate internally even while modeling a complex education system. Complexity belongs in explicit domain models and deterministic rules—not in duplicated forms, hidden calculations, or scattered conditional code.
