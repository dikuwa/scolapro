import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  learnerRow,
  layout,
  model,
  normalImpactRows,
  weekdaysBetween,
} from "./helpers/register-teacher-harness.mjs";

const TERM_START = "2026-01-12";
const TERM_END = "2026-03-27";

function buildWeekDocument(overrides = {}) {
  const selectedDate = overrides.selectedDate ?? "2026-01-16";
  const fromWeek = overrides.fromWeek ?? "2026-01-12";
  const scope = model.resolveRegisterTeacherScope({
    mode: overrides.mode ?? "week",
    selectedDate,
    fromWeek,
    termStart: TERM_START,
    termEnd: TERM_END,
  });
  return model.buildRegisterTeacherDocument({
    mode: overrides.mode ?? "week",
    academicYear: 2026,
    classId: "class-1",
    className: "Grade 6 A",
    gradeName: "Grade 6",
    registerTeacherName: "Fixture Teacher",
    termId: "term-1",
    termName: "Term 1",
    selectedDate,
    termStart: TERM_START,
    termEnd: TERM_END,
    scope,
    impactRows: overrides.impactRows ?? normalImpactRows(TERM_START, TERM_END),
    enrolments: overrides.enrolments ?? [],
    currentRows: overrides.currentRows ?? [],
    overrideRows: overrides.overrideRows ?? [],
    calendarEventRows: overrides.calendarEventRows ?? [],
    submissionRows: overrides.submissionRows ?? [],
  });
}

test("builder derives nonzero absences, reasoned absences and enrolment-effective denominators from raw evidence", () => {
  const document = buildWeekDocument({
    enrolments: [
      learnerRow({ id: "b1", surname: "Amutenya", first_names: "Boys One", sex: "male" }),
      learnerRow({ id: "b2", surname: "Bock", first_names: "Boys Two", sex: "male", enrolled_from: "2026-01-14" }),
      learnerRow({ id: "g1", surname: "Nandjebo", first_names: "Girls One", sex: "female" }),
    ],
    currentRows: [
      { enrolment_id: "b1", attendance_date: "2026-01-13", status: "absent", reason_id: "reason-1", note: null },
      { enrolment_id: "b1", attendance_date: "2026-01-15", status: "absent", reason_id: null, note: null },
      { enrolment_id: "g1", attendance_date: "2026-01-12", status: "absent", reason_id: null, note: "Sick note" },
    ],
  });

  const boys = document.sections.find((section) => section.sex === "male");
  const girls = document.sections.find((section) => section.sex === "female");
  const boyA = boys.learners.find((learner) => learner.enrolmentId === "b1");
  const boyB = boys.learners.find((learner) => learner.enrolmentId === "b2");
  const girlA = girls.learners.find((learner) => learner.enrolmentId === "g1");

  // Nonzero absences and reasoned-absence flags come straight from raw evidence.
  assert.equal(boyA.attended, 3);
  assert.equal(boyA.absent, 2);
  assert.equal(boyA.possible, 5);
  assert.equal(boyA.marks["2026-01-13"], "a");
  assert.equal(boyA.reasonedAbsenceDates["2026-01-13"], true, "reason_id marks a reasoned absence");
  assert.equal(Boolean(boyA.reasonedAbsenceDates["2026-01-15"]), false, "an unreasoned absence is not flagged");
  assert.equal(girlA.absent, 1);
  assert.equal(girlA.reasonedAbsenceDates["2026-01-12"], true, "a note marks a reasoned absence");

  // Enrolment-effective denominator: a learner enrolled mid-week only counts active days.
  assert.equal(boyB.enrolledFrom, "2026-01-14");
  assert.equal(boyB.possible, 3, "possible attendance excludes days before enrolment");
  assert.equal(boyB.marks["2026-01-12"], "");
  assert.equal(boyB.marks["2026-01-13"], "");

  // Section daily totals are recomputed from learner marks.
  assert.equal(boys.attendanceByDate["2026-01-12"], 1, "only the enrolled-present boy counts on Monday");
  assert.equal(girls.absenceByDate["2026-01-12"], 1);

  // Balance invariant and self-verification pass on the derived document.
  assert.doesNotThrow(() => layout.assertRegisterTeacherDocumentTotals(document));
  const tampered = structuredClone(document);
  tampered.sections[0].termAbsenceTotal += 1;
  assert.throws(() => layout.assertRegisterTeacherDocumentTotals(tampered), /source-evidence verification/);
});

