import assert from "node:assert/strict";

import {
  calculateLearnerRegisterBalance,
  resolveGovernedSchoolDays,
} from "../../src/features/attendance/server/governed-school-day.ts";

const rows = [
  { target_date: "2026-01-05", teaching_impact: "NORMAL" },
  { target_date: "2026-01-06", teaching_impact: "NORMAL" },
  // The final governed resolver value represents an authorised override that
  // reopened a public holiday after precedence was applied.
  { target_date: "2026-01-07", teaching_impact: "NORMAL" },
  { target_date: "2026-01-08", teaching_impact: "NO_TEACHING" },
  { target_date: "2026-01-09", teaching_impact: "NORMAL" },
  { target_date: "2026-01-10", teaching_impact: "NORMAL" },
  // 11 January is an ordinary Sunday with no resolver row.
  { target_date: "2026-01-12", teaching_impact: "NORMAL" },
  { target_date: "2026-01-13", teaching_impact: "NORMAL" },
  { target_date: "2026-01-14", teaching_impact: "NORMAL" },
  { target_date: "2026-01-15", teaching_impact: "NORMAL" },
  { target_date: "2026-01-16", teaching_impact: "NORMAL" },
  { target_date: "2026-01-17", teaching_impact: "NO_TEACHING" },
  // 18 January is an ordinary Sunday with no resolver row.
];

const calendar = resolveGovernedSchoolDays({
  start: "2026-01-05",
  end: "2026-01-18",
  rows,
});

assert.equal(calendar.decisionFor("2026-01-05").eligible, true, "normal weekday is eligible");
assert.deepEqual(
  calendar.decisionFor("2026-01-08"),
  { date: "2026-01-08", impact: "NO_TEACHING", eligible: false, displayed: true },
  "weekday closure remains displayed but contributes zero attendance",
);
assert.equal(calendar.decisionFor("2026-01-10").eligible, true, "authorised replacement Saturday is eligible");
assert.equal(calendar.decisionFor("2026-01-11").eligible, false, "missing Sunday is closed");
assert.equal(calendar.decisionFor("2026-01-11").displayed, false, "missing Sunday is not printed");
assert.equal(calendar.decisionFor("2026-01-17").eligible, false, "explicitly closed Saturday is excluded");
assert.equal(calendar.decisionFor("2026-01-07").eligible, true, "governed reopened holiday is eligible");
assert.equal(calendar.decisionFor("2026-01-04").eligible, false, "before learner opening is excluded");
assert.equal(calendar.decisionFor("2026-01-19").eligible, false, "after learner closing is excluded");
assert.equal(
  calendar.displayedDates().filter((date) => date === "2026-01-10").length,
  1,
  "replacement Saturday is included exactly once",
);

const ordinaryWeekendCalendar = resolveGovernedSchoolDays({
  start: "2026-01-19",
  end: "2026-01-25",
  rows: [
    { target_date: "2026-01-19", teaching_impact: "NORMAL" },
    { target_date: "2026-01-20", teaching_impact: "NORMAL" },
    { target_date: "2026-01-21", teaching_impact: "NORMAL" },
    { target_date: "2026-01-22", teaching_impact: "NORMAL" },
    { target_date: "2026-01-23", teaching_impact: "NORMAL" },
  ],
});
assert.equal(ordinaryWeekendCalendar.decisionFor("2026-01-24").eligible, false, "missing Saturday is closed");
assert.equal(ordinaryWeekendCalendar.decisionFor("2026-01-24").displayed, false, "missing Saturday is not printed");
assert.equal(ordinaryWeekendCalendar.decisionFor("2026-01-25").eligible, false, "missing Sunday is closed");

