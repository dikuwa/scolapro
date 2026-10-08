import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const directory = readFileSync("src/features/staff/server/directory.ts", "utf8");
const page = readFileSync("src/app/staff/page.tsx", "utf8");
const access = readFileSync("src/features/staff/staff-access-manager.tsx", "utf8");

test("staff directory trusts the authoritative active-role RPC result", () => {
  assert.match(directory, /activeRoles: row\.active_roles \?\? \[\]/);
  assert.doesNotMatch(directory, /activeRoles: \(row\.active_roles \?\? \[\]\)\.filter/);
});

test("staff rows show one placement label instead of duplicating every account role", () => {
  assert.match(page, /const primaryPlacement = row\.labels\[0\] \?\? "Staff"/);
  assert.match(page, /humanRole\(primaryPlacement\)/);
  assert.doesNotMatch(page, /row\.labels\.map/);
});

test("linked accounts keep role controls behind one controlled row panel", () => {
  assert.match(access, /type StaffRowPanel = "access" \| "identity" \| "hod-placement" \| null/);
  assert.match(access, /const \[panel, setPanel\] = useState<StaffRowPanel>\(null\)/);
  assert.match(access, /Manage access/);
  assert.doesNotMatch(access, /Close access/);
  assert.match(access, /visibleRoles\.length/);
  assert.match(access, /No active ScolaPro roles/);
});

test("staff without accounts get a complete invite summary before the form opens", () => {
  assert.match(access, /No login account/);
  assert.match(access, /Placement exists; ScolaPro access has not been created/);
  assert.match(access, /Invite/);
  assert.match(access, /Send invite/);
});

test("identity management shares the unified full-width row tray", () => {
  assert.match(page, /<StaffDirectoryRowControls schoolId=\{schoolId\} row=\{row\} candidates=\{directory\.rows\} \/>/);
  assert.match(access, /panel === "identity"/);
  assert.match(access, /Identity management/);
  assert.match(access, /lg:col-start-2 lg:col-end-5/);
});
