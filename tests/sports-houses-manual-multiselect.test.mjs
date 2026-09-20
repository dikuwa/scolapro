import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const workspace = read("src/features/sports-houses/sports-houses-workspace.tsx");
const actions = read("src/features/sports-houses/server/actions.ts");
const picker = read("src/components/ui/searchable-select.tsx");
const migration = read("supabase/migrations/20260919170000_sports_house_manual_multiselect.sql");
const dbTest = read("supabase/tests/sports_house_manual_multiselect_test.sql");

test("manual learner allocation uses the shared searchable multi-select workflow", () => {
  assert.match(workspace, /<SearchableSelect/);
  assert.match(workspace, /name="learnerIds"/);
  assert.match(workspace, /multiple/);
  assert.match(workspace, /selectedValues=\{learnerIds\}/);
  assert.match(workspace, /Assign selected/);
  assert.match(picker, /aria-multiselectable=\{multiple \|\| undefined\}/);
  assert.match(picker, /selectedValues\?: string\[\]/);
});

test("batch action remains manager-gated and delegates to the canonical assignment model", () => {
  assert.match(actions, /assignLearnersSportsHouse/);
  assert.match(actions, /getAll\("learnerIds"\)/);
  assert.match(actions, /assign_learners_sports_house/);
  assert.match(actions, /p_assignment_source: "manual"/);
});

test("batch RPC preserves scope, idempotence, and locked semantics", () => {
  assert.match(migration, /can_manage_sports\(p_school_id\)/);
  assert.match(migration, /p_academic_year/);
  assert.match(migration, /Locked learner assignment cannot be moved/);
  assert.match(migration, /for update;\s+if v_existing\.is_locked[\s\S]*?raise exception 'Locked learner assignment cannot be moved'/);
  assert.match(migration, /coalesce\(v_existing\.is_locked,false\) or p_is_locked/);
  assert.match(migration, /is_locked=\(public\.sports_learner_house_assignments\.is_locked or excluded\.is_locked\)/);
  assert.match(migration, /status='active'/);
  assert.match(dbTest, /duplicate learner selection is accepted idempotently/);
  assert.match(dbTest, /locked assignments block the whole batch/);
  assert.match(dbTest, /cross-school learner cannot be assigned/);
});