test("builder audits non-teaching submissions and excludes them from official totals", () => {
  const impactRows = normalImpactRows(TERM_START, TERM_END).map((row) =>
    row.target_date === "2026-01-14" ? { ...row, teaching_impact: "NO_TEACHING" } : row);

  const document = buildWeekDocument({
    impactRows,
    enrolments: [
      learnerRow({ id: "b1", surname: "Amutenya", first_names: "Boys One", sex: "male" }),
    ],
    currentRows: [
      // Recorded on a governed non-teaching day: must not enter the official totals.
      { enrolment_id: "b1", attendance_date: "2026-01-14", status: "absent", reason_id: "reason-1", note: null },
      // A normal teaching-day absence still counts.
      { enrolment_id: "b1", attendance_date: "2026-01-13", status: "absent", reason_id: null, note: null },
    ],
    calendarEventRows: [
      { event_scope: "school", title: "School holiday", starts_on: "2026-01-14", ends_on: "2026-01-14", created_at: "2026-01-01T00:00:00Z" },
    ],
    submissionRows: [
      { attendance_date: "2026-01-14" }, // non-teaching weekday
      { attendance_date: "2026-01-17" }, // Saturday
      { attendance_date: "2026-01-17" }, // revision of the same invalid day
      { attendance_date: "2026-01-13" }, // valid teaching day
    ],
  });

  const closedDay = document.weeks[0].dates.find((day) => day.date === "2026-01-14");
  assert.equal(closedDay.teaching, false);
  assert.equal(closedDay.reason, "School holiday", "governed calendar reason is preserved");

  // Excluded from official possible/absence totals.
  const boys = document.sections[0];
  assert.equal(boys.possibleByDate["2026-01-14"], 0);
  assert.equal(boys.absenceByDate["2026-01-14"], 0);
  assert.equal(boys.absenceByDate["2026-01-13"], 1);

  // But every non-teaching submission remains auditable (including the revision).
  assert.equal(document.governanceAlerts.invalidSubmissionCount, 3);
  assert.deepEqual(document.governanceAlerts.invalidSubmissionDates, ["2026-01-14", "2026-01-17"]);
});

test("builder reflects revised (current) evidence without double counting teaching-day submissions", () => {
  const document = buildWeekDocument({
    enrolments: [
      learnerRow({ id: "b1", surname: "Amutenya", first_names: "Boys One", sex: "male" }),
    ],
    // daily_register_current is the latest revision; the builder uses it directly.
    currentRows: [
      { enrolment_id: "b1", attendance_date: "2026-01-13", status: "absent", reason_id: "reason-1", note: null },
    ],
    // Several teaching-day submissions (original + revisions) must not inflate anything.
    submissionRows: [
      { attendance_date: "2026-01-13" },
      { attendance_date: "2026-01-13" },
      { attendance_date: "2026-01-13" },
    ],
  });
  assert.equal(document.governanceAlerts.invalidSubmissionCount, 0, "teaching-day revisions are not governance violations");
  const boyA = document.sections[0].learners[0];
  assert.equal(boyA.absent, 1);
  assert.equal(boyA.reasonedAbsenceDates["2026-01-13"], true);
});

test("term mode clips totals to the selected date and the full-term day count is preserved", () => {
  const selectedDate = "2026-01-16";
  const document = buildWeekDocument({
    mode: "term",
    selectedDate,
    enrolments: [learnerRow({ id: "b1", surname: "Amutenya", first_names: "Boys One", sex: "male" })],
  });
  const expectedTermDays = weekdaysBetween(TERM_START, selectedDate).length;
  assert.equal(document.sections[0].termPossibleTotal, expectedTermDays);
  assert.equal(document.scopeEnd, selectedDate);
  assert.ok(document.teachingDayCount > expectedTermDays, "full-term day count must exceed the term-to-date clip");
});

test("both renderers consume the shared layout contract, not their own layout", () => {
  const htmlSource = readFileSync("src/features/attendance/server/render-register-teacher-html.ts", "utf8");
  const pdfSource = readFileSync("src/features/attendance/server/render-register-teacher-pdf.ts", "utf8");
  for (const source of [htmlSource, pdfSource]) {
    assert.match(source, /registerTeacherColumnPlan\(/);
    assert.match(source, /registerTeacherPageJobs\((?:document|input\.document)\)/);
    assert.match(source, /registerTeacherDocumentContext\((?:document|input\.document)\)/);
    assert.match(source, /registerTeacherValuesFor\(section, week, (?:row\.kind|kind)\)/);
    assert.match(source, /registerTeacherBalance\(section\)/);
    assert.match(source, /registerTeacherGovernanceAlert\(document\)/);
  }
  // The builder must be the single aggregation path used by the fetch function.
  const modelSource = readFileSync("src/features/attendance/server/register-teacher-document.ts", "utf8");
  assert.match(modelSource, /export function buildRegisterTeacherDocument\(/);
  assert.match(modelSource, /export function resolveRegisterTeacherScope\(/);
  assert.match(modelSource, /return buildRegisterTeacherDocument\(/);
});
