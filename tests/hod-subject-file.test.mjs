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
  assert.match(server,/row\.staff_member_id===teachingMembership\.staffMemberId/);
  assert.match(server,/teacherSubjectIds/);
  assert.match(server,/const teachingMembership=\["hod","teacher","class_teacher"\]/);
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

test("shared resources use the governed registry and subject inventory mappings stay explicit",()=>{
  assert.match(server,/getOperationalFileSharedResourceReferences/);
  assert.match(server,/Shared subject resources resolve only through the governed operational-resource registry/);
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


test("HOD-wide subject access requires a current-school staff-backed HOD membership",()=>{
  assert.match(server,/teachingMembership\.roleKey==="hod"/);
  assert.match(server,/item\.schoolId===membership\.schoolId/);
  assert.match(server,/hodResponsibilities/);
});

test("School Admin plus Teacher multi-role users resolve Subject File through the teaching membership",()=>{
  assert.match(server,/context\.currentSchoolMembership/);
  assert.match(server,/context\.memberships\.find/);
  assert.match(server,/item\.staffMemberId/);
  assert.match(server,/teachingMembership\.staffMemberId/);
  assert.doesNotMatch(server,/if \(!membership\?\.staffMemberId \|\| !\["hod","teacher","class_teacher"\]\.includes\(membership\.roleKey\)\) return null/);
});

test("HOD-owned subjects load configured offerings even without active teacher allocation",()=>{
  assert.match(server,/\.in\("subject_id",allowedSubjectIds\)/);
  assert.match(server,/subjectOfferingRows/);
});

test("schedule and preparation evidence is paged beyond the Supabase row cap",()=>{
  assert.match(server,/SUBJECT_FILE_PAGE_SIZE=1000/);
  assert.match(server,/loadAllScheduleRows/);
  assert.match(server,/loadAllPreparationRows/);
  assert.match(server,/\.range\(from,from\+SUBJECT_FILE_PAGE_SIZE-1\)/);
});


test("Subject File hierarchy resolves only from an authoritative operational template",()=>{
  assert.match(server,/resolveOperationalFileTemplate/);
  assert.match(server,/normalized==="information and communication" \? "information-communication" : null/);
  assert.match(server,/fileTypeKey==="subject"/);
  assert.match(server,/policyHierarchy:null/);
  assert.match(workspace,/No verified Subject File hierarchy/);
});

test("Subject File policy provenance and phase identity are visible",()=>{
  assert.match(server,/sourceTitle:template\.sourceTitle/);
  assert.match(server,/templateVersion:template\.templateVersion/);
  assert.match(server,/phaseLabels/);
  assert.match(workspace,/Official Subject File hierarchy/);
  assert.match(workspace,/Authoritative policy/);
});

test("Subject File keeps private teacher evidence and unproven resolvers closed",()=>{
  assert.match(server,/Private teacher documents are not broadened into the Subject File unless separately governed and submitted\./);
  assert.match(server,/A governed subject-results resolver for the required historical range is not yet proven\./);
  assert.match(server,/Room Inventory is school\/room scoped; ScolaPro does not infer subject-to-room ownership\./);
  assert.doesNotMatch(server,/teacher_professional_documents/);
});

test("Subject File hierarchy reuses canonical and shared links rather than copying records",()=>{
  assert.match(server,/canonicalSubjectFileLink/);
  assert.match(server,/\/teaching\/curriculum/);
  assert.match(server,/\/teaching\/planning/);
  assert.match(server,/sharedByItem\.get\(item\.id\)/);
  assert.doesNotMatch(server,/\.insert\(/);
  assert.doesNotMatch(server,/\.update\(/);
  assert.doesNotMatch(server,/\.delete\(/);
});
