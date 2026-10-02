import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registry = readFileSync(
  "supabase/migrations/20261002100935_curriculum_time_allocation_registry.sql",
  "utf8",
);
test("time allocation registry models exact periods per cycle without a parallel subject catalogue", () => {
  assert.match(registry, /create table public\.curriculum_time_profiles/i);
  assert.match(registry, /create table public\.curriculum_time_allocations/i);
  assert.match(registry, /create table public\.curriculum_time_slot_subjects/i);
  assert.match(registry, /create table public\.curriculum_scheduling_constraints/i);
  assert.match(registry, /periods_per_cycle smallint not null/i);
  assert.match(registry, /cycle_kind text not null/i);
  assert.match(registry, /cycle_length smallint not null/i);
  assert.doesNotMatch(registry, /periods_per_week/i);
  assert.doesNotMatch(registry, /create table public\.(?:subjects_v2|curriculum_subject_catalogue)/i);
});

test("official allocation resolver uses exact cycle variants and explicit supersession", () => {
  assert.match(registry, /resolve_curriculum_time_allocation/);
  assert.match(registry, /resolved_cycle_kind=p_cycle_kind/);
  assert.match(registry, /resolved_cycle_length=p_cycle_length/);
  assert.match(registry, /replacement\.supersedes_allocation_id=c\.id/);
  assert.match(registry, /'cycle_variant_missing'/);
  assert.match(registry, /'source_conflict'/);
  assert.doesNotMatch(registry, /p_cycle_length\s*[*/+-]\s*/);
  assert.doesNotMatch(registry, /period_minutes\s*[*/]\s*/);
});

test("national registry publication is draft-first, source-gated and final", () => {
  assert.match(registry, /Curriculum time profiles must begin in draft state/);
  assert.match(registry, /Curriculum time profile must be verified before publication/);
  assert.match(registry, /Curriculum time allocations must begin in draft state/);
  assert.match(registry, /Curriculum time allocation must be verified before publication/);
  assert.match(registry, /Curriculum scheduling constraints must begin in draft state/);
  assert.match(registry, /Curriculum scheduling constraint must be verified before publication/);
  assert.match(registry, /verified source with URL, checksum and provenance/);
  assert.match(registry, /Only draft curriculum time profiles may be deleted/);
  assert.match(registry, /Only draft curriculum time allocations may be deleted/);
  assert.match(registry, /Only draft curriculum scheduling constraints may be deleted/);
});
