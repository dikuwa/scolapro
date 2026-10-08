import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const setupPage = readFileSync("src/app/school/setup/page.tsx", "utf8");
const hodActions = readFileSync("src/features/academics/server/hod-scope-actions.ts", "utf8");
const capabilities = readFileSync("src/lib/auth/school-capabilities.ts", "utf8");

test("Academic setup aggregates roles for the current school instead of trusting membership order", () => {
  assert.match(setupPage, /context\.currentSchoolMembership\?\.schoolId/);
  assert.match(setupPage, /schoolMemberships = context\.memberships\.filter\(\(item\) => item\.schoolId === currentSchoolId\)/);
  assert.match(setupPage, /schoolRoleKeys = new Set\(schoolMemberships\.map\(\(item\) => item\.roleKey\)\)/);
  assert.match(setupPage, /canManageAcademicStructure = schoolRoleKeys\.has\("school_admin"\)/);
});

test("School Admin capability restores full academic structure controls independent of first role row", () => {
  assert.match(setupPage, /canManageAcademicStructure \? \(/);
  assert.match(setupPage, /<AcademicStructureForms/);
  assert.match(setupPage, /<RoomManagement/);
  assert.match(setupPage, /canEditStructure=\{canManageAcademicStructure\}/);
});

test("HOD portfolio server authorization matches governed database leadership roles", () => {
  assert.match(capabilities, /"school_admin", "principal", "deputy_principal"/);
  assert.match(hodActions, /hasAnySchoolRole\(context\.memberships, schoolId, schoolLeadershipRoles\)/);
});

test("HOD portfolio exposes actionable governed validation feedback", () => {
  assert.match(hodActions, /selected HOD placement is not effective on the chosen start date/);
  assert.match(hodActions, /Choose at least one subject/);
  assert.match(hodActions, /end date cannot be before the start date/);
  assert.match(hodActions, /portfolio label is too long/);
});
