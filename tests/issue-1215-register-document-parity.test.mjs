import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const layoutSource = readFileSync("src/features/attendance/server/register-teacher-layout.ts", "utf8");
const modelSource = readFileSync("src/features/attendance/server/register-teacher-document.ts", "utf8");
const htmlSource = readFileSync("src/features/attendance/server/render-register-teacher-html.ts", "utf8");
const pdfSource = readFileSync("src/features/attendance/server/render-register-teacher-pdf.ts", "utf8");
const routeSource = readFileSync("src/app/api/attendance/register-teacher/route.ts", "utf8");

const compiledLayout = ts.transpileModule(layoutSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const layout = await import(`data:text/javascript;base64,${Buffer.from(compiledLayout).toString("base64")}`);

function learner(overrides) {
  return {
    enrolmentId: overrides.enrolmentId,
    learnerId: overrides.learnerId,
    admissionNumber: overrides.admissionNumber,
    surname: overrides.surname,
    givenNames: overrides.givenNames,
    dateOfBirth: "2014-01-01",
    sex: overrides.sex,
    enrolledFrom: "2026-01-12",
    enrolledTo: null,
    marks: overrides.marks,
    reasonedAbsenceDates: overrides.reasonedAbsenceDates ?? {},
    attended: overrides.attended,
    absent: overrides.absent,
    possible: 3,
    termAttended: overrides.attended,
    termAbsent: overrides.absent,
    termDays: 3,
  };
}

function section(sex, label, learners) {
  const dates = ["2026-02-02", "2026-02-03", "2026-02-04"];
  const attendanceByDate = Object.fromEntries(dates.map((date) => [date, learners.filter((item) => item.marks[date] === "I").length]));
  const absenceByDate = Object.fromEntries(dates.map((date) => [date, learners.filter((item) => item.marks[date] === "a").length]));
  const possibleByDate = Object.fromEntries(dates.map((date) => [date, attendanceByDate[date] + absenceByDate[date]]));
  return {
    sex,
    label,
    learners,
    attendanceByDate,
    absenceByDate,
    possibleByDate,
    attendanceTotal: learners.reduce((sum, item) => sum + item.attended, 0),
    absenceTotal: learners.reduce((sum, item) => sum + item.absent, 0),
    possibleTotal: learners.length * dates.length,
    termAttendanceTotal: learners.reduce((sum, item) => sum + item.termAttended, 0),
    termAbsenceTotal: learners.reduce((sum, item) => sum + item.termAbsent, 0),
    termPossibleTotal: learners.reduce((sum, item) => sum + item.termDays, 0),
  };
}

const boys = section("male", "BOYS", [learner({
  enrolmentId: "enrolment-boy",
  learnerId: "learner-boy",
  admissionNumber: "B-001",
  surname: "Amutenya",
  givenNames: "Fixture Boy",
  sex: "male",
  marks: { "2026-02-02": "I", "2026-02-03": "a", "2026-02-04": "I" },
  reasonedAbsenceDates: { "2026-02-03": true },
  attended: 2,
  absent: 1,
})]);
const girls = section("female", "GIRLS", [learner({
  enrolmentId: "enrolment-girl",
  learnerId: "learner-girl",
  admissionNumber: "G-001",
  surname: "Nandjebo",
  givenNames: "Fixture Girl",
  sex: "female",
  marks: { "2026-02-02": "a", "2026-02-03": "I", "2026-02-04": "I" },
  attended: 2,
  absent: 1,
})]);

const fixture = {
  mode: "week",
  academicYear: 2026,
  classId: "class-fixture",
  className: "Grade 6 A",
  gradeName: "Grade 6",
  registerTeacherName: "Fixture Teacher",
  termId: "term-fixture",
  termName: "Term 1",
  scopeStart: "2026-02-02",
  scopeEnd: "2026-02-04",
  selectedDate: "2026-02-04",
  teachingDayCount: 3,
  governanceAlerts: { invalidSubmissionCount: 2, invalidSubmissionDates: ["2026-02-01"] },
  weeks: [{
    weekId: "2026-02-02",
    weekEnding: "2026-02-06",
    dates: [
      { date: "2026-02-02", weekday: "M", dayNumber: "2", teaching: true, reason: null, weekId: "2026-02-02", weekEnding: "2026-02-06" },
      { date: "2026-02-03", weekday: "T", dayNumber: "3", teaching: true, reason: null, weekId: "2026-02-02", weekEnding: "2026-02-06" },
      { date: "2026-02-04", weekday: "W", dayNumber: "4", teaching: true, reason: null, weekId: "2026-02-02", weekEnding: "2026-02-06" },
    ],
  }],
  sections: [boys, girls],
};

test("fixture independently verifies nonzero absence totals, balance, sex sections and revision flags", () => {
  assert.doesNotThrow(() => layout.assertRegisterTeacherDocumentTotals(fixture));
  assert.deepEqual(layout.registerTeacherBalance(boys), {
    attendance: 2,
    absence: 1,
    possible: 3,
    accounted: 3,
    balanced: true,
  });
  assert.deepEqual(layout.registerTeacherValuesFor(girls, fixture.weeks[0], "absence"), [1, 0, 0]);
  assert.deepEqual(layout.registerTeacherPageJobs(fixture).map((job) => job.section.label), ["BOYS", "GIRLS"]);
  assert.match(layout.registerTeacherGovernanceAlert(fixture), /2 non-teaching submissions.*2026-02-01/);

  const corrupted = structuredClone(fixture);
  corrupted.sections[0].termAbsenceTotal = 0;
  assert.throws(() => layout.assertRegisterTeacherDocumentTotals(corrupted), /source-evidence verification/);
});

test("HTML and PDF consume the same authoritative model, pagination, totals and document chrome", () => {
  for (const source of [htmlSource, pdfSource]) {
    assert.match(source, /registerTeacherPageJobs\(.*document\)/);
    assert.match(source, /registerTeacherDocumentContext\(document\)/);
    assert.match(source, /registerTeacherValuesFor\(section, week, (?:row\.kind|kind)\)/);
    assert.match(source, /registerTeacherBalance\(section\)/);
    assert.match(source, /registerTeacherGovernanceAlert\(document\)/);
  }
  assert.match(htmlSource, /renderOfficialDocumentHtmlHeader/);
  assert.match(htmlSource, /OFFICIAL_DOCUMENT_HTML_HEADER_RULE/);
  assert.match(pdfSource, /drawOfficialDocumentPdfHeader/);
  assert.match(pdfSource, /StandardFonts\.ZapfDingbats/);
  assert.match(routeSource, /renderRegisterTeacherHtml\(\{ header, document \}\)/);
  assert.match(routeSource, /renderRegisterTeacherPdf\(\{[\s\S]*header,[\s\S]*document,/);
});

test("builder excludes governed remediation rows and audits every invalid submission revision", () => {
  assert.match(modelSource, /from\("attendance_register_submissions"\)/);
  assert.match(modelSource, /invalidSubmissionCount \+= 1/);
  assert.match(modelSource, /invalidSubmissionDates\.add\(attendanceDate\)/);
  assert.match(modelSource, /if \(!governedDays\.decisionFor\(attendanceDate\)\.eligible\)/);
  assert.match(modelSource, /if \(governedDays\.decisionFor\(attendanceDate\)\.eligible\) continue/);
  assert.match(modelSource, /assertRegisterTeacherDocumentTotals\(document\)/);
});
