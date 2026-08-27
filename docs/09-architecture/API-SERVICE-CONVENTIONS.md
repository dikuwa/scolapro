# ScolaPro API & Service Conventions

## Architectural Style

ScolaPro begins as a modular monolith with explicit domain boundaries. Modules share one deployment and PostgreSQL database, but business rules must remain inside domain services rather than leaking into UI components or arbitrary route handlers.

Core domains include identity/tenancy, school structure, learners/enrolment, staff, curriculum, timetable, teaching planning, attendance, assessment, learner support, LTSM, communication, statutory reporting and documents.

## Request Path

Preferred flow:

UI / Server Action / API Route
→ authentication context
→ authorization policy
→ domain service/use case
→ repository/query layer
→ PostgreSQL/storage/integration
→ structured result

UI components must not contain authoritative promotion, grading, attendance, timetable or permission logic.

## API Shape

Use stable resource-oriented URLs for externally meaningful APIs and task-oriented commands for workflows where CRUD language is misleading.

Examples:
- GET /api/classes/{id}/learners
- POST /api/attendance/sessions/{id}/confirm
- POST /api/mark-sheets/{id}/submit
- POST /api/mark-sheets/{id}/return
- POST /api/promotions/{id}/certify

## Response Conventions

Responses should use predictable structures with typed success/error models. Errors should have machine-readable codes and human-readable messages.

Example categories:
- VALIDATION_ERROR
- FORBIDDEN
- NOT_FOUND
- CONFLICT
- WORKFLOW_STATE_INVALID
- OFFLINE_CONFLICT
- RATE_LIMITED

Do not expose raw database errors to clients.

## Idempotency

Mutating operations that can originate from offline queues, retries or payment/integration callbacks require idempotency keys. Repeating the same command must not produce duplicate attendance records, textbook issues, notifications or mark submissions.

## Concurrency

Sensitive records should use explicit version/revision numbers or updated-at preconditions where concurrent editing is possible. Conflict responses must preserve both server and pending client state for reconciliation.

## Validation

Validate at boundaries and enforce critical invariants again in domain/database layers. Never depend only on frontend validation.

## Pagination, Filtering and Search

Large collections use cursor/keyset pagination where practical. Filters should be explicit and composable. Search endpoints must respect tenant/school scope before ranking results.

## Versioning

Internal application APIs can evolve with the application initially. Public/integration APIs must gain explicit versioning before external consumers depend on them.

## Events

Domain services may emit durable domain events for asynchronous work such as notifications, document generation, analytics refresh and statutory snapshot processing. Events represent completed facts, not requests to bypass business rules.

## Transactions

Operations that must succeed atomically use database transactions. Examples:
- year-end promotion + next-year enrolment proposal creation;
- textbook issue + copy status update;
- mark-sheet verification + lock event;
- transfer completion + source enrolment closure.

## Integration Boundary

External providers are wrapped behind adapters. SMS, WhatsApp, email, AI, OCR, object storage and PDF generation must be replaceable without rewriting business domains.
