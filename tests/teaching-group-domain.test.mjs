import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const migration = source("supabase/migrations/20260922140000_teaching_group_foundation.sql");
const resolver = source("src/features/academics/server/teaching-groups.ts");

test("Teaching Group is one canonical cohort domain, not module-specific group stores", () => {
  for (const table of ["teaching_groups", "teaching_group_memberships", "teaching_group_allocations"]) assert.match(migration, new RegExp(`create table public\\.${table}`));
  for (const competing of ["timetable_groups", "assessment_groups", "attendance_groups", "class_list_groups"]) assert.doesNotMatch(migration, new RegExp(competing));
  assert.match(migration, /subject_offering_id uuid not null references public\.subject_offerings/);
  assert.match(migration, /learner_subject_registrations/);
  assert.match(migration, /effective_from date/);
  assert.match(migration, /created_by_user_id uuid/);
});

test("Teaching Group scope, membership provenance and allocation links are governed", () => {
  assert.match(migration, /enforce_teaching_group_scope_integrity/);
  assert.match(migration, /school does not belong to tenant|scope does not match school/);
  assert.match(migration, /requires a matching learner subject registration/);
  assert.match(migration, /Teaching group allocation scope mismatch/);
  assert.match(migration, /has_school_access\(school_id\)/);
  assert.match(migration, /can_manage_school_members\(school_id\)/);
  assert.match(migration, /revoke delete/);
});

test("resolvers are the canonical consumer boundary and safe backfill is registration-based", () => {
  for (const fn of ["resolve_teaching_groups", "resolve_teaching_group_members", "resolve_teaching_group_allocations"]) assert.match(migration, new RegExp(`function public\\.${fn}`));
  assert.match(resolver, /resolve_teaching_groups/);
  assert.match(resolver, /resolve_teaching_group_members/);
  assert.match(migration, /where lsr\.status='active'/);
  assert.match(migration, /e\.register_class_id is not null/);
  assert.doesNotMatch(migration, /teacher_allocations ta[\s\S]{0,300}insert into public\.teaching_groups/);
});

test("history remains interpretable and current-state filters are explicit", () => {
  assert.match(migration, /effective_to date/);
  assert.match(migration, /tg\.effective_from<=current_date/);
  assert.match(migration, /tgm\.effective_from<=coalesce\(p_reference_date,current_date\)/);
  assert.match(migration, /source text not null/);
});
