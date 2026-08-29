# Learner Longitudinal Record

## Purpose

ScolaPro maintains one continuous learner history across academic years and school transfers while preserving the provenance, privacy and immutability of historical records.

This model is the foundation for the Cumulative Record Card (CRC), learner support, transfer history, academic progression and Ministry-level longitudinal analysis.

The CRC mapping below is based on the physical Namibian foldable learner record supplied from a school in August 2026. ScolaPro must preserve the information purpose of that record without recreating paper-era duplication inside the database.

## Core principle

A learner is not a collection of yearly profiles. The learner has one longitudinal identity with time-bound school enrolments and append-only historical events.

The CRC is a governed view/export over those source records. It is not a second editable copy of identity, marks, attendance, conduct or support data.

## Core domains

The learner timeline can contain:

- identity and demographic information
- guardian/family relationships
- contact/address history
- enrolment and previous-school history
- grade/class placement history
- subject enrolment history
- academic results and report-card snapshots
- promotion decisions
- attendance events
- conduct incidents and positive achievements
- learner-support interventions and learning difficulties
- restricted physical/health history
- highly restricted psychometric-test history
- personality-development observations
- general recommendations/interviews
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

## Verified Namibian CRC mapping

The photographed cumulative record contains the following sections. Where ScolaPro already owns the information in another governed domain, the CRC reads from that source of truth rather than storing a duplicate value.

| Paper CRC section | ScolaPro source of truth | Handling |
| --- | --- | --- |
| Identity number, surname, sex, photo, home language | learner identity/profile | Reuse current/effective-dated learner data. |
| Residential/postal address | learner/profile address history | Reuse effective-dated address records; do not copy into CRC tables. |
| Father/guardian, mother, occupation and phone | guardian identity, relationships and contacts | Reuse guardian records and relationship history. |
| Church/religious detail | optional school-policy demographic field only if there is a lawful/operational need | Do not make mandatory merely because the legacy paper card contains it. |
| Schools attended, medium, admission/departure dates and grades | enrolments/transfers plus `learner_prior_school_history` for legacy/non-ScolaPro schools | Existing ScolaPro enrolments remain canonical; use the history table for verified records that pre-date ScolaPro. |
| Exemption from compulsory education / initial school-entry age | `learner_prior_school_history` | Historical evidence; not a routine profile field. |
| Physical condition/general health/problem/disability/previous illness | `learner_health_history` and learner-support domain | Restricted. A generic learner-profile permission must never reveal this section. |
| Primary/secondary subject performance grid | approved report-card snapshots and curriculum/subject history | Do not manually re-enter marks into CRC. |
| Average learner/grade result and pass/fail | approved report/progression sources | Derive from certified historical data and retain the rule/snapshot provenance. |
| School attendance notation | attendance history / certified report snapshot | Derive from the relevant academic period. |
| Psychometric data: date, test, grade, tester, remarks | `learner_psychometric_records` | Highly restricted ledger; detailed test evidence remains in governed support/document storage. |
| Learning disabilities/problems/difficulties: nature, action, result | learner-support cases/interventions | Reuse the support workflow; do not duplicate it in a separate CRC note table. |
| Problematic behaviour / nature of offence | conduct events | Reuse audited conduct history. |
| Psychological personality-development observation | `learner_development_observations` | Year/grade narrative with author provenance. |
| Social personality-development observation | `learner_development_observations` | Year/grade narrative with author provenance. |
| Overall impression | `learner_development_observations` | Year/grade narrative with author provenance. |
| General remarks / recommendations / interviews | `learner_cumulative_notes` | Typed longitudinal notes with sensitivity and recorder provenance. |

The legacy form also provides guidance prompts for psychological, emotional, motivational, home, school and environmental observations. These prompts are guidance for trained/authorized staff; they are not labels to infer diagnoses or personality traits automatically.

## CRC composition and transfer

A future **Cumulative Record** screen/export should compose, in chronological context:

1. verified identity and guardian summary;
2. schools/enrolments attended;
3. academic/report history and progression;
4. attendance summary for the corresponding period;
5. conduct/achievement history according to disclosure policy;
6. learner-support material only where the recipient is entitled to receive it;
7. restricted health and psychometric sections under separate permission checks;
8. personality-development observations;
9. general recommendations/interviews;
10. transfer provenance and originating school for every historical entry.

A transfer package must not automatically expose every restricted section. Transferability and visibility are separate decisions: the record may be longitudinal while specific health, psychological, safeguarding or support information remains need-to-know.

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
- Never include all sensitive CRC sections in a transfer/export merely because they exist.
- Never overwrite historical context using current values.
- Preserve official academic snapshots and rule versions.
- Keep the digital CRC compositional: authoritative domain data should appear once and be reused.
