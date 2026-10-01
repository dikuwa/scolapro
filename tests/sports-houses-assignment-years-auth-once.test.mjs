import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261001133000_sports_house_assignment_years_auth_once.sql",
  "utf8",
);
const queries = readFileSync("src/features/sports-houses/server/queries.ts", "utf8");

test("sports assignment years authorizes once before aggregation", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /auth\.uid\(\) is null/);
  assert.match(migration, /app_private\.has_school_access\(p_school_id\)/);
  assert.match(migration, /Permission denied/);
  assert.match(migration, /sports_learner_house_assignments/);
  assert.match(migration, /sports_staff_house_assignments/);
});

test("sports houses keeps the same assignment-year RPC contract", () => {
  assert.match(queries, /rpc\("get_sports_house_assignment_years", \{ p_school_id: schoolId \}\)/);
  assert.doesNotMatch(queries, /sports_learner_house_assignments.*academic_year/);
  assert.doesNotMatch(queries, /sports_staff_house_assignments.*academic_year/);
});