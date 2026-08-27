# Admissions, Transfers and Year-End Progression

## Purpose

Learner movement must preserve identity and longitudinal history while keeping each school's operational records accurate by effective date.

## Learner Identity vs Enrolment

A learner is a person with a longitudinal identity. An enrolment is the learner's relationship to a specific school, grade/class and academic period.

Do not create a new learner identity simply because a learner changes class, grade or school.

## Admission Workflow

1. Search for possible existing learner identity using permitted identifiers.
2. Create or link learner identity.
3. Capture guardian/family relationships.
4. Capture admission and prior-school information.
5. Assign academic year, grade, class/register group and subjects.
6. Validate required profile information.
7. Create effective enrolment.
8. Trigger downstream access to class lists, attendance, timetable, assessment and LTSM.

Duplicate detection should assist users but never merge learners automatically without an authorized review.

## Profile Change Requests

Ordinary contact/address information may be proposed by authorized guardians/class teachers where enabled. Identity/legal fields require stronger review and evidence.

A change request preserves:

- existing value
- proposed value
- requester
- reason/evidence
- reviewer
- decision
- effective date
- audit history

## Internal Class/Grade Changes

Class or subject movement is effective-dated. Historical attendance, marks and timetable records continue referencing the learner's membership at the time.

## Transfer Out

A transfer-out event should:

- close the source-school active enrolment on an effective date
- preserve source-school records as historical and read-only
- settle/flag outstanding school obligations without deleting history
- generate transfer documentation where required
- allow an authorized receiving-school continuation process

The sending school must not lose its historical record simply because the learner transfers.

## Transfer In

The receiving school continues the learner timeline with a new enrolment. Source-school historical records retain provenance and must not become editable by the receiving school.

Access to cross-school history must follow policy, consent/statutory authority and sensitive-data permissions.

## Withdrawal / Left School

Withdrawal, dropout, completion, death and other exit reasons are explicit enrolment outcomes, not deletion operations. Reason registries and statutory classifications are versioned where required.

## Year-End Progression

Year-end progression consumes approved academic/promotion decisions and creates next-year enrolment proposals.

Workflow:

1. Freeze required academic inputs.
2. Run promotion engine under the applicable rule version.
3. Resolve exceptions/condonation/manual rulings.
4. Principal/authorized role certifies final decisions.
5. Generate promotion schedule and statutory outputs.
6. Create next-year grade/class placement proposals.
7. Review transfers/exits/repeaters.
8. Publish new academic-year enrolments on effective date.

Promotion decisions must never rewrite prior-year academic results.

## Status Vocabulary

ScolaPro should support policy-defined outcomes such as promoted, not promoted, condoned, passed/completed, transferred or other official states, but the exact vocabulary and meaning belong to a versioned promotion policy rather than hard-coded UI logic.

## Historical Accuracy

Every class list, attendance register, report and statutory snapshot must be reconstructable for its effective date even after later learner movement.
