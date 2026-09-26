import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/migrations/20260925233000_official_learner_transfer_form.sql");
const page = read("src/app/school/crc-custody/transfer-form/[transferId]/page.tsx");
const workspace = read("src/features/transfers/learner-transfer-form-workspace.tsx");
const actions = read("src/features/transfers/server/actions.ts");
const query = read("src/features/transfers/server/transfer-form.ts");
const custodyPage = read("src/app/school/crc-custody/page.tsx");
const custodyWorkspace = read("src/features/crc/crc-custody-workspace.tsx");
const renderer = read("src/features/transfers/server/render-learner-transfer-form.ts");
const exportRoute = read("src/app/api/official-documents/learner-transfer-form/[snapshotId]/route.ts");

test("transfer form derives authoritative learner and transfer fields rather than duplicating identity", () => {
  assert.match(migration, /public\.transfer_events/);
  assert.match(migration, /public\.learners/);
  assert.match(migration, /public\.enrolments/);
  assert.match(migration, /learner_subject_registrations/);
  assert.match(migration, /year_end_progressions/);
  assert.doesNotMatch(migration, /create table .*transfer_form_learners/i);
});

test("suggestions are provenance-backed and exclude restricted counselling/psychometric sources", () => {
  assert.match(migration, /conduct_events/);
  assert.match(migration, /learner_development_observations/);
  assert.match(migration, /learner_health_history/);
  assert.match(migration, /learner_cumulative_notes/);
  assert.match(migration, /healthAuthorized/);
  assert.match(migration, /is_support_role_member/);

  const sourceStart = migration.indexOf("create or replace function public.get_learner_transfer_form_source");
  const sourceEnd = migration.indexOf("create or replace function public.save_learner_transfer_form_draft", sourceStart);
  const sourceFunction = migration.slice(sourceStart, sourceEnd);
  assert.doesNotMatch(sourceFunction, /learner_psychometric_records|learner_support_cases|learner_support_interventions/);
});

test("human verification stays editable before immutable leadership finalization", () => {
  for (const label of [
    "Reason for departure",
    "Documents attached",
    "Behaviour",
    "State of health",
    "Other relevant information",
    "Verification note",
  ]) {
    assert.ok(workspace.includes(label), `missing ${label}`);
  }
  assert.match(actions, /save_learner_transfer_form_draft/);
  assert.match(actions, /finalize_learner_transfer_form/);
  assert.match(migration, /Only source-school leadership may finalize the learner transfer form/);
  assert.match(migration, /Finalized learner transfer form content is immutable/);
});

test("finalized transfer form uses shared verification revisions and freezes source provenance", () => {
  assert.match(migration, /learner_transfer_form_snapshots/);
  assert.match(migration, /register_official_document_verification/);
  assert.match(migration, /suggestionProvenance/);
  assert.match(migration, /superseded/);
  assert.match(query, /get_learner_transfer_form_finalization/);
});

test("CRC Transfers view exposes governed official transfer-form queue", () => {
  assert.match(custodyPage, /listLearnerTransferFormCandidates/);
  assert.match(custodyWorkspace, /Official learner transfer forms/);
  assert.match(custodyWorkspace, /Verification needed/);
  assert.match(custodyWorkspace, /\/school\/crc-custody\/transfer-form\//);
  assert.match(page, /getLearnerTransferFormWorkspace/);
});

test("prescribed government transfer-form rendering matches the governed source contract", () => {
  assert.match(renderer, /7-1\/0093/);
  assert.match(renderer, /MINISTRY OF BASIC EDUCATION AND CULTURE/);
  assert.match(renderer, /TRANSFER FORM FOR LEARNER \(USE ONE FORM FOR EACH LEARNER\)/);
  assert.match(renderer, /Medium of instruction \(only grades 1, 2 & 3\)/);
  assert.match(renderer, /SCHOOL STAMP/);
  assert.match(renderer, /PRINCIPAL/);
  assert.match(renderer, /INSTRUCTIONS FOR COMPLETION OF TRANSFER FORMS/);
  assert.match(renderer, /must complete this form in triplicate/);
  assert.match(renderer, /certified post/);
  assert.match(renderer, /clear, legible writing/);
  assert.match(workspace, /Preview \/ Print/);
  assert.match(workspace, /Download PDF/);
  assert.match(workspace, /api\/official-documents\/learner-transfer-form/);
  assert.match(exportRoute, /renderOfficialLearnerTransferFormHtml/);
  assert.match(exportRoute, /renderOfficialLearnerTransferFormPdf/);
  assert.match(exportRoute, /X-ScolaPro-Page-Count/);
});

test("prescribed medium-of-instruction field remains human verified and frozen", () => {
  assert.match(workspace, /Medium of instruction \(only grades 1, 2 &amp; 3\)/);
  assert.match(actions, /p_medium_of_instruction/);
  assert.match(migration, /medium_of_instruction/);
  assert.match(migration, /'mediumOfInstruction',v_draft\.medium_of_instruction/);
  assert.match(renderer, /verified\.mediumOfInstruction/);
});
