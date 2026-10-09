import assert from "node:assert/strict";
import { resolveAttendanceDayDecision } from "../../src/features/attendance/server/learner-calendar-bounds.ts";
import { calculateLearnerRegisterBalance } from "../../src/features/attendance/server/governed-school-day.ts";

const terms = [
  { learner_starts_on: "2026-01-12", learner_ends_on: "2026-04-28" },
  { learner_starts_on: "2026-06-01", learner_ends_on: "2026-08-20" },
  { learner_starts_on: "2026-09-07", learner_ends_on: "2026-12-04" },
];
const decide = (date, resolvedImpact = "NORMAL", override = null, resolverAvailable = true) => resolveAttendanceDayDecision({ date, terms, resolvedImpact, override, resolverAvailable });

for (const date of ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]) {
  assert.deepEqual(decide(date), { impact: "NO_TEACHING", reason: "Between learner terms", kind: "out_of_term", eligible: false });
}
assert.equal(decide("2026-10-05", "NO_TEACHING").kind, "in_term_non_teaching");
assert.equal(decide("2026-10-05", "NO_TEACHING").eligible, false);
for (const date of ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]) assert.equal(decide(date).eligible, true);

assert.equal(decide("2026-08-20").eligible, true, "term closing is inclusive");
assert.equal(decide("2026-08-21").eligible, false, "day after closing is excluded");
assert.equal(decide("2026-09-07").eligible, true, "term opening is inclusive");
assert.equal(decide("2026-12-04").eligible, true, "final closing is inclusive");
assert.equal(decide("2026-12-05").eligible, false, "day after final closing is excluded");

const reopened = decide("2026-08-31", "NORMAL", { isSchoolDay: true, teachingImpact: "NORMAL", reason: "Approved replacement day" });
assert.equal(reopened.kind, "teaching");
assert.equal(reopened.eligible, true, "explicit school opening wins outside term");
assert.equal(decide("2026-10-06", "NORMAL", { isSchoolDay: false, reason: "Emergency closure" }).eligible, false);
assert.equal(decide("2026-10-06", null, null, false).kind, "unverified");
assert.equal(decide("2026-10-06", null, null, false).eligible, false, "unverified dates fail closed");

const balance = calculateLearnerRegisterBalance({
  scopeDays: [
    { date: "2026-10-05", eligible: false },
    { date: "2026-10-06", eligible: true },
    { date: "2026-10-07", eligible: true },
    { date: "2026-10-08", eligible: true },
    { date: "2026-10-09", eligible: true },
  ],
  termEligibleDates: ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"],
  enrolledFrom: "2026-10-07",
  enrolledTo: "2026-10-08",
  evidenceForDate: (date) => date === "2026-10-08" ? { status: "absent", reasonId: null, note: null } : undefined,
});
assert.deepEqual({ attended: balance.attended, absent: balance.absent, possible: balance.possible, termDays: balance.termDays }, { attended: 1, absent: 1, possible: 2, termDays: 2 });

process.stdout.write("issue 1206 governed attendance policy scenarios passed\n");
