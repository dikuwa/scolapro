import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const sql = readFileSync(new URL('../supabase/migrations/20261122160000_library_grade_booklists.sql', import.meta.url), 'utf8');
test('booklist table binds grade and title to one tenant/school', () => {
  assert.match(sql, /unique\(school_id, grade_id, title_id\)/);
  for (const field of ['grade_id', 'title_id']) assert.match(sql, new RegExp(`enforce_parent_scope\\('${field}'`));
  assert.match(sql, /copies_per_learner between 1 and 10/);
});
test('booklist RLS denies anonymous writes and makes authorization explicit', () => {
  assert.match(sql, /alter table public\.learning_resource_booklist_items enable row level security/);
  assert.match(sql, /can_view_current_school_ltsm\(school_id\)/);
  assert.match(sql, /can_manage_ltsm\(school_id\)/);
  assert.match(sql, /created_by_user_id = auth\.uid\(\)/);
  assert.doesNotMatch(sql, /grant .* to anon;/i);
  assert.doesNotMatch(sql, /for delete to authenticated/i);
});
test('every booklist edit is audited with actor and immutable identity', () => {
  assert.match(sql, /create table public\.learning_resource_booklist_changes/);
  assert.match(sql, /create trigger learning_resource_booklist_audit/);
  assert.match(sql, /new\.grade_id is distinct from old\.grade_id/);
  assert.match(sql, /new\.title_id is distinct from old\.title_id/);
  assert.match(sql, /auth\.uid\(\)/);
});
