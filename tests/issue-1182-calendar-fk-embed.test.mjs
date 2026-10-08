import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/features/calendar/server/teaching-impact.ts", import.meta.url), "utf8");

test("calendar overrides select the effective bell schedule via its explicit foreign key", () => {
  assert.match(source, /timetable_bell_schedules!school_day_overrides_bell_schedule_id_fkey\(display_name\)/);
  assert.doesNotMatch(source, /[\"']timetable_bell_schedules\(display_name\)[\"']/);
});

test("calendar retains override baseline provenance and effective bell schedule mapping", () => {
  assert.match(source, /baseline_source,baseline_is_school_day/);
  assert.match(source, /baselineSource:\s*item\.baseline_source/);
  assert.match(source, /bellScheduleName:\s*\(item\.timetable_bell_schedules/);
});
