import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("src/features/sports-houses/sports-houses-workspace.tsx","utf8");
const sportsQueries = readFileSync("src/features/sports-houses/server/queries.ts","utf8");
const guardianQueries = readFileSync("src/features/guardians/server/queries.ts","utf8");
const learnerPage = readFileSync("src/app/learners/[id]/page.tsx","utf8");
const documentRenderer = readFileSync("src/features/documents/server/sports-house-roster-document.ts","utf8");
const exportRoute = readFileSync("src/app/api/official-documents/sports-house-roster/route.ts","utf8");

test("sports allocation exposes the requested unassigned and operational filters", () => {
  for (const label of ["House","Grade","Register class","Age group","Sex","Source","Lock","Staff house"]) {
    assert.match(workspace,new RegExp(`label="${label}"`));
  }
  assert.match(workspace,/value: "unassigned", label: "Unassigned"/);
  assert.match(workspace,/learners=\{filteredLearners\}/);
  assert.match(workspace,/staff=\{filteredStaff\}/);
});

test("house detail uses canonical roster data and source age proposals never auto-write rules", () => {
  assert.match(workspace,/operational roster/);
  assert.match(workspace,/House leader/);
  assert.match(workspace,/source labels never rewrite learners/i);
  assert.match(sportsQueries,/get_sports_house_operational_learner_roster/);
  assert.match(sportsQueries,/sports_age_group_source_proposals/);
});

test("house roster exports support one multiple all and content/group options through shared official document header", () => {
  assert.match(workspace,/House roster exports/);
  assert.match(workspace,/Learners \+ staff/);
  assert.match(workspace,/Age group/);
  assert.match(documentRenderer,/renderOfficialDocumentHtmlHeader/);
  assert.match(documentRenderer,/drawOfficialDocumentPdfHeader/);
  assert.match(documentRenderer,/XLSX\.utils\.book_new/);
  assert.match(exportRoute,/getLiveSchoolDocumentHeader/);
  assert.match(exportRoute,/format==="pdf"/);
  assert.match(exportRoute,/format==="xlsx"/);
});

test("learner compact summary uses reusable effective guardian resolver without addresses", () => {
  assert.match(guardianQueries,/getEffectiveLearnerGuardianContact/);
  assert.match(learnerPage,/Effective guardian \/ contact/);
  assert.match(learnerPage,/Current subjects/);
  assert.match(learnerPage,/compactContext\.houseName/);
  const summary = learnerPage.slice(learnerPage.indexOf('At a glance'),learnerPage.indexOf('Overview</span>'));
  assert.doesNotMatch(summary,/address/i);
});
