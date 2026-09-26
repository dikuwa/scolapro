import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
const server=await read("src/features/teaching/server/subject-file.ts");
const workspace=await read("src/features/teaching/subject-file-workspace.tsx");
const route=await read("src/app/api/teaching/subject-file/inspection-pack/route.ts");
const page=await read("src/app/teaching/subject-file/page.tsx");
const teaching=await read("src/app/teaching/page.tsx");

test("HOD Subject File derives scope from effective subject responsibility",()=>{
  assert.match(server,/subject_department_responsibilities/);
  assert.match(server,/department_head_staff_assignment_id/);
  assert.match(server,/effective\(today,row\.effective_from,row\.effective_to\)/);
  assert.match(server,/hodSubjectIds/);
});

test("teachers see only subjects from their current allocations",()=>{
  assert.match(server,/teacher_allocations/);
  assert.match(server,/row\.staff_member_id===membership\.staffMemberId/);
  assert.match(server,/teacherSubjectIds/);
  assert.match(server,/\["hod","teacher","class_teacher"\]/);
});

test("subject dossier aggregates canonical records without a second file store",()=>{
  assert.match(server,/pacing_plans/);
  assert.match(server,/teaching_schedule_items/);
  assert.match(server,/lesson_preparations/);
  assert.match(server,/assessment_schemes/);
  assert.match(server,/assessment_instances/);
  assert.doesNotMatch(server,/teacher_professional_documents/);
  assert.doesNotMatch(server,/insert\(/i);
});

test("system evidence links open authoritative source modules",()=>{
  assert.match(server,/\/teaching\/curriculum/);
  assert.match(server,/\/timetable/);
  assert.match(server,/\/teaching\/planning/);
  assert.match(server,/\/teaching\/preparation/);
  assert.match(server,/\/assessment/);
  assert.match(server,/\/class-lists/);
  assert.match(workspace,/does not create mutable copies/);
});

test("unsupported department resources and subject inventory mappings stay explicit",()=>{
  assert.match(server,/Department minutes\/circulars\/resources have no canonical subject-linked repository model yet/);
  assert.match(server,/no subject-to-room ownership is inferred/);
});

test("inspection pack is print-ready and read-only",()=>{
  assert.match(route,/Print \/ Save PDF/);
  assert.match(route,/read-only dossier/);
  assert.match(route,/getSubjectFileRow/);
  assert.match(route,/cache-control/);
  assert.doesNotMatch(route,/insert\(|update\(|delete\(/i);
});

test("teaching route exposes Subject File only to staff-backed teaching roles",()=>{
  assert.match(teaching,/\/teaching\/subject-file/);
  assert.match(teaching,/membership\.staffMemberId/);
  assert.match(page,/getGovernedAcademicYear/);
  assert.match(page,/getSubjectFileWorkspace/);
});

test("workspace retains responsive source primitives",()=>{
  assert.match(workspace,/sm:flex-row/);
  assert.match(workspace,/sm:grid-cols-2/);
  assert.match(workspace,/lg:grid-cols-4/);
  assert.match(workspace,/xl:grid-cols-3/);
});
