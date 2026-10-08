# Balanced inline expansion — default dense-page pattern

**Status:** Adopted for expandable setup and row-management surfaces. Reference: Staff Directory identity management and `AcademicSetupCore`. Issue #1192.

## Default behavior

- The closed state is a **full-width, compact summary**: icon, title, short description, key metrics, one contextual action.
- On open, keep the summary **full width** and render the editor **directly below it**, spanning the row. Never leave an empty summary column beside a long form.
- Within the expanded editor, use responsive interior grids (`grid gap-4 lg:grid-cols-2`) only when both sides contain meaningful content; use full width for history/empty states.
- Heavy or infrequent secondary operations belong in a **collapsed Advanced section**; the primary user workflow remains visible.
- Actions that toggle panels use `RecordActionButton disclosure` with the chevron on the **right**; chevron points down when closed and up when expanded. Connect trigger and panel through `aria-expanded` and `aria-controls`, with stable panel IDs.
- A row may have one open editor at a time. Preserve values and make closed states fast to scan.
- Use the ScolaPro design system: borders, radius, spacing, tints, focus rings, `Picker`, `SearchableSelect`, and `DateField`. No browser-native select controls.
- At narrow widths, stack content naturally without horizontal overflow, giant empty areas, or long full-width help paragraphs. Keep descriptions to one or two concise sentences. Use plain explanatory text only for authorization/safety details that affect decisions.

## Where it applies

Staff Directory identity/HOD placement, Academic Setup timetable/calendar/HOD, expandable settings, governance, room and school management cards, and similarly dense list/details pages. **Do not** mechanically apply it to dashboards, static reports, or inherently side-by-side comparisons.

## Review checklist

1. Open and closed screenshots at 375px, 768px, 1440px in light and dark themes.
2. Expanded content fills available width and never leaves an empty parallel summary column.
3. Keyboard activation, focus appearance, accessible expanded state and chevron direction work.
4. No forms or existing authorization controls disappear on collapse; infrequent actions remain discoverable.
5. Reuse existing actions and backend guards; UI restructuring must not change security semantics.

Migrate remaining comparable pages in separately scoped issues/PRs with exact-head CI and browser QA. Do not assume this single PR retroactively changes all pages.
