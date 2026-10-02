import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/features/learners/server/subject-assignments.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261002043000_learner_subject_registration_counts_rpc.sql", "utf8");

test("subject-assignment overview aggregates active registrations in PostgreSQL", () => {
  assert.match(source, /db\.rpc\("get_learner_subject_registration_counts"/);
  assert.match(source, /p_school_id: membership\.schoolId/);
  assert.match(source, /p_academic_year: academicYear/);
  assert.doesNotMatch(source, /learner_subject_registrations"\)\.select\("subject_offering_id"\)[\s\S]*?limit\(10000\)/);
  assert.match(source, /Number\(row\.registration_count \?\? 0\)/);
});

test("count RPC preserves row-level authorization and returns only grouped counts", () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path=pg_catalog/i);
  assert.match(migration, /from public\.learner_subject_registrations lsr/i);
  assert.match(migration, /lsr\.status = 'active'/i);
  assert.match(migration, /group by lsr\.subject_offering_id/i);
  assert.match(migration, /count\(\*\)::bigint as registration_count/i);
  assert.match(migration, /grant execute on function public\.get_learner_subject_registration_counts\(uuid,integer\)\s+to authenticated/i);
  assert.match(migration, /revoke all on function public\.get_learner_subject_registration_counts\(uuid,integer\)\s+from public,anon/i);
});
