import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const model = readFileSync("src/features/attendance/server/register-teacher-document.ts", "utf8");
const renderer = readFileSync("src/features/attendance/server/render-register-teacher-html.ts", "utf8");
const route = readFileSync("src/app/api/attendance/register-teacher/route.ts", "utf8");
const workspace = readFileSync("src/features/attendance/register-teacher-workspace.tsx", "utf8");
const tabs = readFileSync("src/features/attendance/attendance-view-tabs.tsx", "utf8");
const header = readFileSync("src/features/documents/server/official-document-header.ts", "utf8");

test("register teacher derives present by default and only absence changes I to a", () => {
  assert.match(model, /status === "absent"/);
  assert.match(model, /marks\[day\.date\] = "a"/);
  assert.match(model, /marks\[day\.date\] = "I"/);
  assert.match(model, /marks\[day\.date\] = ""/);
  assert.doesNotMatch(model, /insert\(/);
});

test("register teacher excludes non-teaching and out-of-enrolment dates from possible attendance", () => {
  assert.match(model, /resolve_school_teaching_impact_range/);
  assert.match(model, /impactByDate\.get\(date\) !== "NO_TEACHING"/);
  assert.match(model, /isActiveOn/);
  assert.match(model, /possible \+= 1/);
});

test("register teacher supports weekly Friday blocks and current-term ledgers", () => {
  assert.match(model, /mode: RegisterTeacherMode/);
  assert.match(model, /schoolWeekDates/);
  assert.match(model, /fridayFor/);
  assert.match(model, /term\?\.startsOn/);
  assert.match(model, /term\?\.endsOn/);
  assert.match(renderer, /Week Ending Friday/);
  assert.match(renderer, /TERM REGISTER/);
  assert.match(renderer, /WEEKLY REGISTER/);
});

test("register teacher splits boys and girls and carries physical identity columns", () => {
  assert.match(model, /\["male", "female"\]/);
  assert.match(model, /date_of_birth/);
  assert.match(renderer, /BOYS\/GIRLS/);
  assert.match(renderer, /ADMIN/);
  assert.match(renderer, /DATE OF/);
  assert.match(renderer, /Surname/);
  assert.match(renderer, /Given Names/);
});

test("register attendance marks are italic sans-serif with no serif present I", () => {
  assert.match(renderer, /font-family:Arial, Helvetica, sans-serif; font-style:italic/);
  assert.match(renderer, /register-mark/);
  assert.doesNotMatch(renderer, /Times New Roman|Georgia|font-family:serif/);
});

test("register teacher calculates weekly, term and balance totals", () => {
  assert.match(renderer, /Total number of attendances/);
  assert.match(renderer, /Total number of absentees/);
  assert.match(renderer, /Total number of possible attendances/);
  assert.match(renderer, /Balance:/);
  assert.match(model, /attendanceTotal/);
  assert.match(model, /absenceTotal/);
  assert.match(model, /possibleTotal/);
});

test("register teacher is an internal school document with in-app preview", () => {
  assert.match(header, /register_teacher/);
  assert.match(route, /officialDocumentHeaderModeForType\("register_teacher"\)/);
  assert.match(route, /renderRegisterTeacherHtml/);
  assert.match(workspace, /OfficialDocumentActions/);
  assert.match(workspace, /Preview \/ Print/);
  assert.match(tabs, /value: "register"/);
});
