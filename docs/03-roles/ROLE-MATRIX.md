# ScolaPro Role Matrix

## Principle

Roles are composable responsibilities with scoped permissions. Avoid hard-coding dozens of mutually exclusive user types.

A staff member may hold several roles at once, for example Teacher + Class Teacher + HOD.

## Core Roles

| Role | Primary scope | Main responsibilities |
|---|---|---|
| Platform Super Admin | Platform | tenants/schools, platform configuration, curriculum/reference registries, feature flags, subscriptions, support |
| School Administrator | School | school setup, academic structure, learner/staff administration, allocations, data quality, operational configuration |
| Principal | School | oversight, approvals/certification, school analytics, timetable oversight, promotion/report readiness, statutory readiness |
| HOD / Department Head | Department | subject allocations, curriculum coverage, preparation review, assessment moderation, department analytics |
| Teacher | Assigned classes/subjects | lesson planning, subject attendance where used, assessment/marks, learner observations, subject communication |
| Class / Register Teacher | Assigned class | daily/register attendance, class-level learner information, parent contact workflow, class verification tasks |
| Counsellor / Learner Support | Authorised learners/support cases | referrals, interventions, protected notes, wellbeing follow-up |
| LTSM / Librarian | School resources | catalogue, textbook/library inventory, issue/return, stock take, loss/damage, shortages |
| Finance / Admin Officer | School finance | payment items, references, proof verification, basic finance reports |
| Exam / DNEA Administrator | School exam centre | candidate readiness, exam registration, validation, exports/documents |
| Parent / Guardian | Own linked learners | child overview, attendance, results/report cards, communications, tasks/notices, permitted updates |
| Learner | Self | timetable, tasks, attendance visibility, results/report cards, announcements, resources |
| School Board Member | Governance scope | authorised governance information, meetings/resolutions, school-development items, approved finance summaries |
| Circuit / Regional Officer | Authorised schools/aggregates | school/statutory verification, aggregate analytics, support/oversight according to mandate |
| Ministry / National Analyst | Authorised aggregate/national scope | EMIS/statutory analysis, national/regional/circuit intelligence; learner-level access only where explicitly authorised |

## Permission Rules

### Teacher
Can normally:
- view assigned learners/classes/subjects;
- prepare lessons and record actual delivery;
- record subject attendance where enabled;
- enter marks only for assigned subject/class and open mark windows;
- submit learner concerns or conduct/achievement events;
- communicate with authorised class/subject audiences;
- view relevant learner academic/contact information.

Cannot automatically:
- alter another teacher's marks;
- edit historic enrolments;
- see protected counselling/health notes;
- change national curriculum/rule definitions;
- browse whole-school confidential data.

### Class Teacher
Adds to teacher permissions:
- daily/register attendance for assigned class;
- class-level attendance verification;
- authorised learner/guardian update requests;
- class reporting/CRC observations where configured;
- class-level census verification tasks.

### HOD
Adds department-scoped oversight:
- review teacher preparations and curriculum coverage;
- moderate/return/verify marks;
- inspect assessment completeness;
- department performance/targets;
- manage or recommend subject allocations/plans according to school policy.

HOD status does not grant unrestricted counselling access.

### Principal
School-wide oversight, but sensitive learner-support information remains need-to-know and separately permissioned.

Principal can generally:
- certify report/promotion/statutory workflows;
- view school performance, attendance, staffing and readiness;
- approve governed overrides/unlocks;
- oversee timetable and school configuration.

### School Administrator
Administration does not imply unrestricted pedagogical or counselling authority. Admin may maintain records/settings while academic approval remains with the relevant HOD/principal roles.

## Scope Model

Permissions should be evaluated as:

`user + role + organisational scope + relationship + record sensitivity + workflow state`

Examples:
- A teacher can enter Grade 8A Physical Science marks only if they hold the active TeachingAssignment and the mark window is open.
- An HOD can moderate only subjects/departments in their scope unless explicitly delegated.
- A parent can see only learners with an active verified guardian relationship.
- A regional analyst may view aggregate attendance by school without seeing confidential learner-support notes.

## Confidentiality Classes

Suggested classes:
1. General school operational
2. Learner personal
3. Academic
4. Conduct/support-sensitive
5. Health/counselling-restricted
6. Statutory/confidential administrative

Permissions should be explicitly mapped to these classes rather than relying only on menu visibility.

## Future Work

This matrix defines responsibilities, not yet the complete permission catalogue. A later `PERMISSION-CATALOGUE.md` will enumerate actions such as `marks.enter`, `marks.unlock`, `support.read_confidential`, `emis.certify`, etc.