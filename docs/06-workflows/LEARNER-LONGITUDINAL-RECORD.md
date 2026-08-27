# Learner Longitudinal Record

## Purpose

ScolaPro maintains one continuous learner history across academic years and school transfers while preserving the provenance, privacy and immutability of historical records.

This model is the foundation for the future Cumulative Report Card (CRC), learner support, transfer history, academic progression and Ministry-level longitudinal analysis.

The official CRC layout can be mapped onto this foundation when the latest form is obtained without redesigning the learner data model.

## Core principle

A learner is not a collection of yearly profiles. The learner has one longitudinal identity with time-bound school enrolments and append-only historical events.

## Core domains

The learner timeline can contain:

- identity and demographic information
- guardian/family relationships
- contact/address history
- enrolment history
- grade/class placement history
- subject enrolment history
- academic results
- promotion decisions
- attendance events
- conduct incidents and positive achievements
- learner-support interventions
- restricted health/wellbeing records
- extracurricular participation and achievements
- documents and evidence
- textbook/LTSM allocations
- communication history where appropriate
- transfer events
- CRC/statutory snapshots

## Identity vs school enrolment

### Learner identity
Represents the continuing person record.

### School enrolment
Represents a learner's relationship with a particular school for a defined period.

A transfer closes one school enrolment and opens another; it must not create a new unrelated learner history.

## Effective dating

Important mutable profile fields require effective dates or change history so the system can answer questions such as:

- What was the learner's class on 15 March 2026?
- Which guardian/address was current when this communication was sent?
- Which subjects was the learner registered for at the census snapshot?

Historical reports must not be recomputed using today's profile state when the historical state is required.

## Profile change workflow

Routine details such as contact information or address may be proposed by authorized parents, learners, class teachers or staff depending on school policy.

Sensitive/legal identity changes may require administrative review and evidence.

Suggested change-request structure:

- field
- current value
- proposed value
- effective date
- requested by
- reason
- evidence/document
- review status
- reviewed by
- audit timestamp

## Transfer model

When a learner transfers:

1. Sending school closes its active enrolment.
2. Historical sending-school records remain accessible there according to policy but become immutable operational history.
3. Receiving school creates a new enrolment linked to the same learner identity or verified transfer package.
4. Receiving school may view authorized historical information but cannot rewrite records created by the sending school.
5. New records are appended under the receiving school's provenance.

Every historical entry retains:

- originating school
- tenant/authority
- author/recorder
- effective date
- creation date
- update/version history where applicable

## CRC foundation

The eventual CRC should be treated as a governed view/snapshot over longitudinal data, not an independent manually maintained file.

Likely CRC source areas include:

- academic/report-card history
- attendance
- behaviour/conduct
- achievements
- school transitions
- learner-support notes/interventions
- psychological/physical/health information where officially required and legally permitted

Until the current official CRC specification is verified, ScolaPro must not assume exact fields or disclosure rules. The data model should remain extensible and permission-aware.

## Sensitive information

Health, disability, vulnerability, pregnancy, psychological, safeguarding, domestic violence, legal and similar records require stronger controls than ordinary learner profile data.

Requirements:

- least-privilege access
- purpose-aware roles
- access audit trail
- aggregate/statistical use separated from individual record visibility
- no accidental exposure in generic learner lists, reports, exports or parent views
- redaction/visibility rules for transfer packages where required

The system must never treat access to a learner profile as permission to see every longitudinal record.

## Attendance history

Attendance events retain the actual attendance date/period separately from when the record was captured.

One learner may naturally have different statuses/reasons on different dates or periods.

Example:

- Monday: absent — sick
- Tuesday: absent — transport
- Wednesday: present
- Thursday: late — transport

Attendance status and attendance reason are separate reference concepts.

## Conduct and achievement

The learner timeline should support both negative and positive events.

Examples include:

- misconduct/discipline incident
- commendation
- leadership
- academic achievement
- sport/cultural achievement
- improvement/merit recognition

Do not reduce a learner's longitudinal conduct record to a single point score.

## Academic history

Only approved/official academic results populate the official longitudinal academic history.

Working marks, drafts, formative observations and teacher-only notes remain linked to the academic process but are not automatically equivalent to official report-card results.

Academic history should preserve:

- academic year
- term/cycle
- school
- grade
- subject and curriculum version
- official result
- symbol/grade band version
- promotion outcome
- report-card snapshot/reference

## Class lists and historical membership

Class and subject lists should derive from effective-dated enrolment and allocation records.

This allows ScolaPro to generate both today's list and historically correct lists for earlier dates.

## Audit and integrity

Critical learner history should use append/version semantics rather than destructive overwrite.

Corrections must retain:

- previous value/version
- reason for correction
- actor
- timestamp
- approval where required

## Ministry/region analytics

Longitudinal records may support authorized aggregate analysis such as:

- attendance trends
- progression/repetition
- school-leaving trends
- learner mobility
- support-resource demand

Individual-sensitive data must not become generally visible merely because aggregates are useful.

## Guardrails

- Never create disconnected learner histories for routine transfers where continuity can be verified.
- Never allow a receiving school to rewrite another school's historical records.
- Never expose restricted wellbeing/support data through generic profile permissions.
- Never overwrite historical context using current values.
- Preserve official academic snapshots and rule versions.
- Keep CRC implementation flexible until the current official CRC specification is verified.
