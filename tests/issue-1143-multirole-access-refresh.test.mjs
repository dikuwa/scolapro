import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const staffPage = readFileSync("src/app/staff/page.tsx", "utf8");
const schoolSettings = readFileSync("src/app/school/settings/page.tsx", "utf8");
const learnersPage = readFileSync("src/app/learners/page.tsx", "utf8");
const accessManager = readFileSync("src/features/staff/staff-access-manager.tsx", "utf8");

test("staff administration uses the union of current-school roles", () => {
  assert.match(staffPage, /currentSchoolMembership\?\.schoolId/);
  assert.match(staffPage, /roleKeys = new Set\(schoolMemberships\.map/);
  assert.match(staffPage, /canAddStaff = roleKeys\.has\("school_admin"\)/);
  assert.doesNotMatch(staffPage, /canAddStaff = membership\.roleKey === "school_admin"/);
});

test("school settings capabilities remain additive for multi-role leadership", () => {
  assert.match(schoolSettings, /schoolRoleKeys = new Set/);
  assert.match(schoolSettings, /settingsRoles\.has\(roleKey\)/);
  assert.match(schoolSettings, /financeSettingsRoles\.has\(roleKey\)/);
  assert.doesNotMatch(schoolSettings, /financeSettingsRoles\.has\(membership\.roleKey\)/);
});

test("learner management capabilities are additive across current-school roles", () => {
  assert.match(learnersPage, /schoolMemberships = currentSchoolId/);
  assert.match(learnersPage, /roleKeys = new Set\(schoolMemberships\.map/);
  assert.match(learnersPage, /canRegisterLearner = roleKeys\.has\("school_admin"\)/);
  assert.match(learnersPage, /canManageSubjects = \["school_admin", "principal", "deputy_principal", "hod"\]\.some/);
});

test("ending a staff role has visible pending state and refreshes immediately", () => {
  assert.match(accessManager, /useRouter/);
  assert.match(accessManager, /useTransition/);
  assert.match(accessManager, /endingRoleId/);
  assert.match(accessManager, /LoaderCircle/);
  assert.match(accessManager, /hiddenRoleIds/);
  assert.match(accessManager, /router\.refresh\(\)/);
});

test("successfully ended roles disappear optimistically while historical end-dating stays server-governed", () => {
  assert.match(accessManager, /endStaffRole\(formData\)/);
  assert.match(accessManager, /new Set\(current\)\.add\(membershipId\)/);
  assert.match(accessManager, /row\.activeRoles\.filter\(\(item\) => !hiddenRoleIds\.has\(item\.id\)\)/);
});
