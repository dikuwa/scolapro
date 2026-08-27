# ScolaPro Attendance Engine

## Purpose

Attendance must be fast enough for real classroom use while preserving an auditable, longitudinal record for school operations, learner support, parent communication and statutory reporting.

## Core Principle

Attendance status and attendance reason are separate concepts.

Examples:

- Absent + Sick
- Absent + Transport
- Late + Overslept
- Present + no reason

## Attendance Events

Each attendance event records at minimum:

- tenant/school
- learner
- attendance date
- optional timetable period/lesson
- attendance scope: register/morning or subject-period
- status
- reason code where applicable
- note
- evidence/attachment where policy permits
- recorded by
- recorded timestamp
- source/device/sync metadata

`attendance_date` is distinct from `recorded_at` so legitimate retrospective capture is supported.

## Supported Statuses

The exact registry is school/policy configurable, but the model should support statuses such as:

- present
- absent
- late
- left early
- excused
- unknown/unconfirmed

Reasons are maintained in a separate structured registry and can contain sensitive classifications with stricter access controls.

## Daily Teacher Workflow

Default workflow:

1. Open current class/register.
2. Everyone defaults to Present.
3. Teacher taps only exceptions.
4. Select status and reason.
5. Save draft or confirm attendance.

This minimizes clicks for the common case.

## Weekly Review

A weekly matrix can show learners vertically and days horizontally for review/confirmation. Multiple days for the same learner can carry different statuses/reasons naturally; no artificial "add line" concept is required in the data model.

## Register vs Subject Attendance

Morning/register attendance and subject-period attendance are distinct observations. A learner may be present at morning registration and absent from a later lesson.

The system must not overwrite one with the other.

## Late and Retrospective Capture

Schools may permit attendance to be captured after the original school day. The system should:

- preserve original attendance date
- preserve actual recording timestamp
- identify backdated entries in audit history
- optionally require reason/approval after a configurable threshold
- never falsely imply that a late entry was recorded contemporaneously

## Confirmation Lifecycle

Suggested states:

- Draft
- Confirmed
- Corrected
- Locked

Corrections after confirmation must preserve history rather than replace the original silently.

## Parent Communication

Attendance can trigger communication rules without coupling communication delivery to the attendance record itself.

Example:

Confirmed absence -> notification rule -> SMS/WhatsApp/email/app -> delivery status.

Schools can require approval before sending sensitive notifications.

## Offline Operation

Attendance is a priority offline workflow.

- class lists cached locally
- teacher can record without connectivity
- pending operations enter sync queue
- server resolves authorization and version checks on sync
- duplicate retries are idempotent
- conflicts are surfaced rather than silently discarded

## Analytics

Derived outputs include:

- daily attendance percentage
- learner attendance history
- class/grade trends
- persistent absence alerts
- reason distributions
- attendance used in report cards/promotion where applicable
- EMIS/AEC aggregates

Sensitive absence reasons must not automatically be exposed in broad dashboards.
