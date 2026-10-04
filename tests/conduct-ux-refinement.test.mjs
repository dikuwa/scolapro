import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("src/features/conduct/conduct-workspace.tsx","utf8");
const management = readFileSync("src/features/conduct/conduct-management-dashboard.tsx","utf8");
const policyPage = readFileSync("src/app/conduct/policy/page.tsx","utf8");

test("Conduct quick actions expose Recognition and collapsible Violation tabs", () => {
  assert.match(workspace,/Quick Recognition/);
  assert.match(workspace,/Quick Violation/);
  assert.match(workspace,/expandedQuickViolationGroups/);
  assert.match(workspace,/aria-expanded=\{expanded\}/);
  assert.match(workspace,/violationGroups\.map/);
  assert.match(workspace,/recognitionItems\.map/);
});

test("quick Violation groups reveal direct policy-item recording actions only when expanded", () => {
  assert.match(workspace,/violationItems\.filter\(\(item\) => item\.group_id === group\.id\)/);
  assert.match(workspace,/expanded \? \(/);
  assert.match(workspace,/openRecorder\(item\.id\)/);
});

test("management filters share an aligned control baseline", () => {
  assert.match(management,/>Learner<\/span>/);
  assert.match(management,/className="flex items-end"/);
  assert.match(management,/className="min-h-10 w-full"/);
  assert.match(management,/label="Grade"/);
  assert.match(management,/label="Class"/);
});

test("management Recognition and Violation values explain event count and points", () => {
  assert.match(management,/recognition_count} event/);
  assert.match(management,/recognition_points\)} pts/);
  assert.match(management,/violation_count} event/);
  assert.match(management,/violation_points\)} pts/);
});

test("Conduct policy has standard back navigation to Conduct", () => {
  assert.match(policyPage,/href="\/conduct"/);
  assert.match(policyPage,/AppBackLink/);
});
