import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260922092000_guardian_directory_schoolwide_fast_path.sql", "utf8");

test("guardian page resolves school-wide authority once", () => {
  assert.match(migration, /actor_scope as materialized/);
  assert.match(migration, /where actor\.schoolwide/);
});

test("guardian page keeps scoped learner fallback", () => {
  assert.match(migration, /where not actor\.schoolwide/);
  assert.match(migration, /can_access_learner_observations/);
});
