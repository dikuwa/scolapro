import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const helper = read("src/lib/auth/school-capabilities.ts");
const actions = read("src/features/academics/server/hod-scope-actions.ts");
const setup = read("src/app/school/setup/page.tsx");
test("capabilities combine active roles only in selected school", () => {
  assert.match(helper, /memberships\.some\(\(membership\) => membership\.schoolId === schoolId && allowedRoles\.has\(membership\.roleKey\)\)/);
  assert.match(helper, /school_admin.*principal.*deputy_principal/);
});
test("HOD actions use full current-school membership set rather than chosen display role", () => {
  assert.match(actions, /hasAnySchoolRole\(context\.memberships, schoolId, schoolLeadershipRoles\)/);
  assert.match(actions, /HOD authority alone covers existing assigned subjects/);
  assert.match(actions, /db\.rpc\("save_hod_subject_portfolio"/);
});
test("school setup uses shared leadership roles", () => {
  assert.match(setup, /hasAnySchoolRole\(schoolMemberships, currentSchoolId, schoolLeadershipRoles\)/);
});
