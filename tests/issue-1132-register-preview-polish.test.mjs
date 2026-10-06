import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions = readFileSync("src/components/documents/official-document-actions.tsx", "utf8");
const register = readFileSync("src/features/attendance/server/render-register-teacher-html.ts", "utf8");

test("shared document preview close action stays prominent but minimal", () => {
  assert.match(actions, /Close document preview/);
  assert.match(actions, /border-border-subtle/);
  assert.match(actions, /bg-surface/);
  assert.match(actions, /text-brand-strong/);
  assert.match(actions, /hover:bg-brand-soft/);
  assert.match(actions, /focus-visible:ring-2/);
  assert.doesNotMatch(actions, /bg-\[color:var\(--danger\)\]/);
});

test("register legend is aligned as one compact visual row", () => {
  assert.match(register, /\.legend \{[^}]*align-items:center[^}]*flex-wrap:wrap/s);
  assert.match(register, /\.legend > span \{[^}]*align-items:center/s);
  assert.match(register, /\.legend \.mark-sample \{[^}]*place-items:center/s);
});

test("week ending headings use aligned label and date blocks", () => {
  assert.match(register, /week-heading-label/);
  assert.match(register, /week-heading-date/);
  assert.match(register, /\.week-heading \{[^}]*text-align:center[^}]*vertical-align:middle/s);
});

test("each register section ends with a structured aligned balance footer", () => {
  assert.match(register, /balance-item/);
  assert.match(register, /balance-result/);
  assert.match(register, /\.balance-strip \{[^}]*display:grid[^}]*justify-content:end/s);
  assert.match(register, /section\.termAttendanceTotal/);
  assert.match(register, /section\.termAbsenceTotal/);
  assert.match(register, /section\.termPossibleTotal/);
});
