import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("src/features/conduct/conduct-workspace.tsx","utf8");
const select = readFileSync("src/components/ui/searchable-select.tsx","utf8");
const actions = readFileSync("src/features/conduct/server/actions.ts","utf8");

test("Conduct recorder uses persistent searchable learner multi-select", () => {
  assert.match(workspace,/SearchableSelect/);
  assert.match(workspace,/multiple/);
  assert.match(workspace,/multipleLabel="learner"/);
  assert.match(workspace,/selectedValues=\{selected\}/);
  assert.match(workspace,/name="learnerIds"/);
  assert.doesNotMatch(workspace,/Add another learner/);
});

test("learner multi-select supports all, grade, class and individual selection in the open menu", () => {
  assert.match(workspace,/label: "Selection"/);
  assert.match(workspace,/label: "Select all"/);
  assert.match(workspace,/label: "Grades"/);
  assert.match(workspace,/label: "Classes"/);
  assert.match(workspace,/toggleMany/);
  assert.match(select,/bulkActionGroups/);
  assert.match(select,/aria-multiselectable=\{multiple \|\| undefined\}/);
  assert.match(select,/selectedSet\.has\(option\.value\)/);
});

test("multi-select remains open while learner choices toggle and renders tick boxes", () => {
  assert.match(select,/if \(multiple\) \{[\s\S]*?onToggle\?\.\(option\.value\);[\s\S]*?inputRef\.current\?\.focus/);
  assert.match(select,/grid size-4 shrink-0 place-items-center/);
  assert.match(select,/selectedSet\.has\(option\.value\) \? <Check/);
});

test("Conduct page orders roster context before quick Recognition and Violation", () => {
  const roster = workspace.indexOf('aria-label="Conduct filters"');
  const quick = workspace.indexOf('aria-label="Quick conduct type"');
  assert.ok(roster >= 0 && quick >= 0 && roster < quick);
  assert.match(workspace,/label="Learner"/);
});

test("full current-school bulk selection limit is aligned in client and action validation", () => {
  assert.match(workspace,/1000 - current\.length/);
  assert.match(workspace,/of 1000 learners selected/);
  assert.match(actions,/learnerIds: z\.array\(z\.string\(\)\.uuid\(\)\)\.min\(1\)\.max\(1000\)/);
});
