import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/migrations/20260925211500_crc_contributor_custodian_workspace.sql");
const cumulativePage = read("src/app/learners/[id]/cumulative-record/page.tsx");
const contributionCard = read("src/features/crc/crc-routine-contribution-card.tsx");
const custodyPage = read("src/app/school/crc-custody/page.tsx");
const custodyWorkspace = read("src/features/crc/crc-custody-workspace.tsx");
const custodyQueries = read("src/features/crc/server/custody.ts");

test("register-teacher contribution is bounded to existing routine CRC domains", () => {
  assert.match(migration, /is_current_register_teacher_for_enrolment/);
  assert.match(migration, /append_crc_routine_contribution/);
  assert.match(migration, /learner_development_observations/);
  assert.match(migration, /learner_cumulative_notes/);
  assert.match(migration, /'routine'/);
  assert.doesNotMatch(migration.slice(migration.indexOf("create or replace function public.append_crc_routine_contribution"), migration.indexOf("create or replace function public.get_crc_administration_summary")), /learner_health_history|learner_psychometric_records|learner_support_cases/);
});

test("cumulative record only shows contribution UI when governed context resolves", () => {
  assert.match(cumulativePage, /getMyCrcContributionContext/);
  assert.match(cumulativePage, /contributionContext \? <CrcRoutineContributionCard/);
  assert.match(contributionCard, /This form cannot write health, psychometric, counselling or highly restricted records/);
  assert.match(contributionCard, /<Picker/);
  assert.doesNotMatch(contributionCard, /<select/);
});

test("custody administration exposes requested operational views without duplicating confidential content", () => {
  for (const label of ["Overview", "Requests", "Transfers", "Incoming", "Completeness", "Reports & audit", "Training"]) {
    assert.ok(custodyWorkspace.includes(label), `missing ${label}`);
  }
  assert.match(custodyWorkspace, /Confidential case content is not duplicated into this dashboard/);
  assert.match(custodyWorkspace, /Leadership sees workflow state and readiness only/);
  assert.match(custodyQueries, /get_crc_administration_summary/);
  assert.match(custodyQueries, /list_crc_class_completeness/);
});

test("custody prepare controls use ScolaPro Picker rather than browser-native selects", () => {
  assert.match(custodyWorkspace, /Receiving school/);
  assert.match(custodyWorkspace, /Receiving custodian/);
  assert.match(custodyWorkspace, /<Picker/);
  assert.doesNotMatch(custodyWorkspace, /<select/);
});

test("CRC administration route remains governed by custody or leadership authority", () => {
  assert.match(custodyPage, /getCrcCustodyAccessContext/);
  assert.match(custodyPage, /if \(!access\.canManageCustody && !access\.leadership\) redirect/);
  assert.match(custodyPage, /getCrcAdministrationSummary\(membership\.schoolId\)/);
  assert.match(custodyQueries, /canViewConfidentialSupport/);
});
