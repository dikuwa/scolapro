# Timetable day modes

ScolaPro supports two timetable day models per school. The configuration belongs to the school, not to an individual timetable or user.

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

This setting defines the timetable's day vocabulary and permitted day range. It does **not** yet infer which rotating `Day N` corresponds to an arbitrary calendar date. That later capability needs a governed cycle anchor plus school-day/holiday rules so weekends, closures and holidays are advanced or skipped correctly rather than using a naive date difference.

Attendance and late-arrival weekly calendar logic remain independent from timetable day mode.
