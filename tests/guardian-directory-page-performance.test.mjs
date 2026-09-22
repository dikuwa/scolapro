import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260922093000_guardian_directory_page_performance.sql",
  "utf8",
);

test("guardian page delays contact hydration until after pagination", () => {
  const paged = migration.indexOf("paged as materialized");
  const mobile = migration.indexOf("as primary_mobile");
  assert.ok(paged >= 0);
  assert.ok(mobile > paged);
  assert.match(migration, /count\(\*\) over\(\)/);
});

test("guardian page keeps scoped authorization and search fields", () => {
  assert.match(migration, /can_access_learner_observations/);
  assert.match(migration, /guardian_contacts/);
  assert.match(migration, /learner_name/);
  assert.match(migration, /admission_number/);
  assert.match(migration, /grade_name/);
  assert.match(migration, /class_name/);
});
