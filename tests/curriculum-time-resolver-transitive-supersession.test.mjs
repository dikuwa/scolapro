import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261003042000_curriculum_time_resolver_transitive_supersession.sql",
  "utf8",
);

test("resolver uses governed transitive profile supersession", () => {
  assert.match(
    migration,
    /app_private\.curriculum_time_profile_supersedes\(\s*replacement_profile\.id,\s*c\.profile_id\s*\)/,
  );
  assert.doesNotMatch(
    migration,
    /replacement_profile\.supersedes_profile_id\s*=\s*c\.profile_id/,
  );
  assert.match(migration, /replacement_profile\.effective_from_year<=p_academic_year/);
  assert.match(migration, /replacement_profile\.cycle_kind=c\.resolved_cycle_kind/);
  assert.match(migration, /replacement_profile\.cycle_length=c\.resolved_cycle_length/);
});
