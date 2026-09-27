import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync("src/features/conduct/conduct-management-dashboard.tsx","utf8");
const route = readFileSync("src/app/conduct/manage/page.tsx","utf8");
const conduct = readFileSync("src/app/conduct/page.tsx","utf8");

test("management Conduct view is summary first", () => {
  for (const token of ["Active learners","With records","Recognitions","Violations","Attention events","Repeated patterns","Learner conduct overview"]) {
    assert.match(dashboard,new RegExp(token));
  }
});

test("management view supports scan filters and pagination", () => {
  assert.match(dashboard,/Search learner/);
  assert.match(dashboard,/label="Grade"/);
  assert.match(dashboard,/label="Class"/);
  assert.match(dashboard,/Attention only/);
  assert.match(dashboard,/Repeated only/);
  assert.match(dashboard,/Previous/);
  assert.match(dashboard,/Next/);
});

test("management indicators are prompts not automatic learner classifications", () => {
  assert.match(dashboard,/review prompts only/);
  assert.match(dashboard,/do not classify a learner/);
  assert.doesNotMatch(dashboard,/good learner|bad learner|poor learner/i);
});

test("leadership route is current-school scoped and includes HOD", () => {
  assert.match(route,/currentSchoolMembership/);
  assert.match(route,/candidate\.schoolId === currentSchoolId/);
  assert.match(route,/hod/);
  assert.match(route,/getGovernedAcademicYear/);
});

test("Conduct page exposes management separately from policy management", () => {
  assert.match(conduct,/canViewManagement/);
  assert.match(conduct,/canManagePolicy/);
  assert.match(conduct,/href="\/conduct\/manage"/);
  assert.match(conduct,/href="\/conduct\/policy"/);
});
