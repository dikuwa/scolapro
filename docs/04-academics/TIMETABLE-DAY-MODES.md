# Timetable day modes

ScolaPro supports two timetable day models per school. The day vocabulary belongs to the school, while a rotating calendar anchor belongs to one academic year.

## Standard week

`weekday` mode uses real weekday labels. The default is a five-day Monday-Friday timetable. A school may configure between 1 and 7 weekdays; values above 7 are invalid.

Existing schools default to:

- `timetable_cycle_mode = 'weekday'`
- `timetable_cycle_length = 5`

This preserves the current Monday-Friday behaviour without migration work by schools.

## Rotating cycle

`rotating` mode uses numbered timetable days (`Day 1`, `Day 2`, ...). A rotating cycle may contain between 1 and 10 days.

The timetable slot field historically named `weekday` remains the stable stored day index. In rotating mode it is interpreted as a cycle-day number rather than a calendar weekday. This avoids rewriting existing timetable relationships while keeping the meaning explicit at the school boundary.

A slot may never use a day index greater than its school's configured `timetable_cycle_length`. This is enforced in both the UI and the governed `create_timetable_slot` RPC, with the database constraint allowing the full 1-10 storage range.

## Presentation

All timetable surfaces must derive labels from the school configuration:

- weekday mode: `Monday`, `Tuesday`, ... up to the configured length;
- rotating mode: `Day 1`, `Day 2`, ... up to the configured length.

The main timetable grid, slot picker, current-schedule maintenance and future-plan maintenance must use the same derived labels. Ten-day cycles should remain usable on narrower screens by allowing horizontal scrolling rather than compressing ten columns into unreadable cards.

## Calendar-date resolution

A numbered cycle needs one known real date before ScolaPro can safely answer questions such as “which timetable day is 18 January?”. The calendar anchor is configured per academic year in Academic Setup.

Example:

- cycle length: 10;
- anchor: `11 January 2027 = Day 1`;
- `12 January = Day 2`;
- if `13 January` is configured as a school closure, it consumes no cycle day;
- `14 January = Day 3`;
- a Saturday explicitly configured as a school day does advance the cycle.

The governed `configure_timetable_cycle_anchor(...)` RPC validates that:

- the school is in rotating mode;
- the academic year exists;
- the anchor lies inside configured academic-year dates when boundaries are present;
- the anchor date is an expected school day;
- the anchor Day N is inside the school's configured cycle length.

`resolve_timetable_day(school, academic year, date)` is the canonical date-to-timetable-day resolver. It uses `school_day_overrides` rather than naive date modulo arithmetic, so holidays, emergency closures and approved weekend school days are treated correctly. Dates outside the academic year or dates that are not school days resolve to no timetable day.

A rotating anchor remains historical if the school later switches temporarily to weekday mode. Weekday resolution ignores the anchor and uses real ISO weekday numbers within the configured weekday length.

The school cycle cannot be shortened below an active timetable slot day or below an existing rotating anchor day. Schools must first correct those records rather than silently changing their meaning.

## Separation from attendance

Attendance and late-arrival weekly calendar logic remain independent from timetable day mode. The rotating resolver does not rewrite the Monday-Friday weekly register contract. `school_day_overrides` is shared only as the authoritative source for whether a specific date is an expected school day.
