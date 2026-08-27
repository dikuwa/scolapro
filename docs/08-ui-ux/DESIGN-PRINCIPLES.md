# ScolaPro UI/UX Principles

## Design Goal

ScolaPro must feel fast, calm and obvious to teachers, administrators, learners and parents. It must not expose the complexity of the underlying education data model.

## Core Rules

1. **Tasks, not database structure.** Navigation should reflect what a person needs to do, not internal module/entity names.
2. **Common actions first.** The most frequent task should require the fewest decisions and clicks.
3. **Use sensible defaults.** Example: attendance defaults learners to present so teachers record exceptions.
4. **Progressive disclosure.** Advanced configuration is available when needed but does not crowd normal workflows.
5. **Role-aware navigation.** Teachers should not see irrelevant administrative modules; roles with multiple responsibilities get a coherent combined workspace.
6. **Mobile-first critical workflows.** Attendance, marks review, lesson preparation, communication and learner lookup must work well on phones.
7. **Offline-aware.** Users must see clear save/sync state such as `Saved` or `Offline · 3 changes waiting`.
8. **No unnecessary full-page reloads.** Common interaction should feel immediate.
9. **Human-readable states.** Prefer `Waiting for HOD review` to technical status codes.
10. **Tables only where tables are best.** Marks and bulk lists may use grids; profiles, approvals and guidance should use more readable layouts.
11. **Search over huge selectors.** Use typeahead/search for learners, staff, subjects, classes and reports.
12. **Avoid horizontal scroll** except where inherently useful, e.g. a marks spreadsheet; provide frozen identity/context columns there.
13. **No browser-native alerts for product workflows.** Use consistent in-app dialogs/toasts/banners.
14. **Destructive actions are deliberate.** Use clear wording, confirmation proportional to risk and auditability.
15. **Theme-aware and accessible.** Light/dark modes, keyboard use, focus states, contrast and readable targets are first-class.
16. **Print is intentionally designed.** Report cards, statutory documents, class lists and certificates use dedicated print/PDF templates.
17. **Do not ask users to calculate what ScolaPro knows.** Derive totals, averages, age, workload, shortages and statutory counts automatically.
18. **Show exceptions, not noise.** Principal/HOD dashboards should surface what needs attention rather than listing every normal record.

## Teacher Experience

The teacher home should prioritise `Today`:
- timetable/classes;
- attendance/register tasks;
- preparation status;
- upcoming or incomplete assessments;
- marks windows/submissions;
- learner concerns/follow-ups;
- important school notices.

Conceptual teacher navigation:
- Today
- My Classes
- Teaching
- Assessment
- Reports

## HOD Experience

Prioritise:
- department readiness;
- preparation and syllabus coverage;
- assessment/mark submission state;
- moderation exceptions;
- learner performance/targets;
- staffing/allocation issues.

## Principal Experience

Prioritise:
- school attendance/readiness;
- learner/staff counts;
- timetable and teaching exceptions;
- assessment/report readiness;
- promotion/statutory readiness;
- major learner-support/resource risks.

## Attendance Interaction

Daily capture:
- everyone present by default;
- teacher taps only exceptions;
- choose status/reason;
- save draft or confirm.

Weekly review may show learners vertically and weekdays horizontally. Different days for the same learner remain separate attendance events with independent reasons.

Attendance date must not be inferred from capture time.

## Marks Interaction

Use a spreadsheet-like experience where appropriate:
- teacher sees only assigned classes/subjects;
- keyboard navigation;
- paste from spreadsheet;
- autosave/offline queue;
- clear absent/exempt/incomplete states distinct from zero;
- visible calculation explanation;
- submission/moderation/locking state.

## Learner Profile

Avoid dozens of narrow tabs. Initial grouping direction:
- Overview
- Academic
- Attendance
- Wellbeing
- Conduct & Achievement
- Activities
- Family
- Documents
- History

Sections are permission-aware; restricted support data should not appear merely because a user can open the learner profile.

## Reports

Reports should be discoverable contextually and via search, not buried in deep trees.

Examples:
- from Grade 8A: Print class list;
- from Physical Science: Open performance analysis;
- global report search: `class list` -> relevant class-list options.

## Performance Expectations

Design toward:
- cached app shell opening quickly;
- common UI interactions perceived as near-instant;
- class lists available from local cache when offline-enabled;
- search/results progressively loaded rather than blocking the whole screen;
- heavy regional/national analytics backed by precomputed aggregates where appropriate.

Exact measurable budgets will be defined during technical architecture.