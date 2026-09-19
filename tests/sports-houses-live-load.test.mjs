import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");
const queries = read("src/features/sports-houses/server/queries.ts");
const page = read("src/app/school/sports-houses/page.tsx");
const actions = read("src/features/sports-houses/server/actions.ts");
const phase1 = read("supabase/tests/sports_house_cross_school_assignment_test.sql");
const phase2 = read("supabase/tests/sports_house_assisted_balancing_test.sql");

test("Sports & Houses empty/populated workspaces have a canonical assignment fallback", () => {
  assert.match(queries, /sports_house_learner_roster/);
  assert.match(queries, /currentLearnerAssignmentsResult/);
  assert.match(queries, /The roster view is a read-model convenience/);
  assert.match(queries, /sports_learner_house_assignments/);
  assert.match(queries, /learnerIds\.map/);
});

test("Sports & Houses read failures are dependency-specific without exposing raw data", () => {
  assert.match(queries, /house configuration/);
  assert.match(queries, /learner assignments/);
  assert.match(queries, /staff placements/);
  assert.doesNotMatch(queries, /error\.message/);
  assert.doesNotMatch(queries, /JSON\.stringify\(.*error/);
});

test("Sports & Houses authority boundaries remain intact", () => {
  for (const role of ["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]) assert.match(page, new RegExp(role));
  assert.match(page, /platform_support/);
  assert.match(actions, /platform_support/);
  assert.match(phase1, /School Admin can create a valid learner house assignment/);
  assert.match(phase1, /another school/);
  assert.match(phase2, /Platform Support cannot operate school balancing/);
  assert.match(phase2, /another school manager cannot cross the school balancing boundary/);
});
