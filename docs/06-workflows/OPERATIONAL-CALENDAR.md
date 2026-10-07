# ScolaPro Operational Calendar

## Purpose

The operational calendar is a governed source for **when school operates, what is happening, who it applies to, and whether the event changes learner attendance expectations**.

It extends the existing academic-term, learner-calendar, bell-schedule and attendance foundations. It does **not** create a second attendance calendar.

The standing rule is:

> An event existing on a date does not make that date a school day or a non-school day. The operational effect must be explicit.

## Calendar layers

ScolaPro resolves four calendar layers together:

1. **Official learner/teacher calendar metadata**
   - learner term opening/closing boundaries remain canonical in academic_terms and are the operational calendar for learner-facing school activity;
   - attendance/register availability, curriculum pacing, teaching-plan capacity and normal timetable availability follow learner boundaries;
   - teacher opening/closing dates are stored separately as administrative duty/leave metadata and do not open learner registers;
   - published learner school-day totals are validation targets, not manually forced operational totals.
2. **Learner teaching-impact calendar**
   - national baseline and school overlays in the existing learner-calendar domain;
   - NORMAL, NO_TEACHING, PARTIAL_DAY, ALTERED_TIMETABLE, EXAM_TIMETABLE.
3. **School and department operational events**
   - meetings, examinations, ceremonies, sport, school activities, deadlines, submissions, teaching cutoffs and HOD class visits;
   - informational by default.
4. **School-day overrides**
   - explicit closure or special/replacement school-day decisions;
   - national/regional/school/emergency source is retained and audited.

Hostel calendars remain a separate domain. Hostel opening, home-weekend and closing dates do not alter learner-register eligibility unless an independent learner school-day rule says so.

## Source evidence used for the 2026 baseline

Control Room supplied the Republic of Namibia / Ministry **2026 Calendar for Government Schools** on 6 October 2026.

The source states the following learner calendar:

| Term | Learner first day | Learner last day | Published school days |
| --- | --- | --- | ---: |
| Term 1 | 12 January 2026 | 28 April 2026 | 75 |
| Term 2 | 1 June 2026 | 20 August 2026 | 59 |
| Term 3 | 7 September 2026 | 4 December 2026 | 65 |
| **Total** | | | **199** |

The same source separately gives teacher dates:

| Term | Teacher first day | Teacher last day |
| --- | --- | --- |
| Term 1 | 8 January 2026 | 30 April 2026 |
| Term 2 | 29 May 2026 | 21 August 2026 |
| Term 3 | 3 September 2026 | 8 December 2026 |

The source explicitly identifies:

- 3 April — Public Holiday: Good Friday;
- 6 April — Public Holiday: Easter Monday;
- 16 June — Day of the African Child, **Commemoration**;
- 28 September — Day of the Namibian Child, **Commemoration**;
- 5 October — **School Holiday: International Teacher's Day**.

A commemoration is not treated as a closure merely because it is listed. The explicit school-holiday wording on 5 October is a non-school-day instruction.

### Published-total reconciliation

Published day counts are stored independently from resolved operational day counts.

This is deliberate. The supplied 2026 source states 65 Term 3 school days while also identifying 5 October as a school holiday. The Monday-Friday span from 7 September through 4 December contains 65 weekdays before excluding that holiday. ScolaPro must therefore surface the discrepancy rather than silently change the source or force attendance to match a printed total.

The UI reports:

- **published learner days** — exactly what the source states;
- **resolved learner days** — what the governed term + closure/special-day rules produce.

Attendance and registers use the resolved calendar.

## School-day resolution

app_private.is_expected_school_day(school_id,date) is the final learner-register gate.

Resolution order:

1. An explicit school_day_overrides row wins.
2. Without an override, a date outside a configured learner term is not a school day.
3. A canonical learner-calendar NO_TEACHING event closes the date.
4. Otherwise Monday-Friday inside a learner term is a normal expected school day.
5. A deliberately configured special school day can explicitly open a normally closed date, including an approved weekend/replacement day.

Consequences:

- registers do not open before learner term opening or after learner term closing, even when teachers are on duty;
- term-boundary edits are governed calendar changes and re-resolve attendance/timetable/planning consumers;
- public/school holidays do not create mass absences;
- school activities do not close registers unless leadership explicitly sets a learner-day effect;
- a later official closure does not delete already captured attendance; historical observations remain auditable and the date is excluded from resolved operational totals.

See docs/06-workflows/ATTENDANCE-ENGINE.md.

## School operational events

Leadership can create school events such as:

- parent meetings;
- LRC activities;
- examinations;
- workshops;
- exhibitions;
- competitions;
- staff meetings;
- ceremonies and prize-giving;
- cultural programmes;
- teaching cutoffs;
- school-wide deadlines.

A school event carries:

- title;
- event type;
- date/range and optional time;
- audience;
- notes/instructions;
- optional linked module/path;
- source/provenance;
- explicit learner-day effect.

Default learner-day effect is **UNCHANGED**.

Examples:

