import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260922090000_enrolments_broad_role_read_fast_path.sql", "utf8");

test("enrolment RLS preserves Platform Admin historical oversight", () => {
  assert.match(migration, /has_platform_role\(array\['platform_admin'\]\)/);
});

test("enrolment RLS fast path keeps broad authority statement-scoped", () => {
  assert.match(migration, /school_id = any\(\s*array\(\s*select sm\.school_id/s);
  assert.match(migration, /sm\.user_id=\(select auth\.uid\(\)\)/);
  assert.match(migration, /school_admin/);
  assert.match(migration, /social_worker/);
});

test("teacher and class-scoped reads retain the existing row authority fallback", () => {
  assert.match(migration, /else app_private\.can_read_enrolment_row/);
  assert.match(migration, /status='current'/);
  assert.match(migration, /enrolled_from<=current_date/);
});
