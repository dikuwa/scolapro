# ScolaPro Attendance Engine

## Purpose

Attendance must be fast enough for real classroom use while preserving an auditable, longitudinal record for school operations, learner support, parent communication and statutory reporting.

## Core Principle

Attendance status and attendance reason are separate concepts. Just as importantly, **different attendance observations must not be collapsed into one statistic**.

ScolaPro distinguishes three operational streams:

1. **Daily/register attendance** — the official school-day observation used by school attendance reporting and eligible statutory aggregates.
2. **Subject-period attendance** — a teacher's observation for the class/lesson they are teaching. It supports classroom record keeping and discipline but does not replace the daily register.
3. **School late-arrival duty** — morning late-coming captured by an assigned staff member. It drives school discipline/detention rules and is excluded from Ministry attendance statistics.

Examples:

- Absent + Sick
- Absent + Transport
- Late + Overslept
- Present + no reason

## Attendance Events

Each daily or subject-period attendance event records at minimum:

- tenant/school
- learner
- attendance date
- optional timetable period/lesson
- attendance scope/observation type
- status
- reason code where applicable
- note
- optional evidence/attachment where policy permits
- recorded by
- recorded timestamp
- source/device/sync metadata

`attendance_date` is distinct from `recorded_at` so legitimate retrospective capture is supported.

## Supported Statuses

The exact registry is school/policy configurable, but the model supports statuses such as present, absent, late, left early, excused and unknown/unconfirmed. Reasons live in a separate structured registry and sensitive reasons receive stricter access controls.

## Daily Register Workflow

The default workflow is exception-first:

1. Open a register class and school date.
2. Load the complete active class list; everyone defaults to Present.
3. Search by partial learner name/admission number or narrow the list by sex when useful.
4. Tap only exceptions.
5. Select status and optional reason/note/evidence.
6. Collapse the focused editor and continue immediately to the next learner.
7. Confirm attendance.

Daily attendance controls should be compact and semantically coloured. The learner identity must remain visually stronger than the Present/Absent/Late/Excused controls. When exception details are open, the row being edited must be unmistakable.

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
- Saturday/Sunday are excluded;
- every cell defaults to a green Present tick;
- clicking a Present tick once converts that learner/day into an Absent exception and opens one compact editor;
- the editor offers Absent, Late and Excused plus optional reason/note, with a clear action to restore Present;
- only one learner/day editor is open at a time;
- the learner list remains visible behind the editor rather than being displaced by a permanent large editing panel;
- partial search and the same All/Boys/Girls filter used by the daily register are available;
- one weekly confirmation creates separate auditable daily submissions for each school day;
- weekly submission is atomic at the database layer so a week does not become partially confirmed if one day fails.

This supports schools that keep a physical register during the week and reconcile it electronically later, for example on Friday.

## Subject-Period Attendance

Subject-period attendance is already a first-class data concept through `observation_type` plus an optional `timetable_slot_id`.

The operational path is:

**Teacher timetable → current lesson → class list → exception-first subject attendance**

A teacher does not have to be the register/class teacher. Access comes from the active teacher allocation/timetable slot. This observation may support:

- identifying learners who skip a lesson after being present at school;
- teacher classroom records;
- discipline/support follow-up;
- subject/class attendance summaries.

It must not be counted as an additional absence in statutory school-day attendance. A learner can therefore be Present in the morning register and Absent in a later subject period without the two records overwriting one another.

## School Late-Arrival and Detention

School late-coming is deliberately stored outside the statutory attendance tables.

An administrator/principal may delegate the `late_arrival_recorder` duty to one or more staff members for an effective date range. This is a task delegation rather than a permanent global system role.

Baseline workflow:

1. During morning assembly/briefing, the assigned staff member searches the learner and records that the learner arrived late.
2. ScolaPro counts late arrivals in the Monday-Friday school week.
3. The default policy creates a Friday detention obligation when the learner reaches **three late arrivals in the same week**, whether consecutive or not.
4. Completing the detention closes that obligation. The historical late-arrival events remain intact.
5. If detention is not completed, the open obligation is carried forward to the next Friday until completed or explicitly waived by an authorized person.
6. The policy threshold and detention weekday are school-configurable rather than permanently hard-coded into the application.

This workflow must never alter Ministry daily-attendance statistics. Its outputs belong to school discipline, learner support and duty management.

## School-Day Calendar Rules

A calendar date existing does not mean it is an expected attendance day. Monday-Friday are normal candidates; academic-term dates and school-day overrides determine whether a date is actually expected. Public holidays, closures and other non-teaching days are excluded, while explicitly configured special school days can override the baseline.

Attendance percentages and absence counts must use expected school days, not raw calendar-day counts.

## Late and Retrospective Capture

Schools may permit attendance to be captured after the original school day. The system preserves original attendance date, actual recording timestamp and audit provenance. Backdated records must never falsely appear to have been recorded contemporaneously.

## Confirmation and Revision

Daily/weekly register submissions are append-oriented rather than destructively rewritten. Corrections reference the prior effective register while preserving history. Subject-period and late-arrival records follow the same audit principle even though their operational lifecycles differ.

## Parent Communication

Attendance can trigger communication rules without coupling delivery to the attendance record itself. For example: confirmed daily absence → notification rule → SMS/WhatsApp/email/app → delivery status. Sensitive notifications may require approval.

## Offline Operation

Attendance is a priority offline workflow. Authorized class lists can be cached locally; changes enter a sync queue; duplicate retries are idempotent; and server authorization/version checks are authoritative. Conflicts must be surfaced rather than silently discarded.

## Analytics

Derived outputs may include daily attendance percentage, learner history, class/grade trends, persistent absence alerts, reason distributions, subject-period patterns and EMIS/AEC aggregates. School late-arrival/detention analytics are a separate school-discipline stream and must not flow into EMIS/AEC attendance totals.
