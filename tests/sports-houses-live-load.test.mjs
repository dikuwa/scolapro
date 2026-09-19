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
  assert.match(queries, /learner identities read failed/);
  assert.match(queries, /staff identities read failed/);
  assert.doesNotMatch(queries, /error\.message/);
  assert.doesNotMatch(queries, /JSON\.stringify\(.*error/);
});

test("large identity reads are chunked, deduplicated and mapped through canonical tables", () => {
  assert.match(queries, /IDENTITY_READ_CHUNK_SIZE = 200/);
  assert.match(queries, /async function readIdentityRowsInChunks/);
  assert.match(queries, /const uniqueIds = \[\.\.\.new Set\(ids\)\]/);
  assert.match(queries, /offset \+= IDENTITY_READ_CHUNK_SIZE/);
  assert.match(queries, /readIdentityRowsInChunks(?:<[^>]+>)?\(\s*learnerIds/);
  assert.match(queries, /from\("learners"\)\.select\("id,first_names,surname"\)\.in\("id", chunk\)/);
  assert.match(queries, /readIdentityRowsInChunks(?:<[^>]+>)?\(\s*staffIds/);
  assert.match(queries, /from\("staff_members"\)\.select\("id,first_name,last_name,employee_number"\)\.in\("id", chunk\)/);
  assert.doesNotMatch(queries, /from\("learners"\)\.select\("id,first_names,surname"\)\.in\("id", learnerIds\)/);
  assert.doesNotMatch(queries, /from\("staff_members"\)\.select\("id,first_name,last_name,employee_number"\)\.in\("id", staffIds\)/);

  const ids = Array.from({ length: 813 }, (_, index) => `learner-${index}`);
  const chunks = [];
  for (let offset = 0; offset < ids.length; offset += 200) chunks.push(ids.slice(offset, offset + 200));
  assert.deepEqual(chunks.map((chunk) => chunk.length), [200, 200, 200, 200, 13]);
  assert.equal(new Set(chunks.flat()).size, ids.length);
  assert.deepEqual(chunks.flat(), ids);
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
