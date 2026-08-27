# ScolaPro Communications Engine

## Purpose

Communications are a shared platform service used by attendance, conduct, academics, finance, announcements and learner support. Each module should request communication; modules should not implement their own messaging stacks.

## Channels

Initial architecture should support pluggable channels such as:

- in-app notification
- email
- SMS
- WhatsApp where an approved provider/integration is available

The platform must not assume every school has every channel enabled.

## Recipient Resolution

Recipients are resolved from authoritative relationships and permissions:

- learner -> active guardians/contacts
- class -> enrolled learners/guardians
- subject -> enrolled learners/guardians
- staff role/department -> active staff
- school/grade/group -> membership at effective date

Communication history must preserve who was actually targeted at send time, even if relationships later change.

## Message Lifecycle

Suggested lifecycle:

- Draft
- Queued
- Approval Required (optional)
- Approved
- Sending
- Sent
- Partially Delivered
- Delivered
- Failed
- Cancelled

Provider delivery events are stored separately from the underlying school event that triggered the message.

## Approval Policy

Schools may configure approval requirements by communication type or sensitivity. Routine announcements may send directly, while sensitive conduct/support communication may require approval.

## Templates

Templates should be versioned and can contain safe merge fields such as learner name, date, class, amount/reference, attendance status or school contact details.

Do not expose restricted learner-support information through generic templates.

## Triggered Communications

Examples:

- confirmed learner absence
- conduct referral
- marks/results publication
- overdue textbook
- payment receipt/reminder
- timetable or event change
- school announcement

Trigger rules must be configurable and auditable; recording an event must not automatically imply that a message was sent unless a rule explicitly does so.

## Preferences and Consent

Store guardian/staff contact channels, preferred language/channel where supported, opt-out/consent requirements where applicable and verified contact state.

Critical statutory/school communications may follow different policy than optional announcements.

## Reliability

Outbound sends should use a queue with idempotency keys, retries and provider-response logging. Failed delivery should never roll back the academic/attendance/operational event that caused the notification.

## Offline Boundary

Users may create/queue communications while offline where permitted, but actual provider sending occurs server-side after synchronization and authorization checks.
