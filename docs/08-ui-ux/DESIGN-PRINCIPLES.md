# ScolaPro UI/UX Principles

> **Status: canonical product rule.** All humans and AI coding agents working in this repository must follow this document together with `DESIGN-SYSTEM.md`, `MOTION-INTERACTION.md`, and `COMPONENT-INVENTORY.md`.

## Design Goal

ScolaPro must feel **fast, calm, compact, intentional, modern and official**. It must support dense school work without looking like a legacy enterprise database or a generic AI-generated dashboard.

The visual direction is quiet and polished: soft neutral surfaces, restrained accent color, clear hierarchy, left alignment, compact information density, subtle elevation, strong contrast and deliberate motion.

## Core Rules

1. **Tasks, not database structure.** Navigation reflects what a person needs to do, not internal entity names.
2. **Common actions first.** Frequent tasks require the fewest decisions and clicks.
3. **Use sensible defaults.** Example: attendance defaults learners to present so teachers record exceptions.
4. **Progressive disclosure.** Advanced configuration must not crowd normal workflows.
5. **Role-aware navigation.** Users do not see irrelevant modules.
6. **Mobile-first critical workflows.** Attendance, marks, lesson preparation, communication and learner lookup must work well on phones.
7. **Offline-aware.** Show explicit state such as `Saved`, `Saving…`, or `Offline · 3 changes waiting`.
8. **No abrupt interaction.** Pages, panels, dialogs, charts and state changes use restrained easing and continuity.
9. **Human-readable states.** Prefer `Waiting for HOD review` to technical status codes.
10. **Tables only where tables are best.** Marks and bulk lists may use grids; profiles and guided work use more readable layouts.
11. **Search over huge selectors.** Use typeahead/combobox for learners, staff, subjects, classes and reports.
12. **Avoid horizontal scroll** except where inherently useful, such as marks grids; freeze identity/context columns there.
13. **No browser-native product UI where a designed component is appropriate.** Do not ship browser-styled select menus, radio groups, date pickers, alerts, confirm dialogs or similar controls in core workflows.
14. **Destructive actions are deliberate.** Use clear wording, risk-proportional confirmation and auditability.
15. **Theme-aware and accessible.** Light/dark modes, keyboard use, focus states, contrast and readable targets are first-class.
16. **Print is intentionally designed.** Official documents use dedicated print/PDF templates.
17. **Do not ask users to calculate what ScolaPro knows.** Derive totals, averages, age, workload, shortages and statutory counts.
18. **Show exceptions, not noise.** Dashboards surface what needs attention rather than listing every normal record.
19. **Use hierarchy, spacing and surfaces before borders.** Avoid card-inside-card layouts and thick separators.
20. **Use tokens, never ad-hoc styling.** Color, typography, spacing, radius, shadow, motion and z-index values come from shared tokens.
21. **No oversized dashboard typography.** Titles remain within the approved fluid type scale.
22. **No decorative AI clichés.** Avoid eyebrow labels above every heading, gradient text, giant icon tiles, thick colored left borders, rainbow cards and gratuitous glassmorphism.
23. **No pure UI colors by default.** Avoid `#000`, `#fff` and raw saturated primary colors as dominant surfaces/text; use tokenized softened neutrals and accents.
24. **Left alignment is the default.** Center alignment is reserved for empty states, auth screens and intentionally centered compositions.
25. **Compact, not cramped.** Minimize unnecessary scrolling while preserving readability and touch targets.

## Typography Direction

Use a consistent modern sans-serif application typeface and a fluid type scale. Normal application UI must not use monospace as its general font. Avoid using Inter by default merely because it is common in templates. Exact font and scale are defined in `DESIGN-SYSTEM.md`.

## Surface Hierarchy

Prefer background surfaces and tonal separation over boxes around everything:
- app canvas;
- primary surface;
- muted/grouped surface;
- elevated surface for overlays.

Borders are typically 1px and subtle. Shadows indicate real elevation, not decoration.

## Interaction & Motion

Motion is part of feedback, not decoration:
- smooth ease-based transitions;
- restrained fade/translate reveals;
- small stagger where a group enters together;
- animated chart entrances when useful;
- hover/focus/pressed feedback;
- skeleton/progress/loading state for asynchronous work;
- reduced-motion support.

Never delay a teacher workflow merely to show an animation. Do not hijack native scrolling.

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

Weekly review may show learners vertically and weekdays horizontally. Different days for the same learner remain separate attendance events with independent reasons. Attendance date must not be inferred from capture time.

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

Sections are permission-aware; restricted support data must not appear merely because a user can open the learner profile.

## Reports

Reports are discoverable contextually and via search, not buried in deep trees.

Examples:
- from Grade 8A: Print class list;
- from Physical Science: Open performance analysis;
- global report search: `class list` -> relevant class-list options.

## Performance Expectations

Design toward:
- cached app shell opening quickly;
- common interactions perceived as near-instant;
- class lists available from local cache where offline-enabled;
- progressive loading instead of blocking the whole screen;
- precomputed aggregates for heavy analytics where appropriate.

Animation must not compromise Core Web Vitals, input responsiveness or low-bandwidth usability.