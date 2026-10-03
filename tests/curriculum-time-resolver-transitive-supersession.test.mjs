import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261003171500_curriculum_time_resolver_transitive_supersession.sql",
  "utf8",
);
const pg = readFileSync(
  "supabase/tests/curriculum_time_resolver_transitive_supersession_test.sql",
  "utf8",
);

test("resolver uses governed transitive profile supersession closure", () => {
  assert.match(migration, /app_private\.curriculum_time_profile_supersedes\(\s*replacement_profile\.id,\s*c\.profile_id\s*\)/);
  assert.match(migration, /replacement_profile\.effective_from_year<=p_academic_year/);
  assert.match(migration, /replacement_profile\.phase_code=c\.resolved_phase_code/);
  assert.match(migration, /replacement_profile\.cycle_kind=c\.resolved_cycle_kind/);
  assert.match(migration, /replacement_profile\.cycle_length=c\.resolved_cycle_length/);
  assert.doesNotMatch(migration, /replacement_profile\.supersedes_profile_id=c\.profile_id/);
});

test("resolver preserves canonical exact-cycle and allocation-level semantics", () => {
  assert.match(migration, /resolved_cycle_kind=p_cycle_kind/);
  assert.match(migration, /resolved_cycle_length=p_cycle_length/);
  assert.match(migration, /replacement\.supersedes_allocation_id=c\.id/);
  assert.match(migration, /p_curriculum_version_id/);
  assert.match(migration, /source_conflict/);
  assert.match(migration, /cycle_variant_missing/);
});

test("focused pgTAP covers the intermediate-out-of-year transitive regression", () => {
  assert.match(pg, /2027,2027,'draft'/);
  assert.match(pg, /2026,2028,'draft'/);
  assert.match(pg, /terminal profile C suppresses transitive predecessor A in 2026/);
  assert.match(pg, /resolved:fd160000-0000-4000-8000-000000000003:7/);
});
