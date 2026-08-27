# ScolaPro Initial Wireframe Architecture

## Purpose

Define the first screen architecture before visual implementation so role workflows remain coherent and compact.

## Shared App Shell

### Desktop
- collapsible left navigation;
- compact top bar;
- school/tenant context;
- global search/command entry;
- notifications;
- profile/theme utilities;
- content region using consistent max-width/full-width rules.

### Mobile
- compact header;
- drawer or task-priority navigation;
- sticky/contextual actions where needed;
- no desktop sidebar squeezed onto mobile.

## Screen 1 — Teacher Dashboard

Primary question: **What do I need to do today?**

Layout order:
1. compact title/context row;
2. today's timetable / next class;
3. action queue: attendance, preparations, marks, follow-ups;
4. compact class/subject status summaries;
5. notices only if relevant.

Avoid generic school-wide vanity statistics for ordinary teachers.

## Screen 2 — Daily Attendance

Layout:
- class/date context toolbar;
- confirmation/sync state;
- learner list with everyone present by default;
- exception controls inline or in a side sheet;
- reason/status selection via styled components;
- sticky save/confirm action on constrained screens.

Desktop can support denser batch controls; mobile prioritizes one-handed exception capture.

## Screen 3 — Marks Grid

Layout:
- year/term/subject/class context strip;
- marks window status and due date;
- spreadsheet-like grid;
- frozen learner identity columns;
- special states for absent/exempt/incomplete;
- autosave/sync indication;
- submit action separate from save.

## Screen 4 — Learner Profile

Header:
- learner name and essential identifiers;
- grade/register class/status;
- contextual actions.

Navigation groups:
- Overview
- Academic
- Attendance
- Wellbeing
- Conduct & Achievement
- Activities
- Family
- Documents
- History

Sensitive sections are permission-aware and should not merely appear disabled to unauthorized users.

## Screen 5 — School Admin Readiness Dashboard

Primary question: **What needs attention before school operations/reporting are complete?**

Sections:
- learner/staff readiness;
- attendance completeness;
- marks/report readiness;
- timetable exceptions;
- statutory/EMIS readiness;
- LTSM shortages;
- outstanding configuration/tasks.

Prefer exception-driven summaries over colorful card walls.

## Screen 6 — Learner List

- compact search/filter toolbar;
- high-density readable data table;
- fast search;
- clear filters;
- current/historical state;
- row click opens learner profile;
- export/print actions contextual, not dominant.

## Screen 7 — Create Learner / Enrolment

Guided but compact flow:
1. identity;
2. guardian/family essentials;
3. enrolment/grade/class;
4. review and create.

Avoid one giant screen containing every possible learner field. Additional profile data can be completed after admission or through appropriate workflows.

## Screen Density Rules

- keep page titles compact;
- use spacing/surfaces rather than card nesting;
- prioritize visible operational content above fold on standard laptops;
- avoid large decorative hero areas inside authenticated application pages;
- preserve breathing room without forcing excessive scrolling.

## Motion

Use the approved motion system for page/content continuity, loading transitions and meaningful state changes. No animation may interfere with high-volume data entry.
