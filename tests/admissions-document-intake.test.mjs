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
const decisionEditor = readFileSync("src/features/admissions/admission-decision-editor.tsx","utf8");
const decisionRevisionMigration = readFileSync("supabase/migrations/20261124043000_admission_same_status_decision_note_revision.sql","utf8");
const decisionRevisionPgTap = readFileSync("supabase/tests/admission_same_status_decision_note_revision_test.sql","utf8");

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

test("admissions reviewer can persist and revise notes without direct table writes", () => {
  assert.match(decisionEditor,/name="decisionNote"/);
  assert.match(decisionEditor,/name="status"/);
  assert.match(decisionEditor,/currentNote \?\? ""/);
  assert.match(decisionEditor,/setNote\(currentNote \?\? ""\)/);
  assert.match(decisionEditor,/type="button" onClick=\{onCancel\} disabled=\{pending\}/);
  assert.match(decisionEditor,/maxLength=\{1000\}/);
  assert.match(decisionEditor,/action=\{decideAdmissionApplication\}/);
  assert.match(actions,/formData\.get\("decisionNote"\)/);
  assert.match(actions,/note\.length > 1000/);
  assert.match(actions,/p_decision_note: note \|\| null/);
  assert.match(actions,/supabase\.rpc\("decide_admission_application_checked"/);
  assert.match(actions,/p_expected_reviewed_at: expectedReviewedAt \|\| null/);
  assert.match(decisionEditor,/name="expectedDecisionNote"/);
  assert.match(decisionEditor,/name="expectedReviewedAt"/);
  assert.match(decisionEditor,/useFormStatus\(\)/);
  assert.match(decisionEditor,/disabled=\{pending \|\| !status\}/);
  assert.match(actions,/revision=\$\{Date\.now\(\)\}/);
  assert.match(page,/AdmissionDecisionEditor/);
  assert.match(page,/currentNote=\{application\.decision_note\}/);
  assert.match(page,/key=\{.*application\.reviewed_at/);
  assert.match(page,/application\.reviewed_at/);
  assert.doesNotMatch(decisionEditor,/\.from\("admission_applications"\)/);
  assert.doesNotMatch(page,/\["accepted","waitlisted","declined"\]\.map/);
});

test("same-status note-only revisions retain original reviewer provenance and audited edit history", () => {
  assert.match(decisionRevisionMigration,/create or replace function public\.decide_admission_application/);
  assert.match(decisionRevisionMigration,/v_application\.status is distinct from p_status/);
  assert.match(decisionRevisionMigration,/else v_application\.reviewed_by_user_id end/);
  assert.match(decisionRevisionMigration,/else v_application\.reviewed_at end/);
  assert.match(decisionRevisionMigration,/'note_revision',v_application\.status is not distinct from p_status/);
  assert.match(decisionRevisionMigration,/char_length\(coalesce\(p_decision_note,''\)\) > 1000/);
  assert.match(decisionRevisionPgTap,/select plan\(18\);/);
  assert.match(decisionRevisionPgTap,/same-status reviewer note revision is allowed/);
  assert.match(decisionRevisionPgTap,/clearing an existing note without changing decision is allowed/);
  assert.match(decisionRevisionPgTap,/direct attempted reviewer forgery remains forbidden/);
  assert.match(decisionRevisionPgTap,/unassigned outsider cannot revise school admission decision/);
  assert.match(decisionRevisionMigration,/create or replace function public\.decide_admission_application_checked/);
  assert.match(decisionRevisionMigration,/for update;/);
  assert.match(decisionRevisionMigration,/Admission decision changed; reload before saving/);
  assert.match(decisionRevisionPgTap,/stale editor cannot overwrite another reviewer note/);
});

test("accepted enrolment is an explicit school-admin-only governed transition", () => {
  assert.match(page, /canEnrol && application\.status === "accepted"/);
  assert.match(page, /AcceptedAdmissionEnrolment/);
  assert.match(page, /requestedGradeId=\{application\.requested_grade_id\}/);
  assert.match(page, /registerClasses=\{workspace\.enrolmentClasses\}/);
  assert.match(admissionsQueries, /\.from\("register_classes"\)/);
  const scope = admissionsQueries.slice(admissionsQueries.indexOf('const result = await supabase\n      .from("register_classes")'), admissionsQueries.indexOf('if (result.error)'));
  assert.match(scope, /\.eq\("school_id", schoolId\)/);
  assert.match(scope, /\.in\("academic_year", years\)/);
  assert.match(scope, /\.in\("grade_id", gradeIds\)/);
  assert.match(enrolmentEditor, /item\.academic_year === academicYear && item\.grade_id === requestedGradeId/);
  assert.match(enrolmentEditor, /name="registerClassId"/);
  assert.match(enrolmentEditor, /checked=\{confirmed\}/);
  assert.match(enrolmentEditor, /canSubmit=\{Boolean\(classId && enrolledFrom && dateCommitted && confirmed\)\}/);
  assert.match(enrolmentEditor, /onDraftValidityChange=\{setDateCommitted\}/);
  assert.match(dateField, /onDraftValidityChange\?\.\(false\)/);
  assert.match(dateField, /onDraftValidityChange\?\.\(true\)/);
  assert.match(enrolmentEditor, /disabled=\{pending \|\| !canSubmit\}/);
  assert.match(enrolmentEditor, /onClick=\{onCancel\} disabled=\{pending\}/);
  assert.match(enrolmentEditor, /onCancel=\{reset\}/);
  assert.match(enrolmentEditor, /name="enrolledFrom" value=\{enrolledFrom\}/);
  assert.match(enrolmentEditor, /name=\{\`enrolledFrom-\$\{applicationId\}\`\}/);
  assert.match(enrolmentEditor, /!reuseExistingLearner \? \(/);
  assert.match(actions, /item\.roleKey === "school_admin"/);
  assert.match(actions, /application\.status !== "accepted"/);
  assert.match(actions, /\.eq\("school_id", membership\.schoolId\)/);
  assert.match(actions, /\.eq\("academic_year", application\.academic_year\)/);
  assert.match(actions, /\.eq\("grade_id", application\.requested_grade_id\)/);
  assert.match(actions, /supabase\.rpc\("enrol_accepted_admission"/);
  assert.doesNotMatch(enrolmentEditor, /\.from\("learners"\)/);
  assert.doesNotMatch(enrolmentEditor, /\.from\("enrolments"\)/);
});

test("same-status note-only revisions retain original reviewer provenance and audited edit history", () => {
  assert.match(decisionRevisionMigration,/create or replace function public\.decide_admission_application/);
  assert.match(decisionRevisionMigration,/v_application\.status is distinct from p_status/);
  assert.match(decisionRevisionMigration,/else v_application\.reviewed_by_user_id end/);
  assert.match(decisionRevisionMigration,/else v_application\.reviewed_at end/);
  assert.match(decisionRevisionMigration,/'note_revision',v_application\.status is not distinct from p_status/);
  assert.match(decisionRevisionMigration,/char_length\(coalesce\(p_decision_note,''\)\) > 1000/);
  assert.match(decisionRevisionPgTap,/select plan\(14\);/);
  assert.match(decisionRevisionPgTap,/same-status reviewer note revision is allowed/);
  assert.match(decisionRevisionPgTap,/clearing an existing note without changing decision is allowed/);
  assert.match(decisionRevisionPgTap,/direct attempted reviewer forgery remains forbidden/);
  assert.match(decisionRevisionPgTap,/unassigned outsider cannot revise school admission decision/);
});

test("historical intake grade choices are derived from the selected same-school job year", () => {
  const gradeQuery = queries.slice(queries.indexOf("const gradesResult = await supabase"), queries.indexOf("if (gradesResult.error)"));
  assert.match(gradeQuery, /\.from\("grades"\)/);
  assert.match(gradeQuery, /\.eq\("school_id", schoolId\)/);
  assert.match(queries, /const selectedJob = jobs\.find\(\(job\) => job\.id === selectedJobId\) \?\? null/);
  assert.match(queries, /const reviewAcademicYear = selectedJob\?\.academic_year \?\? academicYear/);
  assert.match(gradeQuery, /\.eq\("academic_year", reviewAcademicYear\)/);
  assert.ok(queries.indexOf("const selectedJob = jobs.find") < queries.indexOf('eq("academic_year", reviewAcademicYear)'));
  assert.match(queries, /reviewAcademicYear,/);

  assert.match(page, /academicYear=\{workspace\.reviewAcademicYear\}/);
  assert.match(page, /item\.academic_year/);
  assert.match(page, /job\.academic_year/);
  assert.match(page, /application\.academic_year/);
  assert.match(candidateForm, /label=\{`Intended grade · \$\{academicYear\}`\}/);
});

test("same-status note-only revisions retain original reviewer provenance and audited edit history", () => {
  assert.match(decisionRevisionMigration,/create or replace function public\.decide_admission_application/);
  assert.match(decisionRevisionMigration,/v_application\.status is distinct from p_status/);
  assert.match(decisionRevisionMigration,/else v_application\.reviewed_by_user_id end/);
  assert.match(decisionRevisionMigration,/else v_application\.reviewed_at end/);
  assert.match(decisionRevisionMigration,/'note_revision',v_application\.status is not distinct from p_status/);
  assert.match(decisionRevisionMigration,/char_length\(coalesce\(p_decision_note,''\)\) > 1000/);
  assert.match(decisionRevisionPgTap,/select plan\(14\);/);
  assert.match(decisionRevisionPgTap,/same-status reviewer note revision is allowed/);
  assert.match(decisionRevisionPgTap,/clearing an existing note without changing decision is allowed/);
  assert.match(decisionRevisionPgTap,/direct attempted reviewer forgery remains forbidden/);
  assert.match(decisionRevisionPgTap,/unassigned outsider cannot revise school admission decision/);
});
