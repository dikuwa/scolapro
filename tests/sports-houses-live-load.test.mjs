import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");
const queries = read("src/features/sports-houses/server/queries.ts");
const rpc = read("supabase/migrations/20260920210000_sports_house_workspace_roster.sql");
const dbTest = read("supabase/tests/sports_house_workspace_roster_test.sql");
const page = read("src/app/school/sports-houses/page.tsx");
const actions = read("src/features/sports-houses/server/actions.ts");
const phase2 = read("supabase/tests/sports_house_assisted_balancing_test.sql");

test("Sports & Houses initial learner load uses one governed school/year roster read", () => {
  assert.match(queries, /rpc\("get_sports_house_operational_learner_roster"/);
  assert.match(queries, /p_school_id: schoolId/);
  assert.match(queries, /p_academic_year: academicYear/);
  assert.match(
    queries,
    /\.select\(\s*"learner_id,first_names,surname,admission_number,sex,grade_id,grade_name,register_class_id,register_class_name,house_id,house_name,house_color_hex,assignment_source,is_locked,assigned_at,age_on_reference_date,age_group_label"/,
  );
  assert.doesNotMatch(
    queries,
    /\.select\([^)]*(?:tenant_id|school_id|academic_year)[^)]*\)/s,
  );
  assert.doesNotMatch(queries, /from\("enrolments"\)/);
  assert.doesNotMatch(queries, /from\("learners"\)/);
  assert.doesNotMatch(queries, /readIdentityRowsInChunks(?:<[^>]+>)?\(\s*learnerIds/);
});

test("governed roster includes bounded school/year eligibility and assignment continuity", () => {
  assert.match(rpc, /status in \('current','completed','transferred'\)/);
  assert.match(rpc, /e\.school_id=p_school_id/);
  assert.match(rpc, /e\.academic_year=p_academic_year/);
  assert.match(rpc, /admission_number/);
  assert.match(rpc, /left join public\.sports_learner_house_assignments/);
  assert.match(rpc, /coalesce\(a\.is_locked,false\)/);
  assert.match(rpc, /assignment_source/);
  assert.match(rpc, /age_group_label/);
  assert.match(rpc, /sports_house_learner_roster/); // preserves the existing read-model contract in migration history
  assert.match(dbTest, /authenticated/);
  assert.match(dbTest, /platform_support/);
});

test("Sports & Houses staff identity hydration is bundled into the governed staff roster RPC", () => {
  assert.match(queries, /rpc\("get_sports_house_staff_roster"/);
  assert.doesNotMatch(queries, /readIdentityRowsInChunks<StaffIdentityRow>/);
  assert.doesNotMatch(queries, /from\("staff_members"\)/);
  assert.doesNotMatch(queries, /staff identities read failed/);
  assert.doesNotMatch(queries, /learner identities read failed/);
  assert.doesNotMatch(queries, /learnerIds/);
});

test("Sports & Houses authority boundaries and mutation semantics remain intact", () => {
  for (const role of ["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]) assert.match(page, new RegExp(role));
  assert.match(page, /platform_support/);
  assert.match(actions, /platform_support/);
  assert.match(phase2, /Platform Support cannot operate school balancing/);
  assert.match(phase2, /another school manager cannot cross the school balancing boundary/);
});
