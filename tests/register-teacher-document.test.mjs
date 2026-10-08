import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const model = readFileSync("src/features/attendance/server/register-teacher-document.ts", "utf8");
const schoolDays = readFileSync("src/features/attendance/server/governed-school-day.ts", "utf8");
const renderer = readFileSync("src/features/attendance/server/render-register-teacher-html.ts", "utf8");
const route = readFileSync("src/app/api/attendance/register-teacher/route.ts", "utf8");
const workspace = readFileSync("src/features/attendance/register-teacher-workspace.tsx", "utf8");
const tabs = readFileSync("src/features/attendance/attendance-view-tabs.tsx", "utf8");
const header = readFileSync("src/features/documents/server/official-document-header.ts", "utf8");

test("register teacher derives present by default and only absence changes I to a", () => {
  assert.match(schoolDays, /status === "absent"/);
  assert.match(schoolDays, /marks\[day\.date\] = "a"/);
  assert.match(schoolDays, /marks\[day\.date\] = "I"/);
  assert.match(schoolDays, /marks\[day\.date\] = ""/);
  assert.doesNotMatch(model, /insert\(/);
});

test("register teacher excludes non-teaching and out-of-enrolment dates from possible attendance", () => {
  assert.match(model, /resolve_school_teaching_impact_range/);
  assert.match(model, /resolveGovernedSchoolDays/);
  assert.match(model, /calculateLearnerRegisterBalance/);
  assert.match(schoolDays, /impact !== null && eligibleImpactSet\.has\(impact\)/);
  assert.match(schoolDays, /input\.enrolledFrom <= date/);
});

test("register teacher supports specific-week, week-range and full-term ledgers", () => {
  assert.match(model, /mode: RegisterTeacherMode/);
  assert.match(model, /"week" \| "range" \| "term"/);
  assert.match(model, /fromWeek/);
  assert.match(model, /toWeek/);
  assert.match(model, /fridayFor/);
  assert.match(model, /governedDays\.displayedDates\(scopeStart, scopeEnd\)/);
  assert.match(model, /learnerTerm\?\.learner_starts_on/);
  assert.match(model, /learnerTerm\?\.learner_ends_on/);
  assert.match(renderer, /Week Ending Friday/);
  assert.match(renderer, /TERM REGISTER/);
  assert.match(renderer, /WEEK RANGE REGISTER/);
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
  assert.match(schoolDays, /Boolean\(evidence\.reasonId \|\| evidence\.note\?\.trim\(\)\)/);
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
  assert.match(model, /termDays: balance\.termDays/);
  assert.match(model, /termAttendanceTotal/);
  assert.match(model, /termAbsenceTotal/);
  assert.match(model, /termPossibleTotal: learners\.reduce\(\(sum, learner\) => sum \+ learner\.termDays, 0\)/);
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


test("register non-teaching columns display governed calendar reasons inside the body", () => {
  assert.match(model, /effective_learner_calendar_events/);
  assert.match(model, /calendarClosures/);
  assert.match(model, /reasonByDate\.set\(date, String\(event\.title\)\)/);
  assert.doesNotMatch(model, /Before learner opening/);
  assert.doesNotMatch(model, /After learner closing/);
  assert.match(renderer, /compactCalendarReason/);
  assert.match(renderer, /rowspan="\$\{Math\.max\(1, section\.learners\.length\)\}"/);
  assert.match(renderer, /closure-column/);
  assert.match(renderer, /closure-label/);
  assert.match(renderer, /writing-mode:vertical-rl/);
});

test("register attendance columns remain compact within fixed paper geometry", () => {
  assert.match(renderer, /table-layout:fixed/);
  assert.match(renderer, /min-width:0; border-collapse:collapse/);
  assert.match(renderer, /const dayWidth = attendanceColumns \? 42 \/ attendanceColumns : 42/);
  assert.match(renderer, /<colgroup>\$\{columns\}<\/colgroup>/);
  assert.match(renderer, /\.identity\.surname \{ overflow-wrap:anywhere/);
  assert.match(renderer, /\.identity\.given \{ overflow-wrap:anywhere/);
  assert.match(renderer, /\.register-section \{ margin-top:0; break-after:page; overflow:visible/);
  assert.doesNotMatch(renderer, /min-width:max-content/);
});

test("printed term balance respects each learner's actual enrolment window", () => {
  assert.match(model, /calculateLearnerRegisterBalance/);
  assert.match(schoolDays, /if \(!activeOn\(date\)\) continue/);
  assert.match(schoolDays, /termDays \+= 1/);
  assert.match(schoolDays, /const termAttended = termDays - termAbsent/);
  assert.match(model, /termDays: balance\.termDays/);
  assert.match(model, /termPossibleTotal: learners\.reduce\(\(sum, learner\) => sum \+ learner\.termDays, 0\)/);
  assert.doesNotMatch(model, /termPossibleTotal: learners\.length \* termTeachingDayCount/);
});

test("printed registers use official learner term boundaries rather than teacher boundaries", () => {
  assert.match(model, /list_academic_term_calendar_summary/);
  assert.match(model, /item\.academic_term_id === term\.id/);
  assert.match(model, /const termStart = learnerTerm\?\.learner_starts_on \?\? null/);
  assert.match(model, /const termEnd = learnerTerm\?\.learner_ends_on \?\? null/);
  assert.doesNotMatch(model, /learnerTerm\?\.learner_starts_on \?\? term\?\.startsOn/);
  assert.match(model, /governedDays\.eligibleDates/);
  assert.doesNotMatch(model, /impactByDate\.get\([^\n]+!== "NO_TEACHING"/);
});
