import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260922091000_learners_broad_role_read_fast_path.sql", "utf8");

test("learner identity RLS builds a school-wide current learner fast path", () => {
  assert.match(migration, /from public\.enrolments e/);
  assert.match(migration, /e\.school_id = any\(/);
  assert.match(migration, /from public\.school_memberships sm/);
  assert.match(migration, /e\.status='current'/);
});

test("learner identity RLS preserves scoped fallback", () => {
  assert.match(migration, /else exists/);
  assert.match(migration, /app_private\.can_read_learner_identity/);
});
