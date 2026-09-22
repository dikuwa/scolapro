import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const daily = readFileSync("src/features/attendance/server/register.ts", "utf8");
const weekly = readFileSync("src/features/attendance/server/week.ts", "utf8");

test("daily attendance resolves calendar state in the first request wave", () => {
  assert.match(daily, /Promise\.all\(\[[\s\S]*resolveAttendanceTeachingImpact\(schoolId, attendanceDate\)/);
  assert.doesNotMatch(daily, /const teachingDay = await resolveAttendanceTeachingImpact/);
});

test("weekly attendance resolves all teaching days in the first request wave", () => {
  assert.match(weekly, /Promise\.all\(\[[\s\S]*Promise\.all\(dates\.map/);
  assert.doesNotMatch(weekly, /const resolvedDays = await Promise\.all/);
});
