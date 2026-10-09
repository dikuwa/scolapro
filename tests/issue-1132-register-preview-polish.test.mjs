import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions = readFileSync("src/components/documents/official-document-actions.tsx", "utf8");
const closeAction = readFileSync("src/components/ui/close-action.tsx", "utf8");
const responsibilities = readFileSync("src/features/responsibilities/responsibilities-workspace.tsx", "utf8");
const register = readFileSync("src/features/attendance/server/render-register-teacher-html.ts", "utf8");

test("shared close action preserves the soft default and permits contextual variants", () => {
  assert.match(closeAction, /variant = "soft"/);
  assert.match(closeAction, /variant=\{variant\}/);
  assert.match(closeAction, /<X className="size-3\.5"/);
  assert.match(actions, /<CloseAction/);
  assert.match(actions, /<CloseAction variant="danger"/);
  assert.match(actions, /Close document preview/);
  assert.match(responsibilities, /<CloseAction/);
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
