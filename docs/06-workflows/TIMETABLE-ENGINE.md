# ScolaPro Timetable Engine

## Purpose

The timetable is a core operational source of truth, not a standalone calendar. It connects staffing, subjects, classes, rooms, attendance, lesson preparation, teacher workload, learner schedules and statutory reporting.

## Design Principles

- Teacher/class/subject allocations are authoritative inputs.
- Timetable generation must use explicit constraints and preferences.
- Manual edits remain possible after generation.
- Locked periods are preserved during partial regeneration.
- Conflicts must be visible immediately.
- The engine must support Namibia school realities such as assemblies, register periods, practical double periods, shared rooms and timetable cycles.

## Core Inputs

- academic year and term/cycle
- school days and cycle length
- periods per day
- period start/end times
- breaks, assemblies and non-teaching blocks
- grades and classes
- subjects by class/grade
- teacher-subject-class allocations
- rooms and room capabilities
- subject required periods per cycle/week
- practical/double-period requirements
- teacher availability
- class availability
- room availability
- school events and closures

## Constraint Types

### Hard constraints

Generation must never violate these:

- one teacher cannot teach two classes at the same time
- one class cannot have two lessons at the same time
- one room cannot host two classes at the same time
- a subject cannot be allocated to an ineligible teacher
- unavailable teachers/classes/rooms cannot be scheduled
- required specialist rooms must be respected where configured
- locked timetable slots cannot be overwritten

### Soft preferences

The engine should optimise these where possible:

- spread a subject across the week
- avoid placing all lessons late in the day
- avoid excessive teacher gaps
- avoid excessive consecutive periods for learners
- place double/practical periods together
- respect preferred teaching windows
- balance difficult subjects across the week
- reduce unnecessary room changes

Soft preferences must have adjustable weights and must never be presented as statutory rules.

## Generation Workflow

1. Validate configuration completeness.
2. Calculate required teaching load.
3. Compare required periods with available capacity.
4. Surface impossible or over-constrained allocations before generation.
5. Generate proposal.
6. Display conflicts/warnings and quality indicators.
7. Allow manual adjustment and slot locking.
8. Regenerate only affected scope when requested.
9. Publish approved timetable version.

## Versioning

Timetables are versioned by effective date. Historical attendance, lesson coverage and workload must continue referencing the timetable that was effective at the time.

## Views

The same timetable dataset renders:

- teacher timetable
- class timetable
- learner timetable
- room timetable
- school master timetable
- HOD workload view
- timetable capacity view
- EMIS teacher workload statistics

## Integration

Teacher allocation -> timetable -> lesson schedule -> attendance opportunity -> teaching planning -> actual coverage -> workload/statutory reporting.

## Capacity Warnings

The engine must explicitly flag situations such as:

- Physical Science requires 7 periods/week but only 5 available
- teacher allocation exceeds contractual/school workload threshold
- no laboratory room capacity for required practical lessons
- school events remove more teaching time than the pacing plan can absorb

The system must never silently compress curriculum requirements.
