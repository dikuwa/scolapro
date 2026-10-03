import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("mark grid reads server-authoritative window state and scopes learner editability", async () => {
  const server = await read("src/features/assessment/server/mark-grid.ts");
  assert.match(server, /resolve_assessment_mark_entry_window/);
  assert.match(server, /reopenedEnrolmentIds/);
  assert.match(server, /editable:window\.editable \|\| reopenedEnrolmentIds\.has\(row\.id\)/);
  assert.match(server, /canBroadReopen/);
});

test("mark grid actions configure, lock and authorise bounded correction through RPCs", async () => {
  const actions = await read("src/features/assessment/server/mark-grid-actions.ts");
  assert.match(actions, /configure_assessment_mark_entry_window/);
  assert.match(actions, /lock_assessment_mark_entry/);
  assert.match(actions, /authorize_assessment_mark_correction/);
  assert.match(actions, /p_expires_at/);
  assert.match(actions, /p_requires_reverification:true/);
  assert.doesNotMatch(actions, /rpc\("reopen_assessment_for_correction"/);
});

test("mark grid uses ScolaPro date, time and picker controls for governance", async () => {
  const workspace = await read("src/features/assessment/mark-grid-workspace.tsx");
  assert.match(workspace, /DateField/);
  assert.match(workspace, /TimeField/);
  assert.match(workspace, /Mark-entry window/);
  assert.match(workspace, /Automatic on deadline/);
  assert.match(workspace, /Deadline \+ HOD verification required/);
  assert.match(workspace, /Subject \+ class/);
  assert.match(workspace, /row\.editable/);
  assert.match(workspace, /countdownLabel/);
});


test("multi-line paste skips rows outside the bounded correction scope", async () => {
  const workspace = await read("src/features/assessment/mark-grid-workspace.tsx");
  assert.match(workspace, /if \(!row\.editable\) continue;/);
});
