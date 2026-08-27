# ScolaPro Source-of-Truth Map

## Principle

Every important fact should have one authoritative owner. Other modules consume or snapshot it; they do not ask users to re-enter it.

| Data | Authoritative owner | Reused by |
|---|---|---|
| School identity, EMIS code, contacts | School profile | documents, EMIS, DNEA, reports, communication |
| Academic year/term dates | Academic structure/calendar | timetable, lesson planning, attendance, assessment, reports, EMIS |
| Learner identity | Learner registry | enrolment, reports, DNEA, CRC, communication |
| Guardian relationship/contact | Learner/guardian domain | communication, report packaging, support, admissions |
| School enrolment | Enrolment | class lists, attendance, assessment, promotion, EMIS |
| Class membership | ClassMembership | register, teacher lists, reports, timetable, promotion |
| Subject enrolment | SubjectEnrolment | marks, timetable, report cards, DNEA |
| Staff identity & appointment | Staff domain | permissions, timetable, EMIS, documents |
| Teacher subject/class assignment | TeachingAssignment | timetable, marks access, preparation, HOD oversight, workload, EMIS |
| Timetable | Timetable domain | teacher/student dashboards, attendance periods, planning engine, EMIS workload |
| NIED curriculum content/version | Curriculum Registry | year planner, scheme, lesson prep, assessment requirements, coverage |
| School/national calendar events | Calendar | timetable capacity, pacing, assessment scheduling, dashboards |
| Lesson preparation | Teaching Planning | HOD review, teacher file, print/PDF |
| Actual lesson delivery/coverage | Teaching Planning | syllabus coverage, HOD analytics, planning adjustments |
| Daily attendance | Attendance | learner history, parent alerts, analytics, CRC, EMIS aggregates |
| Period attendance | Attendance | lesson attendance analytics, support follow-up |
| Assessment scheme/version | Assessment Engine | mark capture, calculations, report cards, promotion |
| Raw marks | Assessment Engine | results, analytics, report cards, CRC, promotion |
| Final/derived results | Reporting domain | report cards, promotion, awards, analytics, CRC |
| Promotion decision | Promotion domain | next-year enrolment, EMIS statistics, CRC/history |
| Conduct event | Conduct domain | learner profile, support, authorised CRC sections, communication |
| Learner concern/referral | Learner Support | interventions, authorised profile/CRC, follow-up |
| Confidential counselling note | Learner Support | restricted support users only; never general analytics |
| Textbook/material copy | LTSM inventory | issue/return, stock take, shortage analytics |
| Material issue | LTSM | learner profile, outstanding books, replacement tracking |
| Communication message | Communication engine | delivery channels and history |
| Payment | Finance | learner/family balance, receipt/reporting |
| Certified census value | Statutory snapshot | historical EMIS/AEC submission and audit |
| Official subject/staff/etc. code | Platform Reference Registry | statutory exports, DNEA, EMIS, integrations |

## Snapshot Rule

A snapshot is justified when the historical state must remain immutable even if live operational data later changes.

Examples:
- certified AEC/15th-day submission;
- published report card;
- locked promotion decision;
- official DNEA registration/export;
- signed/generated statutory document.

Snapshots must retain provenance back to their source records and the rule/template versions used.

## Anti-Duplication Rules

1. EMIS must not maintain its own editable learner count when active enrolments can produce it.
2. Teacher workload must not be manually re-counted when timetable entries can produce it.
3. Report cards must not store independently typed subject marks when assessed results already exist.
4. Teacher files must not require uploading a timetable/class list that ScolaPro already generates.
5. Parent contact information must not be copied into attendance or discipline records.
6. Transfers must not clone editable academic history into the receiving school.
7. Curriculum wording used in planning must reference a specific approved curriculum version.

## Data Provenance

Important records should expose, where appropriate:
- who created/changed the record;
- when it was captured;
- effective/actual date where different;
- source system/import/document;
- rule/version used for derived values;
- school/tenant ownership;
- lock/certification state.