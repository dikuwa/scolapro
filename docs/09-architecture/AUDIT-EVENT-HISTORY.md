# ScolaPro Audit, Event and History Architecture

## Purpose
ScolaPro must preserve educational, statutory and security history without turning the entire system into an event-sourced application.

## Principle
Use normalized current-state tables for operational work, plus append-only history/event records for changes that matter.

## Event classes

### Business history
Examples:
- learner enrolled/transferred;
- class membership changed;
- subject enrolment changed;
- attendance confirmed;
- mark submitted/verified/reopened;
- promotion decision changed;
- textbook issued/returned/lost;
- statutory snapshot certified.

### Security/audit history
Examples:
- role assignment changed;
- privileged record viewed/exported;
- user impersonation/support access activated;
- bulk download generated;
- RLS-sensitive administrative change.

### Integration events
Examples:
- parent notification requested;
- message queued/delivered/failed;
- offline mutation accepted/conflicted;
- document generation requested/completed.

## Audit event shape
Recommended fields:
- `id`
- `tenant_id`
- `school_id` nullable
- `actor_user_id`
- `actor_role_context`
- `event_type`
- `entity_type`
- `entity_id`
- `occurred_at`
- `request_id` / correlation id
- `source` (web, mobile, offline-sync, background-job, integration)
- `before_summary` where appropriate
- `after_summary` where appropriate
- `metadata` JSONB for bounded contextual data

Avoid storing entire sensitive records in generic audit JSON when identifiers and summarized change information are enough.

## Official academic history
Academic records require stronger semantics than generic audit logs.

- raw mark entry is preserved;
- calculated results can have revisions;
- verification/locking state is explicit;
- reopening creates a new moderation/history event;
- previous certified result remains reconstructable.

Do not overwrite a verified historical result with a new value and rely only on `updated_at`.

## Learner longitudinal history
The learner timeline is assembled from authoritative domain records rather than one giant timeline table. A read model may project:
- enrolments;
- reports/results;
- attendance trends;
- conduct/achievement events;
- support interventions subject to permission;
- transfers;
- documents.

## Effective dating
Use effective dates for relationships whose historical truth matters, such as:
- learner class membership;
- subject enrolment;
- teacher allocation;
- guardian relationship;
- role/scope assignment;
- curriculum applicability.

Current state is `effective_from <= now` and (`effective_to` is null or greater than now).

## Statutory snapshots
Certified EMIS/AEC/DNEA submissions are immutable snapshots. Later corrections create a new revision or correction submission rather than mutating the certified snapshot invisibly.

## Retention
Retention policies will distinguish:
- permanent academic/statutory history;
- operational audit history;
- transient job/integration logs;
- sensitive documents requiring policy-driven retention.

Final retention periods must be verified against Namibian legal/Ministry requirements before production policy is locked.

## Observability vs audit
Application logs are for diagnosing systems. Audit records are business/security evidence. They must not be treated as the same storage mechanism.

## Status
Approved baseline.