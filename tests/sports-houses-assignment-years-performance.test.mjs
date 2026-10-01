import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const queries = readFileSync("src/features/sports-houses/server/queries.ts", "utf8");

test("sports houses collapses assignment-year history scans into one RPC", () => {
  assert.match(queries, /supabase\.rpc\("get_sports_house_assignment_years"/);
  assert.doesNotMatch(
    queries,
    /from\("sports_learner_house_assignments"\)\.select\("academic_year"\)/,
  );
  assert.doesNotMatch(
    queries,
    /from\("sports_staff_house_assignments"\)\.select\("academic_year"\)/,
  );
  assert.doesNotMatch(queries, /learnerAssignmentsYearsResult|staffAssignmentYearsResult/);
});

test("sports houses preserves complete year selector composition", () => {
  assert.match(queries, /currentYear,/);
  assert.match(queries, /academicYear,/);
  assert.match(queries, /\.\.\.settings\.map\(\(row\) => row\.academicYear\)/);
  assert.match(
    queries,
    /assignmentYearsResult\.data[\s\S]*\.map\(\(row\) => row\.academic_year\)/,
  );
});