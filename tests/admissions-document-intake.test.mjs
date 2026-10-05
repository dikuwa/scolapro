import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261003190000_document_intake_admissions_staging.sql","utf8");
const actions = readFileSync("src/features/admissions/server/actions.ts","utf8");
const page = readFileSync("src/app/school/admissions/page.tsx","utf8");
const printPage = readFileSync("src/app/school/admissions/application-form/page.tsx","utf8");
const printDocument = readFileSync("src/features/admissions/server/render-admission-application-pdf.ts","utf8");
const navigation = readFileSync("src/components/shell/navigation.tsx","utf8");
const candidateForm = readFileSync("src/features/admissions/admission-candidate-form.tsx","utf8");

test("shared intake is staged and cannot directly mutate authoritative learner domains", () => {
  assert.match(migration,/document_intake_jobs/);
  assert.match(migration,/candidate_payload/);
  assert.match(migration,/field_confidence/);
  assert.match(migration,/match_candidates/);
  assert.match(migration,/committed_entity_id/);
  const commitBody = migration.slice(migration.indexOf("create or replace function public.commit_admission_intake_job"),migration.indexOf("-- Existing-identity reuse"));
  assert.doesNotMatch(commitBody,/insert into public\.learners/i);
  assert.doesNotMatch(commitBody,/insert into public\.enrolments/i);
  assert.match(commitBody,/insert into public\.admission_applications/i);
});

test("private source artifacts inherit admissions authority", () => {
  assert.match(migration,/document-intake-private/);
  assert.match(migration,/public=false/);
  assert.match(migration,/can_access_document_intake_object_policy/);
  assert.match(migration,/can_manage_enrolment_workflow/);
  assert.match(migration,/10 MB|10485760/);
});

test("admissions intake supports human correction and explicit identity match review", () => {
  assert.match(migration,/save_admission_intake_candidate/);
  assert.match(migration,/review_admission_intake_candidate/);
  assert.match(migration,/possible_match/);
  assert.match(migration,/use_existing_learner/);
  assert.match(migration,/Selected learner is not a reviewed intake match/);
  assert.match(migration,/reused_existing_learner/);
  assert.match(migration,/when v_job\.source_kind='online_form' then 'public_form'/);
  assert.match(migration,/when v_job\.source_kind='structured_import' then 'import'/);
  assert.match(migration,/create or replace function public\.enrol_accepted_admission[\s\S]*set search_path=pg_catalog,public,app_private/);
});

test("server actions upload source artifacts but commit only through governed RPCs", () => {
  assert.match(actions,/document-intake-private/);
  assert.match(actions,/register_document_intake_artifact/);
  assert.match(actions,/save_admission_intake_candidate/);
  assert.match(actions,/commit_admission_intake_job/);
  assert.doesNotMatch(actions,/\.from\("learners"\)\.insert/);
  assert.doesNotMatch(actions,/\.from\("enrolments"\)\.insert/);
  assert.doesNotMatch(actions,/\.from\("guardian_profiles"\)\.insert/);
});

test("admissions workspace is summary-first staged review with source provenance", () => {
  assert.match(page,/Admissions & document intake/);
  assert.match(page,/href="\/school\/admissions\/application-form"/);
  assert.doesNotMatch(page,/href="\/school\/admissions\/application-form"[^>]*target="_blank"/);
  assert.match(page,/Scan \/ upload paper application/);
  assert.match(page,/Online equivalent/);
  assert.match(page,/Intake queue/);
  assert.match(page,/Source \/ provenance/);
  assert.match(page,/Extracted \/ corrected candidate/);
  assert.match(page,/Identity match review/);
  assert.match(page,/Commit to admissions queue/);
  assert.match(page,/does not enrol the learner/);
  assert.match(candidateForm,/useState\(candidate\.requested_grade_id \?\? ""\)/);
  assert.match(candidateForm,/onChange=\{setRequestedGradeId\}/);
  assert.match(candidateForm,/onClear=\{\(\) => setRequestedGradeId\(""\)\}/);
});

test("printable simple school application exists without overloading later administration", () => {
  assert.match(printPage,/Learner Application Form/);
  assert.match(printPage,/OfficialDocumentActions/);
  assert.match(printDocument,/Guardian 1/);
  assert.match(printDocument,/Guardian 2/);
  assert.match(printDocument,/Document Checklist/);
  assert.match(printDocument,/Admission and enrolment are subject to school review/);
});

test("admissions navigation is limited to enrolment workflow leaders", () => {
  assert.match(navigation,/key: "admissions"/);
  assert.match(navigation,/school_admin:[^\n]*"admissions"/);
  assert.match(navigation,/principal:[^\n]*"admissions"/);
  assert.match(navigation,/deputy_principal:[^\n]*"admissions"/);
  assert.doesNotMatch(navigation,/teacher:[^\n]*"admissions"/);
});
