import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("src/features/conduct/conduct-workspace.tsx","utf8");
const actions = readFileSync("src/features/conduct/server/actions.ts","utf8");
const page = readFileSync("src/app/conduct/page.tsx","utf8");

test("fast recorder follows learner type group item note flow", () => {
  assert.match(workspace,/Learner\(s\)/);
  assert.match(workspace,/Recognition/);
  assert.match(workspace,/Violation/);
  assert.match(workspace,/label="Group"/);
  assert.match(workspace,/label="Conduct item"/);
  assert.match(workspace,/Type conduct item/);
  assert.match(workspace,/Note/);
  assert.match(workspace,/The selected conduct item becomes the event title automatically/);
});

test("fast recorder does not ask staff to retype summary or severity", () => {
  assert.doesNotMatch(workspace,/name="title"/);
  assert.doesNotMatch(workspace,/name="severity"/);
  assert.match(actions,/record_conduct_policy_item_group/);
});

test("multi learner recording and pending duplicate submit protection remain", () => {
  assert.match(workspace,/name="learnerIds"/);
  assert.match(workspace,/Add another learner/);
  assert.match(workspace,/selected\.length >= 200/);
  assert.match(workspace,/loading=\{pending\}/);
});

test("conduct page is Recognition and Violation focused", () => {
  assert.match(page,/Record Recognition and Violations quickly/);
  assert.match(page,/const domain: ConductDomain = "conduct"/);
  assert.doesNotMatch(workspace,/Incidents/);
  assert.doesNotMatch(workspace,/Achievements/);
});

test("recording page remains summary first", () => {
  assert.match(workspace,/Recognition items/);
  assert.match(workspace,/Violation items/);
  assert.match(workspace,/Learners in scope/);
  assert.match(workspace,/Recent groups/);
  assert.match(workspace,/Quick Recognition/);
});
