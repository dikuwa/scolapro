import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/attendance/page.tsx", "utf8");
const daily = readFileSync("src/features/attendance/daily-register.tsx", "utf8");
const identity = readFileSync("src/features/attendance/attendance-date-integrity.ts", "utf8");

// Regression guard for issue #1229. The official register capture must be able
// to show its success notification. That notification is driven by
// useActionState, so the component that owns it must survive the revalidatePath
// that follows a save. Keying <DailyRegister> by the submission id remounted the
// component and reset the action state to its initial value before the success
// effect could observe it — the notification never fired.
test("the day register is not remounted by a server revision", () => {
  assert.doesNotMatch(page, /key=\{`[^`]*currentSubmissionId/);
});

test("a server revision still resets the draft through the view identity", () => {
  assert.match(identity, /input\.submissionId \?\? "draft"/);
  assert.match(
    daily,
    /dailyAttendanceViewIdentity\(\{ registerClassId: selectedClassId, attendanceDate, submissionId: currentSubmissionId \}\)/,
  );
  assert.match(daily, /draft\.viewIdentity !== viewIdentity/);
});

test("capture feedback paths are preserved", () => {
  assert.match(daily, /toast\.success\(state\.message\)/);
  assert.match(daily, /toast\.error\(state\.message\)/);
  assert.match(daily, /router\.refresh\(\)/);
  assert.match(daily, /toast\.warning\("Unsaved attendance changes"/);
});
