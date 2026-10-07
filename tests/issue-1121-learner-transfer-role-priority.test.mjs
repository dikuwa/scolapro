import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const learnerPage = read("src/app/learners/[id]/page.tsx");
const userContext = read("src/lib/auth/get-user-context.ts");
const localAuthSeed = read("scripts/seed-local-auth.mjs");

test("learner profile honors the deterministic current-school primary role before fallback", () => {
  assert.match(learnerPage, /const primaryMembership = context\.currentSchoolMembership/);
  assert.match(
    learnerPage,
    /primaryMembership && learnerOperationalRoles\.has\(primaryMembership\.roleKey\)[\s\S]*\? primaryMembership[\s\S]*: context\.memberships\.find/,
  );
  assert.doesNotMatch(
    learnerPage,
    /const membership = context\.memberships\.find\(\(candidate\) => learnerOperationalRoles\.has\(candidate\.roleKey\)\);/,
  );
});

test("management transfer authority cannot be masked by a lower-priority teacher or HOD role", () => {
  assert.match(userContext, /primarySchoolRolePriority/);
  assert.match(userContext, /"school_admin",[\s\S]*"principal",[\s\S]*"deputy_principal",[\s\S]*"hod",[\s\S]*"teacher"/);
  assert.match(learnerPage, /const learnerExitRoles = new Set\(\["school_admin", "principal", "deputy_principal"\]\)/);
  assert.match(learnerPage, /learnerExitRoles\.has\(membership\.roleKey\)/);
  assert.match(learnerPage, /Transfer learner/);
  assert.match(learnerPage, /#learner-transfer-workflow/);
});

test("learner profile capabilities are additive across active roles in the selected school", () => {
  assert.match(learnerPage, /const currentSchoolMemberships = context\.memberships\.filter/);
  assert.match(learnerPage, /candidate\.schoolId === membership\.schoolId/);
  assert.match(learnerPage, /const currentSchoolRoleKeys = new Set\(currentSchoolMemberships\.map/);
  assert.match(learnerPage, /hasCurrentSchoolRole\(correctionRequestRoles\)/);
  assert.match(learnerPage, /currentSchoolRoleKeys\.has\("school_admin"\)/);
  assert.match(learnerPage, /\["school_admin", "principal", "deputy_principal", "hod"\]\.some/);
  assert.doesNotMatch(learnerPage, /canViewConduct = correctionRequestRoles\.has\(membership\.roleKey\)/);
});

test("fallback remains current-school scoped and local reset auth seed restores a school-admin identity", () => {
  assert.match(userContext, /const memberships = currentSchoolId[\s\S]*allSchoolMemberships\.filter\(\(membership\) => membership\.schoolId === currentSchoolId\)/);
  assert.match(localAuthSeed, /role_key: "school_admin"/);
  assert.match(localAuthSeed, /school_id: schoolId/);
  assert.match(localAuthSeed, /Local school-admin account is ready/);
});
