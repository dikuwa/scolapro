import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261002143627_curriculum_time_subject_offering_reconciliation.sql",
  "utf8",
);

test("Slice 2 keeps school targets additive and legacy-safe", () => {
  assert.match(migration, /add column curriculum_time_allocation_id uuid[\s\S]*references public\.curriculum_time_allocations\(id\) on delete restrict/i);
  assert.match(migration, /add column allocation_origin text not null default 'legacy'/i);
  assert.match(migration, /'official_default'[\s\S]*'school_override'[\s\S]*'school_configured'/);
  assert.match(migration, /Existing rows are intentionally legacy/i);
  assert.doesNotMatch(migration, /update public\.subject_offerings\s+set periods_per_cycle\s*=\s*v_official_periods/i);
  assert.doesNotMatch(migration, /display_name\s*=\s*.*curriculum/i);
});

test("Slice 2 uses canonical mapping and exact-cycle resolver rather than fuzzy subject matching", () => {
  assert.match(migration, /school_subject_curriculum_mappings/);
  assert.match(migration, /curriculum_version_id/);
  assert.match(migration, /resolve_curriculum_time_allocation/);
  assert.match(migration, /timetable_cycle_mode/);
  assert.match(migration, /timetable_cycle_length/);
  assert.match(migration, /'no_subject_mapping'/);
  assert.match(migration, /'cycle_variant_missing'/);
  assert.match(migration, /'source_conflict'/);
});

test("Slice 2 reconciliation is explicit, stale-preview safe, role-scoped and audited", () => {
  assert.match(migration, /preview_subject_offering_time_allocation_reconciliation/);
  assert.match(migration, /reconcile_subject_offering_time_allocation/);
  assert.match(migration, /user_can_manage_school_settings\(auth\.uid\(\),p_school_id\)/);
  assert.match(migration, /user_can_manage_school_settings\([\s\S]*v_offering\.school_id/);
  assert.match(migration, /Reconciliation preview is stale; refresh before committing/);
  assert.match(migration, /School override reason is required/);
  assert.match(migration, /Official-default reconciliation does not rewrite the existing school target/);
  assert.match(migration, /subject_offering_allocation_reconciled/);
  assert.match(migration, /subject_offering_allocation_overridden/);
  assert.match(migration, /subject_offering_allocation_linked/);
  assert.match(migration, /curriculum_time_reconciliation_offering_id/);
  assert.match(migration, /revoke all on function public\.reconcile_subject_offering_time_allocation[\s\S]*from public,anon/);
});
