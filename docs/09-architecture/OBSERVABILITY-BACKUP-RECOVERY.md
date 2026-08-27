# ScolaPro Observability, Backup & Recovery

## Objectives

ScolaPro must make failures visible, preserve recoverability and support investigation without exposing sensitive learner data in logs.

## Observability

Capture:
- application errors;
- API latency and error rate;
- database performance;
- failed authorization attempts at an aggregate/security level;
- background-job backlog and failures;
- external provider health;
- document-generation failures;
- offline sync conflicts;
- deployment and migration status.

## Logging

Structured logs should include correlation/request IDs, tenant/school IDs where safe, operation name and status. Do not log passwords, tokens, full medical/support notes, complete mark sheets or unnecessary personal data.

## Error Tracking

Use an error-tracking provider for stack traces and release correlation. Scrub sensitive payloads before transmission.

## Health Checks

Expose internal health/readiness checks for application, database and required dependencies. External messaging/AI failures should normally degrade their feature rather than mark the entire school application unavailable.

## Backups

Use managed PostgreSQL backups plus point-in-time recovery where available. Object storage should have provider durability/versioning controls where appropriate.

Backup policy must define:
- frequency;
- retention;
- encryption;
- responsible owner;
- recovery objective;
- restore test cadence.

A backup is not considered trustworthy until restore has been tested.

## Recovery

Document recovery for:
- accidental data mutation;
- failed migration;
- application deployment rollback;
- database outage;
- object-storage issue;
- provider/integration outage.

Official marks, statutory snapshots and audit history warrant particularly conservative recovery procedures.

## Operational Dashboards

Platform administration should eventually expose health summaries: database health, job failures, communication delivery, storage usage, backup freshness and tenant-level anomalies without exposing tenant content unnecessarily.

## Incident Handling

For material incidents: identify, contain, preserve evidence, recover, validate data integrity, communicate appropriately and record corrective actions. Never conceal a failed statutory or academic operation behind a generic success message.
