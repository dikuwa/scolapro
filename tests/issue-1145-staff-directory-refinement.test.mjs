import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const directory = readFileSync("src/features/staff/server/directory.ts", "utf8");
const page = readFileSync("src/app/staff/page.tsx", "utf8");
const access = readFileSync("src/features/staff/staff-access-manager.tsx", "utf8");

test("same-day ended school roles stay removed after staff directory refresh", () => {
  assert.match(directory, /activeRoles: \(row\.active_roles \?\? \[\]\)\.filter/);
  assert.match(directory, /!item\.activeTo \|\| item\.activeTo > onDate/);
  assert.doesNotMatch(directory, /item\.activeTo >= onDate/);
});

test("staff rows show one placement label instead of duplicating every account role", () => {
  assert.match(page, /const primaryPlacement = row\.labels\[0\] \?\? "Staff"/);
  assert.match(page, /humanRole\(primaryPlacement\)/);
  assert.doesNotMatch(page, /row\.labels\.map/);
});

test("linked accounts keep secondary role controls behind progressive disclosure", () => {
  assert.match(access, /const \[accessOpen, setAccessOpen\] = useState\(false\)/);
  assert.match(access, /Manage access/);
  assert.match(access, /Close access/);
  assert.match(access, /visibleRoles\.length/);
  assert.match(access, /No active ScolaPro roles/);
});

test("staff without accounts get a compact invite affordance before the form opens", () => {
  assert.match(access, /No login access/);
  assert.match(access, /accessOpen \? "Close" : "Invite"/);
  assert.match(access, /Send invite/);
});

test("identity management remains available alongside compact access controls", () => {
  assert.match(page, /<StaffIdentityManager schoolId=\{schoolId\} row=\{row\} candidates=\{directory\.rows\} \/>/);
  assert.match(access, /Manage identity/);
});
