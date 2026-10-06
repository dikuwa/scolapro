import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/features/attendance/register-teacher-marks.ts", "utf8");

test("register teacher marks match the physical register convention", () => {
  assert.match(source, /REGISTER_TEACHER_PRESENT_MARK = "I"/);
  assert.match(source, /REGISTER_TEACHER_ABSENT_MARK = "a"/);
  assert.match(source, /font-sans italic/);
  assert.doesNotMatch(source, /font-serif/);
});

test("inactive register dates render no attendance mark", () => {
  assert.match(source, /status === "present"/);
  assert.match(source, /status === "absent"/);
  assert.match(source, /return ""/);
});