- Parent Meeting: Grade 8 & 9 → informational, registers unchanged.
- Day of the Namibian Child Commemoration → informational, registers unchanged.
- International Teacher's Day (School Holiday) → NO_TEACHING, learner registers closed.
- approved replacement Saturday → SCHOOL_DAY, learner registers explicitly opened.

## Namib High third-trimester operational example

Control Room also supplied Namib High's internal **Important Dates for the Third Trimester 2026** sheet.

It contains school operational events such as:

- first school day for teachers / learners;
- parent meetings;
- FNB visit;
- LRC voting/camp;
- Grade 9 subject-choice meeting;
- NSSCO/NSSCAS activities and examinations;
- art exhibition;
- blood clinic;
- choir competition;
- photo day;
- Heritage & Readathon Week;
- Talent Show;
- staff meeting;
- senior prize-giving and valedictory service;
- matric farewell;
- preliminary Grade 8-10 examination;
- 5 October International Teachers Day (School Holiday);
- last teaching day for Grade 11;
- last teaching day for AS Level.

These rows demonstrate why **event type** and **school-day effect** are separate.

## Department / HOD calendar

HOD calendar authority is derived from effective subject_department_responsibilities. A role label alone does not create department scope.

An HOD may create compact department events for the portfolio they currently govern, for example:

- CASS marks due;
- target marks due;
- question-paper or memo moderation;
- schemes / teaching-file submission;
- departmental meeting;
- class visit / lesson observation;
- academic-analysis submission;
- intervention deadline.

Department events may target:

- the whole governed department; or
- one teacher who is currently allocated within that governed subject portfolio.

Department events **cannot alter learner school-day status**.

Leadership may view/manage department calendar scope where existing school-leadership authority permits it.

## Staff upcoming view

Relevant operational events appear in a compact **Upcoming** card on the staff dashboard.

Visibility is contextual:

- whole-school event → school staff;
- department event → HOD/leadership plus teachers allocated inside that department;
- specific-teacher event → target teacher plus governed HOD/leadership.

The dashboard is a convenience read model. /calendar remains the full operational workspace.

## Manual entry and OCR import

Both entry paths are supported.

### Manual

Calendar → Add event

Leadership creates school events. HODs create department events inside their governed portfolio.

### OCR / source intake

Calendar → Import / OCR

The existing private document-intake workflow is reused:

1. upload source image;
2. retain private source artifact + checksum provenance;
3. optional OCR extracts draft rows;
4. user reviews/corrects every row;
5. user explicitly approves create/update/ignore;
6. only reviewed rows can commit.

OCR is optional. Manual/structured entry remains available when AI/OCR is not configured.

Current automatic OCR accepts JPEG, PNG and WebP through the server-only SCOLAPRO_AI_* adapter. PDF sources can still be retained as intake evidence or entered through structured/manual review; a PDF must never be silently published merely because it was uploaded.

OCR rules:

- extract only visible facts;
- do not invent dates/times/audiences;
- default event effect to NORMAL / informational;
- classify NO_TEACHING only when the source explicitly states school holiday, no school, closure or equivalent;
- commemorations and ordinary activities remain normal unless the source says otherwise;
- OCR output is staging evidence, never authoritative data before human review.

## Attendance integration

Daily/register attendance must use resolved expected school days.

A non-school day:

- does not generate learner absences;
- does not reduce attendance percentages;
- does not count toward possible attendance days;
- does not open a normal daily register.

Subject-period observations remain a separate stream and do not redefine the statutory learner school day.

## Timetable and teaching integration

Calendar effects feed timetable/teaching capacity:

- NORMAL — normal timetable;
- NO_TEACHING — no normal learner teaching;
- PARTIAL_DAY — partial-day capacity;
- ALTERED_TIMETABLE — alternate effective bell schedule;
- EXAM_TIMETABLE — examination-day schedule.

School operational activities with UNCHANGED effect do not remove teaching time.

Teaching-cutoff events, for example a Grade 11 final teaching day before examinations, are operational planning events unless a separate governed timetable/learner-day effect is configured.

## Audit and correction

Calendar changes are append/audit oriented.

The Calendar workspace exposes **Calendar adjustments & exceptions** for school leadership. National/public baseline events remain visible source evidence. A school-level adjustment changes the effective learner day for the school without rewriting or deleting the baseline event. Existing adjustments can be edited by saving a revised effective state for that date.

Register documents surface the governed non-teaching reason in the affected date column (for example, Good Friday or International Teacher's Day) while keeping attendance/numeric columns compact and content-width driven.

Calendar changes are append/audit oriented.

Do not:

- delete attendance because a date was later reclassified;
- infer a closure from a generic event title;
- let an HOD close the whole school;
- overwrite the published Ministry day count merely to make it agree with calculated days;
- publish OCR output without human review;
- mix hostel days into learner school-day calculations.

## Acceptance rules

The operational calendar is correct when:

- learner term boundaries govern normal register opening/closing;
- explicit holidays/closures close registers;
- explicit special days can open an otherwise closed date;
- published and resolved day totals are both visible;
- school activities are informational by default;
- HOD deadlines/class visits are department-scoped;
- teachers see relevant upcoming events without browsing source files;
- OCR source rows remain reviewable drafts until committed;
- attendance history remains auditable after calendar corrections.
