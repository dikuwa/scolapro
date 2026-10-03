import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("src/features/timetable/timetable-workspace.tsx", "utf8");
const workspaceServer = readFileSync("src/features/timetable/server/workspace.ts", "utf8");
const actions = readFileSync("src/features/timetable/server/actions.ts", "utf8");
const searchable = readFileSync("src/components/ui/searchable-select.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20261003120000_timetable_bulk_setup.sql", "utf8");

test("subject offerings use searchable in-menu multi-select for subjects and grades", () => {
  assert.match(workspace, /label="Subjects"/);
  assert.match(workspace, /label="Grades"/);
  assert.match(workspace, /multiple\s+selectedValues=\{offeringSubjectIds\}/);
  assert.match(workspace, /multiple\s+selectedValues=\{offeringGradeIds\}/);
  assert.match(workspace, /Bulk offering preview/);
  assert.match(workspace, /subjectIds" value=\{JSON\.stringify\(offeringSubjectIds\)\}/);
  assert.match(workspace, /gradeIds" value=\{JSON\.stringify\(offeringGradeIds\)\}/);
  assert.match(workspace, /Select all/);
  assert.match(workspace, /Clear all/);
});

test("teacher allocation bulk setup supports offerings, classes and canonical teaching groups", () => {
  assert.match(workspace, /label="Subject offerings"/);
  assert.match(workspace, /label="Register classes"/);
  assert.match(workspace, /label="Teaching groups \(optional\)"/);
  assert.match(workspace, /teachingGroupIds" value=\{JSON\.stringify\(allocationTeachingGroupIds\)\}/);
  assert.match(workspace, /never replace the required register-class timetable scope/);
  assert.match(workspaceServer, /teachingGroups:/);
  assert.match(workspaceServer, /from\("teaching_groups"\)/);
});

test("shared SearchableSelect keeps multiple selections inside one open menu with checkboxes", () => {
  assert.match(searchable, /multiple = false/);
  assert.match(searchable, /aria-multiselectable=\{multiple \|\| undefined\}/);
  assert.match(searchable, /onToggle\?\.\(option\.value\)/);
  assert.match(searchable, /selectedSet\.has\(option\.value\)/);
});

test("bulk writes are routed through transactional database RPCs", () => {
  assert.match(actions, /bulk_create_subject_offerings/);
  assert.match(actions, /p_subject_ids: subjectIds/);
  assert.match(actions, /p_grade_ids: gradeIds/);
  assert.match(actions, /bulk_create_teacher_allocations/);
  assert.match(actions, /p_subject_offering_ids: offeringIds/);
  assert.match(actions, /p_register_class_ids: classIds/);
  assert.match(actions, /p_teaching_group_ids: teachingGroupIds/);
  assert.doesNotMatch(actions, /for \(const subjectId of subjectIds\)/);
  assert.doesNotMatch(actions, /for \(const pair of validPairs\)/);
});

test("bulk RPCs preserve canonical stores, scope and request bounds", () => {
  assert.match(migration, /create or replace function public\.bulk_create_subject_offerings/);
  assert.match(migration, /v_requested>200/);
  assert.match(migration, /from public\.subject_offerings/);
  assert.match(migration, /perform public\.upsert_subject_offering/);
  assert.match(migration, /create or replace function public\.bulk_create_teacher_allocations/);
  assert.match(migration, /v_requested>300/);
  assert.match(migration, /public\.create_teacher_allocation_period/);
  assert.match(migration, /public\.teaching_group_allocations/);
  assert.match(migration, /app_private\.can_manage_school_members/);
});

test("existing offering combinations are skipped without silently rewriting them", () => {
  assert.match(migration, /select so\.id into v_existing_id[\s\S]*from public\.subject_offerings/);
  assert.match(migration, /if v_existing_id is not null then[\s\S]*v_existing:=v_existing\+1/);
  assert.match(migration, /never silently reactivated or rewritten/);
});

test("bulk teacher allocation reports grade mismatches, date conflicts and group-link outcomes", () => {
  assert.match(migration, /v_incompatible:=v_incompatible\+1/);
  assert.match(migration, /v_conflicts:=v_conflicts\+1/);
  assert.match(migration, /group_links_created/);
  assert.match(migration, /group_link_conflicts/);
  assert.match(migration, /groups_without_allocations/);
  assert.match(actions, /teaching-group link/);
});

test("single-record correction actions remain available", () => {
  assert.match(actions, /export async function saveOffering/);
  assert.match(actions, /export async function saveAllocation/);
  assert.match(workspace, /Bulk offering preview/);
});
