import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildAttendanceNavigationHref,
  formatAttendanceDate,
  mondayForAttendanceDate,
  schoolDayShift,
} from "../src/features/attendance/attendance-navigation.ts";
import { resolveAttendanceDayDecision } from "../src/features/attendance/server/learner-calendar-bounds.ts";

test("daily and weekly jumps preserve class, descending sort and sex filters", () => {
  assert.equal(
    buildAttendanceNavigationHref({
      view: "day",
      classId: "class/8 a",
      date: "2026-03-18",
      sort: "desc",
      sex: "female",
    }),
    "/attendance?view=day&class=class%2F8+a&date=2026-03-18&sort=desc&sex=female",
  );
  assert.equal(
    buildAttendanceNavigationHref({
      view: "week",
      classId: "class-8a",
      date: "2026-03-18",
      sort: "desc",
      sex: "male",
    }),
    "/attendance?view=week&class=class-8a&date=2026-03-16&sort=desc&sex=male",
  );
});

test("choosing any day resolves to the Monday of its containing week", () => {
  assert.equal(mondayForAttendanceDate("2026-03-16"), "2026-03-16");
  assert.equal(mondayForAttendanceDate("2026-03-18"), "2026-03-16");
  assert.equal(mondayForAttendanceDate("2026-03-22"), "2026-03-16");
  assert.equal(mondayForAttendanceDate("2026-03-23"), "2026-03-23");
});

test("attendance date arithmetic and display are independent of the machine timezone", () => {
  const originalTimezone = process.env.TZ;
  try {
    process.env.TZ = "America/Los_Angeles";
    assert.equal(schoolDayShift("2026-03-20", 1), "2026-03-23");
    assert.equal(formatAttendanceDate("2026-03-22", { weekday: "short", day: "numeric", month: "short" }), "Sun, 22 Mar");
    process.env.TZ = "Pacific/Auckland";
    assert.equal(mondayForAttendanceDate("2026-03-22"), "2026-03-16");
    assert.equal(formatAttendanceDate("2026-03-22", { weekday: "short", day: "numeric", month: "short" }), "Sun, 22 Mar");
  } finally {
    process.env.TZ = originalTimezone;
  }
});

test("governed non-teaching and out-of-term dates remain ineligible", () => {
  const terms = [{ learner_starts_on: "2026-01-14", learner_ends_on: "2026-04-03" }];
  const holiday = resolveAttendanceDayDecision({
    date: "2026-03-21",
    terms,
    termCalendarVerified: true,
    resolvedImpact: "NO_TEACHING",
    override: { isSchoolDay: false, teachingImpact: "NO_TEACHING", reason: "Independence Day" },
  });
  const outsideTerm = resolveAttendanceDayDecision({
    date: "2026-04-06",
    terms,
    termCalendarVerified: true,
    resolvedImpact: "NORMAL",
  });
  assert.deepEqual(holiday, {
    impact: "NO_TEACHING",
    reason: "Independence Day",
    kind: "in_term_non_teaching",
    eligible: false,
  });
  assert.equal(outsideTerm.kind, "out_of_term");
  assert.equal(outsideTerm.eligible, false);
});

test("register pickers expose governed labels, week highlighting and guarded navigation", () => {
  const daily = readFileSync("src/features/attendance/daily-register.tsx", "utf8");
  const weekly = readFileSync("src/features/attendance/weekly-register.tsx", "utf8");
  const picker = readFileSync("src/components/ui/date-field.tsx", "utf8");
  const stepper = readFileSync("src/components/ui/week-picker.tsx", "utf8");

  assert.match(daily, /calendar=\{\{/);
  assert.match(weekly, /rangeStart: weekStart, rangeEnd: weekEnd/);
  assert.match(weekly, /initialSexFilter/);
  assert.match(picker, /status\.label/);
  assert.match(picker, /inHighlightedRange/);
  assert.match(stepper, /aria-label=\{calendar\.label\}/);
  assert.match(daily, /Unsaved attendance changes/);
  assert.match(weekly, /Unsaved attendance changes/);
  assert.match(daily, /teachingDay\.impact === "NO_TEACHING"/);
  assert.match(weekly, /isNonTeaching\(date\) \|\| !weeklyCellForDate\(row, date\)\) return/);
});
