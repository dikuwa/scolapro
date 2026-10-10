import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/attendance/page.tsx", "utf8");
const picker = readFileSync("src/components/ui/week-picker.tsx", "utf8");
const tabs = readFileSync("src/features/attendance/attendance-view-tabs.tsx", "utf8");
const sort = readFileSync("src/features/attendance/attendance-sort-control.tsx", "utf8");
const daily = readFileSync("src/features/attendance/daily-register.tsx", "utf8");
const weekly = readFileSync("src/features/attendance/weekly-register.tsx", "utf8");
const official = readFileSync("src/features/attendance/official-summary.tsx", "utf8");
const absences = readFileSync("src/features/attendance/absence-overview.tsx", "utf8");
const register = readFileSync("src/features/attendance/register-teacher-workspace.tsx", "utf8");
const renderer = readFileSync("src/features/attendance/server/render-register-teacher-html.ts", "utf8");

test("the unified period stepper is one accessible continuous control", () => {
  assert.match(picker, /export function WeekPicker/);
  assert.match(picker, /grid-cols-\[2\.5rem_minmax\(0,1fr\)_2\.5rem\]/);
  assert.match(picker, /overflow-hidden/);
  assert.match(picker, /aria-label=\{previousLabel\}/);
  assert.match(picker, /aria-label=\{nextLabel\}/);
  assert.match(picker, /previousDisabled/);
  assert.match(picker, /nextDisabled/);
  assert.match(picker, /focus-visible/);
});

test("week and day attendance navigators share the approved visual shell", () => {
  assert.match(weekly, /<WeekPicker/);
  assert.match(official, /<WeekPicker/);
  assert.match(register, /<WeekPicker/);
  assert.match(daily, /<PeriodStepper/);
  assert.match(absences, /<PeriodStepper/);
});

test("attendance tabs sit in the heading and use icons with brand active state", () => {
  assert.match(page, /<AttendanceViewTabs/);
  assert.doesNotMatch(page, /<AttendanceSortControl/);
  assert.match(tabs, /TabIcon/);
  assert.match(tabs, /bg-brand-soft text-brand-strong/);
  assert.match(tabs, /aria-current/);
});

test("daily roster exposes one persistent A-Z toggle beside sex filters", () => {
  assert.equal((daily.match(/<AttendanceSortControl/g) ?? []).length, 1);
  assert.equal((sort.match(/<button/g) ?? []).length, 1);
  assert.match(sort, /sort === "asc" \? "desc" : "asc"/);
  assert.match(daily, /persistRosterPreferences/);
  assert.match(daily, /window\.history\.replaceState/);
  assert.match(daily, /sort=\{sortDirection\} onChange=\{chooseSort\}/);
  assert.match(page, /key=\{`\$\{workspace\.selectedClassId \?\? "none"\}:\$\{date\}:\$\{workspace\.currentSubmissionId \?\? "draft"\}`\}/);
  assert.doesNotMatch(page, /currentSubmissionId \?\? "draft"\}:\$\{sort\}/);
  assert.match(tabs, /params\.set\("sex", currentSexFilter\)/);
});

test("register toolbar remains complete and week navigation honors term bounds", () => {
  assert.match(register, /label="Class"/);
  assert.match(register, /label="Period"/);
  assert.match(register, /label="Academic term"/);
  assert.match(register, /label=\{mode === "range" \? "From Week" : "Week"\}/);
  assert.match(register, /label="To Week"/);
  assert.match(register, /Preview \/ Print/);
  assert.match(register, /previousDisabled=\{selectedWeekIndex <= 0\}/);
  assert.match(register, /nextDisabled=\{selectedWeekIndex < 0 \|\| selectedWeekIndex >= weekOptions\.length - 1\}/);
});

test("boys and girls render as separate screen sheets and A3 print pages", () => {
  assert.match(renderer, /registerTeacherPageJobs\(document\)\.map/);
  assert.match(renderer, /\{ \.\.\.job\.section, learners: job\.learners \}/);
  assert.match(renderer, /\.register-section \{ margin:0 0 18px; padding:16px 16px 20px; background:white; box-shadow:/);
  assert.match(renderer, /@page \{ size:A3 landscape; margin:8mm; \}/);
  assert.match(renderer, /break-before:page; break-after:page; page-break-before:always; page-break-after:always/);
  assert.match(renderer, /\.register-section:last-child \{ break-after:auto; page-break-after:auto; \}/);
});
