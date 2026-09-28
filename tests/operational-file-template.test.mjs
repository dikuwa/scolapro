import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
const migration=await read("supabase/migrations/20260928184500_operational_file_template_foundation.sql");
const model=await read("src/features/teaching/server/operational-file-templates.ts");
const uploads=await read("supabase/migrations/20260918210000_teacher_professional_documents.sql");
const review=await read("supabase/migrations/20260918231000_teacher_professional_document_review.sql");
const subjectFile=await read("src/features/teaching/server/subject-file.ts");

test("Issue #855 is additive and reuses existing Teaching Files foundations",()=>{
  assert.match(migration,/operational_file_templates/);
  assert.doesNotMatch(migration,/documents_v2|teacher_professional_documents_v2/i);
  assert.match(uploads,/teacher_professional_documents/);
  assert.match(review,/teacher_professional_document_review_submissions/);
  assert.match(subjectFile,/pacing_plans/);
});

test("all five policy file types are recognized in deterministic order",()=>{
  for(const key of ["preparation","administration","resource","subject","question_paper"]){
    assert.match(migration,new RegExp(`'${key}'`));
    assert.match(model,new RegExp(`"${key}"`));
  }
  const positions=["'preparation'","'administration'","'resource'","'subject'","'question_paper'"]
    .map((token)=>migration.indexOf(token));
  assert.deepEqual([...positions].sort((a,b)=>a-b),positions);
});

test("Information & Communication applicability is explicit and subject-specific",()=>{
  assert.match(migration,/information-communication-grades-4-12/);
  assert.match(migration,/Information & Communication/);
  assert.match(migration,/grades-4-7/);
  assert.match(migration,/grades-8-9/);
  assert.match(migration,/grades-10-12/);
  assert.match(migration,/source_scope.*Information & Communication Grades 4-12 only/);
});

test("resolver values are metadata-only and no resolver execution is implemented",()=>{
  for(const resolver of ["timetable","curriculum","scheme","lesson_preparation","class_list","assessment","calendar","staff_profile","results","room_inventory","shared_resource","teacher_document","external_link","manual"]){
    assert.match(migration,new RegExp(`'${resolver}'`));
  }
  assert.match(migration,/metadata_only/);
  assert.doesNotMatch(model,/switch\s*\(.*resolver|resolveTimetable|resolveCurriculum|resolveScheme/);
});

test("Question Paper is recognized without fabricated internal hierarchy",()=>{
  assert.match(migration,/Question Paper File/);
  assert.match(migration,/hierarchy.*not_defined_by_supplied_source/);
  const sectionSeed=migration.match(/insert into public\.operational_file_template_sections[\s\S]*?;\n\ninsert into public\.operational_file_template_items/)?.[0] ?? "";
  assert.doesNotMatch(sectionSeed,/85510000-0000-4000-8000-000000000005/);
  const questionPaperSections=[...sectionSeed.matchAll(/\('(?:[^']|'')*','([^']+)'/g)]
    .filter(([,fileTypeId])=>fileTypeId==="85510000-0000-4000-8000-000000000005");
  assert.equal(questionPaperSections.length,0);
});

test("template reads preserve deterministic file, section and item ordering",()=>{
  assert.match(model,/fileTypes = \[\.\.\.\(row\.file_types/);
  assert.match(model,/a\.sequence_number - b\.sequence_number/);
  assert.match(model,/sections: \[\.\.\.\(fileType\.sections/);
  assert.match(model,/items: \[\.\.\.\(section\.items/);
});

test("active resolution and historical version lookup are separate read paths",()=>{
  assert.match(migration,/resolve_operational_file_template/);
  assert.match(migration,/p_effective_on/);
  assert.match(migration,/get_operational_file_template_version/);
  assert.match(model,/resolveOperationalFileTemplate/);
  assert.match(model,/getOperationalFileTemplateVersion/);
});

test("teachers cannot mutate deployment-owned templates and platform support is separated from school reads",()=>{
  assert.doesNotMatch(migration,/grant (insert|update|delete|all).*operational_file_/i);
  assert.match(migration,/deployment-managed and immutable/);
  assert.match(migration,/platform_admin','platform_support/);
});

test("existing professional evidence is not backfilled or rewritten",()=>{
  assert.doesNotMatch(migration,/alter table public\.teacher_professional_documents/i);
  assert.doesNotMatch(migration,/update public\.teacher_professional_documents/i);
  assert.doesNotMatch(migration,/teacher_professional_document_review_submissions.*update/i);
  assert.doesNotMatch(migration,/category_label.*operational/i);
});

test("source-grounded I&C hierarchy is represented without generalizing it",()=>{
  for(const label of [
    "Control sheet","Table of contents","Teacher''s personal timetable",
    "Syllabus for all subjects taught this year","Schemes of work for all subjects taught this year",
    "Up-to-date daily/weekly written lesson preparation","Teacher''s commitment to PAAI",
    "Code of Conduct for Teachers","School internal Subject Policy","Teacher''s Manual / Guide",
    "Worksheets","Projects","Assignments","Topic tasks","Practical investigations","Artefacts",
    "Marking criteria","Course material","Workshop handouts","Learning support information",
    "National Curriculum","National Subject Policy Guide","Completed PAAI","Subject teacher information",
    "Workshop attendance record"
  ]) assert.ok(migration.includes(label), `missing source item: ${label}`);
  assert.ok(
    migration.includes("'promotion-marks-three-years','Promotion marks for previous three years + evaluation',160,'results'"),
    "promotion marks source item must remain exact and ordered"
  );
  assert.match(migration,/National Subject Policy Guide for Information and Communication, Grades 4-12 \\(NIED, 2021\\)/);
});

test("grade RPC contract uses integer consistently and model rejects non-integer grades",()=>{
  assert.match(migration,/p_grade integer/);
  assert.match(migration,/p_grade\s+integer\s*,/);
  assert.ok(migration.includes("public.resolve_operational_file_template(text,integer,date)"));
  assert.match(model,/Number\\.isInteger\\(input\\.grade\\)/);
  assert.doesNotMatch(model,/mapTemplate\\(row: any\\)/);
});
