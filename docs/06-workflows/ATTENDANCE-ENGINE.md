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
- optional evidence/attachment where policy permits
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

## Daily Register Workflow

Default workflow:

1. Open current class/register.
2. Everyone defaults to Present.
3. Teacher taps only exceptions.
4. Select status and optional reason.
5. Add optional note.
6. Add optional evidence such as a medical note, parent letter, photograph or PDF.
7. Confirm attendance.

The UI must keep evidence optional and secondary so the common attendance path remains fast.

Normal day navigation skips Saturday and Sunday. Direct weekend dates should normalize back into a school-day context unless a special school event explicitly makes the weekend a valid attendance day.

## Evidence and Attachments

Attendance evidence is supporting documentation, not the attendance event itself.

Current implementation rules:

- private storage bucket;
- JPG, PNG, WebP and PDF supported;
- maximum file size 5 MB;
- mobile image capture may use the device camera;
- evidence is linked to the register submission and learner enrolment;
- metadata preserves uploader, date, filename, MIME type and school scope;
- access follows attendance authorization and must remain subject to future sensitive-data refinement;
- replacing an attendance record must not silently destroy historical evidence.

Evidence should never be placed in a public bucket or exposed through broad analytics.

## Weekly Review and Capture

The weekly matrix is a first-class operational capture mode, not only a report.

- learners are rows;
- Monday-Friday are columns;
- Saturday and Sunday are excluded from the normal register week;
- everyone defaults to Present;
- each learner/day can have its own status, reason and note;
- users can filter to all learners or exception rows and search for a specific learner;
- selecting a learner/day opens a compact editor rather than expanding every cell into a large form;
- one weekly confirmation creates separate auditable daily submissions for each school day;
- weekly submission is atomic at the database layer so the week does not become partially confirmed if one day fails.

This supports schools that keep a physical register during the week and reconcile it electronically later, for example on Friday.

## School-Day Calendar Rules

A calendar date existing does not mean it is an expected attendance day.

Baseline:

- Monday-Friday are normal candidate school days;
- Saturday/Sunday are excluded by default;
- academic-term dates determine whether the day belongs to an active term;
- future school-calendar overlays must exclude public holidays, school closures and other non-teaching days;
- an explicitly configured special school event may make an otherwise excluded date valid.

Attendance percentages and absence counts must use expected school days, not raw calendar-day counts.

## Register vs Subject Attendance

Morning/register attendance and subject-period attendance are distinct observations. A learner may be present at morning registration and absent from a later lesson.

The system must not overwrite one with the other.

## Late and Retrospective Capture

Schools may permit attendance to be captured after the original school day. The system should:

- preserve original attendance date;
- preserve actual recording timestamp;
- identify backdated entries in audit history;
- optionally require reason/approval after a configurable threshold;
- never falsely imply that a late entry was recorded contemporaneously.

## Confirmation and Revision

Current implementation uses append-oriented register submissions rather than destructive rewriting.

A later correction references/replaces the prior effective register while preserving history. Future product language may expose lifecycle labels such as Draft, Confirmed, Corrected and Locked where policy requires them.

## Parent Communication

Attendance can trigger communication rules without coupling communication delivery to the attendance record itself.

Example:

Confirmed absence -> notification rule -> SMS/WhatsApp/email/app -> delivery status.

Schools can require approval before sending sensitive notifications.

## Offline Operation

Attendance is a priority offline workflow.

- class lists cached locally;
- teacher can record without connectivity;
- pending operations enter sync queue;
- server resolves authorization and version checks on sync;
- duplicate retries are idempotent;
- conflicts are surfaced rather than silently discarded.

The current online register already uses client mutation identifiers so the same server model can support later offline synchronization.

## Analytics

Derived outputs include:

- daily attendance percentage;
- learner attendance history;
- class/grade trends;
- persistent absence alerts;
- reason distributions;
- attendance used in report cards/promotion where applicable;
- EMIS/AEC aggregates.

Sensitive absence reasons and supporting evidence must not automatically be exposed in broad dashboards.
