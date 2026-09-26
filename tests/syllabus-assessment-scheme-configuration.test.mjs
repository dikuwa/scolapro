import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
const migration=await read("supabase/migrations/20260926080000_syllabus_assessment_scheme_configuration.sql");
const server=await read("src/features/assessment/server/scheme-configuration.ts");
const workspace=await read("src/features/assessment/scheme-configuration-workspace.tsx");
const page=await read("src/app/assessment/schemes/page.tsx");

test("assessment schemes remain canonical and gain curriculum provenance",()=>{
  assert.match(migration,/alter table public\.assessment_schemes/);
  assert.match(migration,/curriculum_version_id/);
  assert.doesNotMatch(migration,/assessment_schemes_v2|assessment_configuration_v2/);
});

test("extraction is candidate-only and publication requires verification",()=>{
  assert.match(migration,/assessment_scheme_candidates/);
  assert.match(migration,/Human verification is required before assessment scheme publication/);
  assert.match(workspace,/Extraction creates a candidate only/);
  assert.match(workspace,/Publication is a separate finality action/);
});

test("manual scheme configuration supports three terms and component metadata",()=>{
  assert.match(workspace,/Term 1/);
  assert.match(workspace,/Term 2/);
  assert.match(workspace,/Term 3/);
  assert.match(workspace,/Raw maximum/);
  assert.match(workspace,/Weight/);
  assert.match(workspace,/Moderation required/);
  assert.match(server,/termNumbers/);
});

test("grade level does not force exam-only capture",()=>{
  assert.match(workspace,/Grade level alone never decides whether a subject is exam-only/);
  assert.match(workspace,/Detailed assessment components/);
  assert.match(workspace,/Final-result capture/);
});

test("scheme workspace is leadership-gated and linked from assessment",()=>{
  assert.match(server,/school_admin/);
  assert.match(server,/principal/);
  assert.match(server,/deputy_principal/);
  assert.match(server,/hod/);
  assert.match(page,/getAssessmentSchemeWorkspace/);
});

test("existing mark lifecycle remains downstream of canonical schemes",()=>{
  assert.match(migration,/assessment_schemes/);
  assert.match(migration,/assessment_components/);
  assert.match(migration,/calculate_subject_result/);
  assert.doesNotMatch(migration,/create table if not exists public\.learner_marks/);
});
