# ScolaPro Security & Privacy Model

## Purpose

ScolaPro handles learner, family, academic, attendance, conduct, support, staff and statutory information. Security and privacy are therefore core architecture concerns, not optional add-ons.

## Principles

1. Least privilege by default.
2. Tenant and school isolation at database and application layers.
3. Sensitive learner-support data receives stricter controls than ordinary school records.
4. Roles alone are insufficient; authorization must include scope, relationship and context.
5. Historical records must remain attributable and auditable.
6. Public or parent-facing access must expose only explicitly permitted data.
7. Secrets never belong in source control or client bundles.
8. Access to restricted records must be reviewable through audit logs.

## Data Sensitivity Classes

### Class A — Public / low sensitivity
Examples: public school profile, public notices, published calendar entries.

### Class B — Internal operational
Examples: staff allocations, class lists, non-sensitive timetable data, routine notices.

### Class C — Personal school record
Examples: learner identity, parent contacts, attendance, academic results, ordinary conduct records.

### Class D — Restricted learner support
Examples: psychological information, medical/support details, vulnerability, pregnancy, disability accommodations, safeguarding-related notes.

### Class E — Security / credentials
Examples: authentication secrets, API keys, recovery tokens, encryption material.

Controls increase from A to E.

## Authorization Model

Authorization decisions must consider:
- tenant membership;
- school membership;
- role;
- academic assignment;
- class/register-teacher relationship;
- department/HOD scope;
- learner/guardian relationship;
- explicit learner-support assignment;
- record sensitivity;
- workflow state.

A teacher assigned to Grade 8A Physical Science may access relevant academic records for that class but does not automatically gain access to restricted counselling notes.

## Sensitive Learner Support

Restricted support records require explicit permission groups and should support:
- minimum necessary fields;
- restricted visibility;
- access audit;
- redacted summaries where appropriate;
- controlled exports;
- provenance and author attribution.

School leadership may receive aggregate risk/readiness indicators without automatically receiving every confidential note.

## Authentication

Initial platform assumption: managed authentication through Supabase Auth or an equivalent provider.

Requirements:
- secure session handling;
- MFA capability for privileged roles;
- password reset/recovery;
- account disablement;
- device/session revocation;
- server-side authorization on every protected operation.

## Data Protection

Use encryption in transit and provider-supported encryption at rest. Highly sensitive application secrets are stored only in managed secret stores/environment configuration.

Files use private object storage by default. Access should use short-lived signed URLs or authenticated proxy access rather than permanent public links.

## Audit Expectations

Audit at minimum:
- authentication-sensitive administrative actions;
- role and permission changes;
- restricted learner-support access where practical;
- mark reopening/locking;
- promotion changes;
- record deletion/archival actions;
- statutory submission/certification;
- document generation of sensitive reports.

## Data Retention and Deletion

Retention must respect school, Ministry and legal obligations. ScolaPro must distinguish:
- correcting inaccurate data;
- archiving inactive records;
- removing operational drafts;
- retaining official historical records.

Official academic, census and audit records must not be destroyed through ordinary UI deletion.

## Security Baseline

Before production:
- RLS policies tested;
- dependency and secret scanning enabled;
- authorization tests for cross-tenant access;
- backup/restore tested;
- rate limiting for public/auth endpoints;
- secure file upload validation;
- security headers;
- logging without leaking sensitive payloads.
