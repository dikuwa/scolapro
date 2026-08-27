# ScolaPro Testing & Quality Strategy

## Goal

ScolaPro must be dependable enough for real attendance, marks, promotion, statutory reporting and learner records. Testing therefore focuses first on business invariants and data isolation, then UI behavior.

## Test Layers

### Unit tests
Target deterministic domain rules:
- grading calculations;
- assessment weighting/conversion;
- promotion evaluation;
- timetable conflict rules;
- attendance status/reason validation;
- curriculum pacing calculations;
- textbook status transitions.

### Integration tests
Exercise PostgreSQL, RLS, transactions and storage boundaries. Every sensitive domain requires cross-tenant and cross-school negative tests.

### Workflow tests
Cover end-to-end domain state transitions such as:
- marks draft → submitted → HOD review → verified → locked;
- admission → enrolment → class assignment;
- transfer out → immutable history → receiving-school continuation;
- textbook issue → return/lost/damaged;
- statutory readiness → certification snapshot.

### UI tests
Prioritize high-frequency teacher/admin paths: attendance, marks entry, learner search, timetable, lesson preparation, report generation.

### Offline tests
Simulate connection loss, queued mutations, retries, duplicates and conflicts. Verify that offline retries cannot duplicate attendance, marks or book transactions.

## Test Data

Use generated/anonymized fixtures only. Production learner data must never be copied into normal developer fixtures.

Fixtures should represent:
- multiple tenants and schools;
- phases and grades;
- teacher assignments;
- guardian relationships;
- restricted learner-support records;
- varying academic schemes;
- historical years.

## Invariant Tests

Examples:
- a mark cannot exceed raw maximum unless explicitly permitted by rule;
- absence is never silently converted to zero;
- locked verified marks cannot be edited through ordinary APIs;
- a tenant user cannot access another tenant's learner;
- a receiving school cannot rewrite a source school's historical transfer record;
- a textbook copy cannot be issued simultaneously to two learners.

## Migration Tests

Every schema migration must be testable on a representative database snapshot. Destructive migrations require explicit review and a rollback/restore strategy.

## Release Gates

Before production deployment:
- lint/typecheck pass;
- unit/integration tests pass;
- migration dry-run succeeds;
- RLS isolation suite passes;
- critical workflow smoke tests pass;
- no committed secrets;
- backup status healthy.

## Pilot QA

Pilot schools should report friction as structured feedback. Track task completion time and error frequency for attendance, marks and reports rather than judging usability only by visual preference.
