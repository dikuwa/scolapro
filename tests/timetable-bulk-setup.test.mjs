import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("src/features/timetable/timetable-workspace.tsx", "utf8");
const actions = readFileSync("src/features/timetable/server/actions.ts", "utf8");
const searchable = readFileSync("src/components/ui/searchable-select.tsx", "utf8");

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

test("teacher allocations support multiple offerings and multiple matching classes with one teacher", () => {
  assert.match(workspace, /label="Subject offerings"/);
  assert.match(workspace, /label="Register classes"/);
  assert.match(workspace, /multiple\s+selectedValues=\{allocationOfferingIds\}/);
  assert.match(workspace, /multiple\s+selectedValues=\{allocationClassIds\}/);
  assert.match(workspace, /Select all matching/);
  assert.match(workspace, /Allocation preview/);
  assert.match(workspace, /offering\.gradeId === registerClass\.gradeId/);
  assert.match(workspace, /name="staffId"/);
});

test("shared SearchableSelect keeps multiple selections inside one open menu with checkboxes", () => {
  assert.match(searchable, /multiple = false/);
  assert.match(searchable, /aria-multiselectable=\{multiple \|\| undefined\}/);
  assert.match(searchable, /onToggle\?\.\(option\.value\)/);
  assert.match(searchable, /selectedSet\.has\(option\.value\)/);
  assert.match(searchable, /requestAnimationFrame\(\(\) => inputRef\.current\?\.focus\(\)\)/);
});

test("bulk offering action validates scope, bounds combinations and skips active duplicates", () => {
  assert.match(actions, /export async function saveOfferingsBulk/);
  assert.match(actions, /requested > 200/);
  assert.match(actions, /eq\("status", "active"\).*in\("subject_id", subjectIds\).*in\("grade_id", gradeIds\)/s);
  assert.match(actions, /existing combination/);
  assert.match(actions, /bulk_create_subject_offerings/);
  assert.match(actions, /p_subject_ids: subjectIds/);
  assert.match(actions, /p_grade_ids: gradeIds/);
  assert.match(actions, /canManageSchool\(parsed\.data\.schoolId\)/);
});

test("bulk allocation action creates only grade-compatible pairs and reports duplicates or conflicts", () => {
  assert.match(actions, /export async function saveAllocationsBulk/);
  assert.match(actions, /offeringIds\.length \* classIds\.length > 300/);
  assert.match(actions, /offerings\.get\(offeringId\) !== classes\.get\(classId\)/);
  assert.match(actions, /gradeMismatches \+= 1/);
  assert.match(actions, /bulk_create_teacher_allocations/);
  assert.match(actions, /p_subject_offering_ids: offeringIds/);
  assert.match(actions, /p_register_class_ids: classIds/);
  assert.match(actions, /exact existing allocation/);
  assert.match(actions, /different end dates/);
  assert.match(actions, /canManageSchool\(parsed\.data\.schoolId\)/);
});

test("single-record correction action remains available for existing offering edits", () => {
  assert.match(actions, /export async function saveOffering/);
  assert.match(actions, /export async function saveAllocation/);
  assert.match(workspace, /Save offering|Bulk offering preview/);
});
