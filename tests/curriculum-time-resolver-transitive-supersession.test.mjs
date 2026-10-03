import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261003121500_curriculum_time_resolver_transitive_supersession.sql", "utf8");
const pg = readFileSync("supabase/tests/curriculum_time_resolver_transitive_supersession_test.sql", "utf8");

test("resolver uses the governed recursive profile supersession helper", () => {
  assert.match(
    migration,
    /app_private\.curriculum_time_profile_supersedes\(replacement_profile\.id,c\.profile_id\)/
  );
  assert.doesNotMatch(
    migration,
    /replacement_profile\.supersedes_profile_id=c\.profile_id/
  );
});

test("resolver keeps exact-cycle and allocation-level supersession semantics", () => {
  assert.match(migration, /replacement\.supersedes_allocation_id=c\.id/);
  assert.match(migration, /replacement_profile\.cycle_kind=c\.resolved_cycle_kind/);
  assert.match(migration, /replacement_profile\.cycle_length=c\.resolved_cycle_length/);
  assert.match(migration, /replacement_profile\.effective_from_year<=p_academic_year/);
  assert.match(migration, /replacement_profile\.effective_to_year>=p_academic_year/);
});

test("pgTAP covers the gap where the middle profile is outside the requested year", () => {
  assert.match(pg, /2027,2027/);
  assert.match(pg, /2028,2030/);
  assert.match(pg, /2028 resolver suppresses A through transitive A <- B <- C/);
  assert.match(pg, /2027 resolver still selects the direct B successor/);
});
