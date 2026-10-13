import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const buttons = read("src/components/ui/button.tsx");
const toggle = read("src/components/ui/card-action-toggle.tsx");
const activities = read("src/features/calendar/department-activities-manager.tsx");
const close = read("src/components/ui/close-action.tsx");

test("delete and close button variants use existing theme-aware soft danger tokens", () => {
  assert.match(buttons, /danger: "bg-danger-soft/);
  assert.match(buttons, /"danger-soft":\s*"bg-/);
  assert.match(buttons, /"danger-ghost": "bg-danger-soft/);
  assert.match(buttons, /var\(--danger-soft\)/);
  assert.doesNotMatch(buttons, /danger: "[^"\n]*hover:text-white/);
  assert.match(close, /variant = "danger-soft"/);
  assert.match(toggle, /bg-danger-soft text-/);
});

test("department activities closes in danger-soft, including the form cancel action", () => {
  assert.match(activities, /variant=\{showAdd \? "danger-soft" : "soft"\}/);
  assert.match(activities, /variant="danger-soft" onClick=\{onDone\}>Cancel/);
  assert.match(activities, /variant="danger-ghost"/);
  assert.match(activities, /variant="danger" loading=\{cancelPending\}/);
});
