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
  assert.match(model, /day >= 1 && day <= 5/);
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


test("register teacher workspace supports explicit term selection and week navigation", () => {
  assert.match(workspace, /Academic term/);
  assert.match(workspace, /selectedTermId/);
  assert.match(workspace, /Previous register week/);
  assert.match(workspace, /Next register week/);
  assert.match(model, /getRegisterTeacherTermOptions/);
  assert.match(model, /registerTeacherName/);
  assert.match(renderer, /REGISTER TEACHER/);
});


test("register absences are red and reasoned absences carry a superscript check", () => {
  assert.match(model, /reason_id,note/);
  assert.match(model, /reasonedAbsenceDates/);
  assert.match(model, /Boolean\(current\.reasonId \|\| current\.note\?\.trim\(\)\)/);
  assert.match(renderer, /absent-mark/);
  assert.match(renderer, /absence-reason-mark/);
  assert.match(renderer, />✓<\/sup>/);
  assert.match(renderer, /color:var\(--register-red\)/);
});

test("register term totals are a permanent three-column calendar-governed block", () => {
  assert.match(renderer, /TOTAL<br>PER TERM/);
  assert.match(renderer, />Attend\.<\/th>/);
  assert.match(renderer, />Absent<\/th>/);
  assert.match(renderer, />Days<\/th>/);
  assert.match(model, /termTeachingDayCount/);
  assert.match(model, /p_from: termStart, p_to: termEnd/);
  assert.match(model, /termDays: termPossible/);
  assert.match(model, /termAttendanceTotal/);
  assert.match(model, /termAbsenceTotal/);
  assert.match(model, /termPossibleTotal: learners\.length \* termTeachingDayCount/);
});

test("all absentee summary values and learner term absences render red", () => {
  assert.match(renderer, /absence-summary-row/);
  assert.match(renderer, /absence-value/);
  assert.match(renderer, /term-absent absence-value/);
});


test("register school name inherits the governed school document font", () => {
  assert.match(renderer, /renderOfficialDocumentSchoolNameFontStyle/);
  assert.match(renderer, /officialDocumentSchoolNameClass/);
  assert.match(renderer, /schoolNameFontStyle/);
  assert.match(renderer, /school-name\.old-english/);
  assert.doesNotMatch(renderer, /Namib High School.*font|old_english.*Namib High/i);
});


test("register non-teaching columns display governed calendar reasons", () => {
  assert.match(model, /effective_learner_calendar_events/);
  assert.match(model, /calendarClosures/);
  assert.match(model, /reasonByDate\.set\(date, String\(event\.title\)\)/);
  assert.match(model, /Before learner opening/);
  assert.match(model, /After learner closing/);
  assert.match(renderer, /compactCalendarReason/);
  assert.match(renderer, /day-reason/);
  assert.match(renderer, /writing-mode:vertical-rl/);
});

test("register attendance columns remain compact within fixed paper geometry", () => {
  assert.match(renderer, /table-layout:fixed/);
  assert.match(renderer, /min-width:0; border-collapse:collapse/);
  assert.match(renderer, /const dayWidth = attendanceColumns \? 42 \/ attendanceColumns : 42/);
  assert.match(renderer, /<colgroup>\$\{columns\}<\/colgroup>/);
  assert.match(renderer, /\.identity\.surname \{ overflow-wrap:anywhere/);
  assert.match(renderer, /\.identity\.given \{ overflow-wrap:anywhere/);
  assert.match(renderer, /\.register-section \{ margin-top:18px; break-after:page; overflow:visible/);
  assert.doesNotMatch(renderer, /min-width:max-content/);
});

test("printed term balance respects each learner's actual enrolment window", () => {
  assert.match(model, /let termPossible = 0/);
  assert.match(model, /if \(!isActiveOn\(String\(item\.enrolled_from\)/);
  assert.match(model, /termPossible \+= 1/);
  assert.match(model, /const termAttended = termPossible - termAbsent/);
  assert.match(model, /termDays: termPossible/);
  assert.match(model, /termPossibleTotal: learners\.reduce\(\(sum, learner\) => sum \+ learner\.termDays, 0\)/);
  assert.doesNotMatch(model, /termPossibleTotal: learners\.length \* termTeachingDayCount/);
});
