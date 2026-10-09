import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/features/attendance/server/learner-calendar-bounds.ts", import.meta.url), "utf8");
const register = readFileSync(new URL("../src/features/attendance/server/register.ts", import.meta.url), "utf8");
const summary = readFileSync(new URL("../src/features/attendance/server/official-summary.ts", import.meta.url), "utf8");
const actions = readFileSync(new URL("../src/features/attendance/server/actions.ts", import.meta.url), "utf8");

test("only configured learner dates grant learner attendance, not teacher dates", () => {
  assert.match(source, /learner_starts_on/);
  assert.match(source, /learner_ends_on/);
  assert.match(source, /Before learner opening/);
  assert.match(source, /After learner closing/);
  assert.match(source, /Between learner terms/);
  assert.doesNotMatch(source, /teacher_starts_on|teacher_ends_on/);
});

test("daily display and server submission share authoritative bounds", () => {
  assert.match(register, /list_academic_term_calendar_summary/);
  assert.match(register, /resolveAttendanceDayDecision\(/);
  assert.match(register, /isSchoolDay: overrideResult\.data\.is_school_day/);
  assert.match(actions, /resolveAttendanceTeachingImpact\(registerSchool.school_id/);
  assert.match(actions, /!teachingDay\.eligible/);
});

test("weekly and term numerator denominator exclude learner calendar closures", () => {
  assert.match(summary, /list_academic_term_calendar_summary/);
  assert.match(summary, /const isTeachingDate =/);
  assert.match(summary, /const teachingDates = dates.filter\(isTeachingDate\)/);
  assert.match(summary, /const nonTeachingDates = dates.filter\(\(day\) => !isTeachingDate\(day\)\)/);
  assert.match(summary, /const teaching = week.dates.filter\(isTeachingDate\)/);
  assert.match(summary, /const weekDates = week.dates.filter\(isTeachingDate\)/);
});

test("a partially configured learner year does not falsely close an unconfigured term", () => {
  assert.match(source, /configured\.length !== terms\.length/);
  assert.match(source, /return null;\/\/|return null;/);
});