assert.throws(
  () => resolveGovernedSchoolDays({
    start: "2026-01-05",
    end: "2026-01-09",
    rows: rows.filter((row) => row.target_date !== "2026-01-06"),
  }),
  /no authoritative result for 2026-01-06/,
  "missing weekday fails ready instead of guessing",
);
assert.throws(
  () => resolveGovernedSchoolDays({
    start: "2026-01-05",
    end: "2026-01-09",
    rows: [{ target_date: "2026-01-05", teaching_impact: "OPENISH" }],
  }),
  /malformed evidence/,
  "unknown impact cannot authorise a school day",
);
assert.throws(
  () => resolveGovernedSchoolDays({
    start: "2026-01-05",
    end: "2026-01-09",
    rows: [{ target_date: "not-a-date", teaching_impact: "NORMAL" }],
  }),
  /malformed evidence/,
  "malformed dates fail ready",
);

const continuingLearnerEvidence = new Map([
  ["2026-01-06", { status: "absent", reasonId: null, note: null }],
  ["2026-01-10", { status: "absent", reasonId: "reason", note: null }],
]);
const shortEnrolmentEvidence = new Map([
  ["2026-01-13", { status: "absent", reasonId: null, note: "note" }],
]);
const termEligibleDates = calendar.eligibleDates();
const scopeDays = (start, end) => calendar.displayedDates(start, end).map((date) => ({
  date,
  eligible: calendar.decisionFor(date).eligible,
}));
const balance = (start, end, enrolledFrom, enrolledTo, learnerEvidence = continuingLearnerEvidence) => calculateLearnerRegisterBalance({
  scopeDays: scopeDays(start, end),
  termEligibleDates,
  enrolledFrom,
  enrolledTo,
  evidenceForDate: (date) => learnerEvidence.get(date),
});

const specificWeek = balance("2026-01-05", "2026-01-09", "2026-01-05", "2026-01-16");
assert.deepEqual(
  { attended: specificWeek.attended, absent: specificWeek.absent, possible: specificWeek.possible },
  { attended: 3, absent: 1, possible: 4 },
  "specific-week totals reconcile",
);

const weekRange = balance("2026-01-05", "2026-01-16", "2026-01-05", "2026-01-16");
assert.deepEqual(
  { attended: weekRange.attended, absent: weekRange.absent, possible: weekRange.possible },
  { attended: 8, absent: 2, possible: 10 },
  "week-range totals reconcile and include the replacement Saturday once",
);

const fullTerm = balance("2026-01-05", "2026-01-18", "2026-01-05", "2026-01-16");
assert.deepEqual(
  { attended: fullTerm.attended, absent: fullTerm.absent, possible: fullTerm.possible },
  { attended: 8, absent: 2, possible: 10 },
  "full-term totals reconcile",
);

const lateEnrolmentAndEarlyDeparture = balance(
  "2026-01-05",
  "2026-01-18",
  "2026-01-12",
  "2026-01-14",
  shortEnrolmentEvidence,
);
assert.deepEqual(
  {
    attended: lateEnrolmentAndEarlyDeparture.attended,
    absent: lateEnrolmentAndEarlyDeparture.absent,
    possible: lateEnrolmentAndEarlyDeparture.possible,
    termDays: lateEnrolmentAndEarlyDeparture.termDays,
  },
  { attended: 2, absent: 1, possible: 3, termDays: 3 },
  "late enrolment and early departure independently bound learner totals",
);

for (const learner of [specificWeek, weekRange, fullTerm, lateEnrolmentAndEarlyDeparture]) {
  assert.equal(learner.attended + learner.absent, learner.possible);
  assert.equal(learner.termAttended + learner.termAbsent, learner.termDays);
}

const schoolTotals = [fullTerm, lateEnrolmentAndEarlyDeparture].reduce(
  (total, learner) => ({
    attended: total.attended + learner.attended,
    absent: total.absent + learner.absent,
    possible: total.possible + learner.possible,
  }),
  { attended: 0, absent: 0, possible: 0 },
);
assert.equal(schoolTotals.attended + schoolTotals.absent, schoolTotals.possible);

process.stdout.write("governed register school-day scenarios reconciled\n");
