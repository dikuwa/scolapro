# Teaching Planning Engine

## Purpose

The Teaching Planning Engine turns the official curriculum into realistic school teaching plans using the actual calendar and timetable capacity available to each subject and class.

It is the shared engine behind:

- Year Planner
- Scheme of Work
- Lesson Preparation
- Syllabus Coverage
- Teacher readiness
- HOD monitoring

These are different views of the same underlying plan, not separate documents maintained independently.

## Planning chain

Curriculum Registry
→ School/Regional/National Calendar
→ Timetable Capacity
→ Department Pacing Plan
→ Class Teaching Schedule
→ Lesson Preparation
→ Actual Teaching Record
→ Coverage & Reflection

## Core principle

The syllabus tells ScolaPro **what** must be taught.

The calendar and timetable tell ScolaPro **when teaching can happen**.

The pacing engine determines **how much curriculum can realistically fit into the available teaching capacity**.

## Calendar layers

### National calendar
Includes term dates, public holidays, national examination windows, nationally defined school events, and other official dates.

### Regional calendar
Includes regional examinations, workshops, training, moderation, circuit activities, and regional events.

### School calendar
Includes assemblies, sports, prize giving, parent meetings, school examinations, internal tests, trips, closures, and other local interruptions.

Calendar layers combine into the effective teaching calendar while preserving source and priority.

## Timetable capacity

The engine must calculate usable subject periods from the actual class timetable.

Effective capacity is not simply the number of teaching weeks.

For a subject/class it should consider:

- scheduled subject periods
- public holidays
- school closures
- examination periods
- regional/national events
- school events affecting the class
- assessment obligations
- practical requirements
- locked non-teaching periods

When curriculum demand exceeds available capacity, the system must warn users. It must not silently compress or omit curriculum.

## Pacing model

Curriculum units can carry planning metadata such as:

- recommended periods or period range
- theory/practical classification
- assessment requirement
- relative priority
- prerequisite units
- sequencing constraints
- integration opportunities

Initial pacing guidance may be sourced from official material where available, existing approved school plans, department standards, or clearly marked AI-assisted recommendations reviewed by educators.

AI must not allocate time merely from document length or word count.

## Planning levels

### 1. National baseline
Optional baseline sequencing linked to the official curriculum.

### 2. Department/HOD plan
HOD or department adapts sequencing and pacing to the school's calendar, timetable and context.

### 3. Teacher/class plan
Teacher adapts the department plan for the actual class while preserving curriculum traceability.

The system records both inherited and local decisions.

## Year Planner

A high-level calendar view that can show:

- term
- week
- dates
- topic/theme
- planned curriculum units
- practicals
- assessments
- revision/remedial periods
- examinations
- school/regional/national interruptions

It should be printable in a familiar school-friendly format.

## Scheme of Work

The scheme exposes deeper curriculum detail:

- theme/topic
- general objective
- basic/specific competencies
- practical work
- planned periods
- planned start/finish
- actual start/finish
- completion/coverage status
- department notes

The scheme is generated from the same plan as the year planner.

## Lesson Preparation

Curriculum-controlled fields should be prefilled from the registry:

- theme/topic
- general objective
- basic/specific competencies

Teacher/AI-developed fields can include:

- teaching materials/resources
- introduction
- lesson structure
- teacher activities
- learner activities
- consolidation
- assessment/homework/tasks/exercises
- monitoring homework
- English Across Curriculum
- compensatory teaching
- reflection/amendments

Metadata includes school, teacher, subject, grade/class, planned date, actual date, duration, and review/sign-off where required.

The teacher owns and can edit the final lesson preparation.

## Preparation and submission are separate

Teachers can prepare:

- one lesson
- a week
- several weeks
- a whole term

Preparation may happen far in advance.

Submission to HOD is a separate action. Teachers may select specific weeks or a term for submission according to school policy.

Suggested lifecycle concepts:

- planned
- prepared
- taught
- submitted
- reviewed

These events should not be collapsed into a single status where historical truth would be lost.

## Planned vs actual teaching

A planned date and actual taught date are separate.

If a teacher is absent, a lesson is interrupted, or a school event removes a period, the original plan remains intact while actual teaching records what happened.

The system should move outstanding curriculum into future available capacity without rewriting history.

Retrospective capture should be permitted with audit metadata rather than hard-blocked.

## Coverage states

Coverage should not be a single checkbox.

Possible states include:

- not_started
- started
- partially_taught
- taught
- reinforcement_needed
- assessed

Coverage can be recorded at curriculum-unit/competency level where practical.

## Reflection

Teacher reflection should support concise natural-language notes.

AI may help structure or summarize reflections, but the original teacher entry must be preserved.

## HOD oversight

Institutional HOD access follows role and department responsibility; teachers should not have to individually authorize routine HOD oversight.

HOD views should emphasize exceptions and readiness, for example:

- preparations overdue
- curriculum at risk
- classes materially behind plan
- unreviewed submissions
- practical requirements not scheduled

Avoid surveillance-style productivity scoring.

## Capacity warnings

Examples:

- Grade 9 Mathematics requires 18 planned periods before the term assessment but only 14 usable periods remain.
- Two practical investigations are required but no double period is available.
- A regional examination removed three periods from the published department plan.

The system should explain the cause and allow HOD/teacher adjustment.

## Outputs

The engine should generate:

- annual/term year planner
- scheme of work
- daily lesson plan
- weekly lesson plan pack
- selected-week preparation pack
- term preparation pack
- syllabus coverage report
- planned vs actual report
- department readiness summary

All generated documents should use dedicated print templates, not browser screenshots.

## Guardrails

- One connected data model; no duplicate year-plan/scheme/lesson databases.
- Do not mark curriculum covered just because a planned date has passed.
- Do not silently change planned history when actual teaching differs.
- Do not use AI output as official curriculum content.
- Do not hide capacity shortages.
- Do not require teachers to retype data already known from curriculum, school structure, timetable or calendar.
