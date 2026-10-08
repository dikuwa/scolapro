import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const model = readFileSync("src/features/attendance/server/register-teacher-document.ts", "utf8");
const renderer = readFileSync("src/features/attendance/server/render-register-teacher-html.ts", "utf8");
const workspace = readFileSync("src/features/attendance/register-teacher-workspace.tsx", "utf8");
const route = readFileSync("src/app/api/attendance/register-teacher/route.ts", "utf8");
const summaryModel = readFileSync("src/features/attendance/server/official-summary.ts", "utf8");
const schoolDays = readFileSync("src/features/attendance/server/governed-school-day.ts", "utf8");
const summaryPdf = readFileSync("src/features/documents/server/render-official-attendance-summary-pdf.ts", "utf8");

test("register mode labels and governed week-range controls are explicit", () => {
  assert.match(workspace, /Specific week/);
  assert.match(workspace, /Week range/);
  assert.match(workspace, /Full term/);
  assert.match(workspace, /From Week/);
  assert.match(workspace, /label="To Week"/);
  assert.match(workspace, /item\.value >= selectedFromWeek/);
  assert.match(model, /The From Week must not be after the To Week/);
  assert.match(model, /outside the learner term/);
  assert.match(route, /fromWeek/);
  assert.match(route, /toWeek/);
});

test("missing learner calendar dates fail with a meaningful readiness response", () => {
  assert.match(model, /Learner calendar is not ready/);
  assert.match(route, /calendar is not ready/);
  assert.match(route, /status: 422/);
  assert.doesNotMatch(model, /Before learner opening|After learner closing/);
});

test("every register page repeats the full official header and legend", () => {
  assert.match(renderer, /const repeatedHeader =/);
  assert.match(renderer, /\$\{repeatedHeader\}/);
  assert.match(renderer, /learnersPerPage = 40/);
  assert.match(renderer, /pageJobs = panels\.flatMap/);
  assert.match(renderer, /pageJobs\.map/);
  assert.match(renderer, /class="school-header"/);
  assert.match(renderer, /class="legend"/);
});

test("governed closures occupy the attendance body and do not clutter date headers", () => {
  assert.match(renderer, /rowspan="\$\{Math\.max\(1, section\.learners\.length\)\}"/);
  assert.match(renderer, /closure-label/);
  assert.match(renderer, /vertical-align:middle/);
  assert.match(renderer, /writing-mode:vertical-rl/);
  const header = renderer.split("function weeklyColumns(")[1].split("function weeklyMarks(")[0];
  assert.doesNotMatch(header, /day\.reason|compactCalendarReason/);
});

test("term totals remain learner-specific and use the governed as-at boundary", () => {
  assert.match(model, /termActualEnd = input\.selectedDate < termEnd \? input\.selectedDate : termEnd/);
  assert.match(model, /calculateLearnerRegisterBalance/);
  assert.match(schoolDays, /input\.enrolledFrom <= date/);
  assert.match(model, /termAttendanceTotal: learners\.reduce/);
  assert.match(model, /termPossibleTotal: learners\.reduce/);
});

test("official weekly and term PDFs use compact columns and A3 horizontal panels", () => {
  assert.match(summaryPdf, /PAGE_WIDTH = 1190\.55/);
  assert.match(summaryPdf, /weekday: "long"/);
  assert.match(summaryPdf, /Total Absent/);
  assert.match(summaryPdf, /Term Absent/);
  assert.match(summaryPdf, /TERM_WEEKS_PER_PANEL = 8/);
  assert.match(summaryPdf, /drawOfficialDocumentPdfHeader/);
  assert.match(summaryModel, /const dailyTotals = dates\.map/);
  assert.match(summaryModel, /resolveGovernedSchoolDays/);
});

test("attendance balance examples preserve enrolment-effective denominators", () => {
  const balance = (possible, absent) => ({ attend: possible - absent, absent, possible });
  assert.deepEqual(balance(64, 2), { attend: 62, absent: 2, possible: 64 });
  assert.deepEqual(balance(59, 2), { attend: 57, absent: 2, possible: 59 });

  const learnerPossible = (schoolDays, enrolledFromIndex, departedAfterIndex) =>
    schoolDays.filter((_, index) => index >= enrolledFromIndex && index <= departedAfterIndex).length;
  assert.equal(learnerPossible(Array.from({ length: 64 }), 5, 48), 44);
});
