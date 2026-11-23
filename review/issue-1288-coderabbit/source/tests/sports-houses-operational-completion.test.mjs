import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("src/features/sports-houses/sports-houses-workspace.tsx","utf8");
const sportsQueries = readFileSync("src/features/sports-houses/server/queries.ts","utf8");
const sportsActions = readFileSync("src/features/sports-houses/server/actions.ts","utf8");
const guardianQueries = readFileSync("src/features/guardians/server/queries.ts","utf8");
const learnerPage = readFileSync("src/app/learners/[id]/page.tsx","utf8");
const documentRenderer = readFileSync("src/features/documents/server/sports-house-roster-document.ts","utf8");
const exportRoute = readFileSync("src/app/api/official-documents/sports-house-roster/route.ts","utf8");

test("sports allocation exposes the requested unassigned and operational filters", () => {
  for (const label of ["House","Grade","Register class","Age group","Gender","Source","Lock","Staff house"]) {
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
  assert.match(workspace,/school: schoolId/);
  assert.match(workspace,/school=\$\{schoolId\}/);
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
  assert.match(exportRoute,/item\.schoolId===requestedSchool/);
  assert.match(exportRoute,/requestedSchool && !platformAdmin && !requestedMembership/);
});

test("house roster exports keep operational Source and Lock optional through configurable print columns", () => {
  assert.match(workspace,/Print columns/);
  assert.match(workspace,/DEFAULT_SPORTS_EXPORT_COLUMNS = \["grade", "class", "sex", "age", "age_group"\]/);
  assert.match(workspace,/columns: exportColumns\.join\(","\)/);
  assert.match(exportRoute,/SPORTS_ROSTER_COLUMN_KEYS/);
  assert.match(exportRoute,/DEFAULT_SPORTS_HOUSE_ROSTER_COLUMNS/);
  assert.match(documentRenderer,/selectedLearnerColumns/);
  assert.match(documentRenderer,/input\.learnerColumns\.includes\("source"\)/);
  assert.match(documentRenderer,/input\.learnerColumns\.includes\("lock"\)/);
});

test("house roster exports stay above configuration and DOB remains opt-in", () => {
  assert.ok(workspace.indexOf("House roster exports") < workspace.indexOf("<h2 className=\"scolapro-section-title\">Houses</h2>"));
  assert.ok(workspace.indexOf("House roster exports") < workspace.indexOf("<h2 className=\"scolapro-section-title\">Age groups</h2>"));
  assert.match(workspace,/\{ value: "dob", label: "DOB" \}/);
  assert.match(workspace,/value: "sex", label: "Gender"/);
  assert.match(workspace,/DEFAULT_SPORTS_EXPORT_COLUMNS = \["grade", "class", "sex", "age", "age_group"\]/);
  assert.match(documentRenderer,/dob: \{ key: "dob", label: "DOB"/);
  assert.match(documentRenderer,/DEFAULT_SPORTS_HOUSE_ROSTER_COLUMNS: readonly SportsHouseRosterColumn\[\] = \["grade", "class", "sex", "age", "age_group"\]/);
  assert.match(documentRenderer,/sex: \{ key: "sex", label: "Gender"/);
  assert.doesNotMatch(workspace,/label="Sex"|>Sex</);
  assert.doesNotMatch(documentRenderer,/label: "Sex"|Unspecified sex/);
});

test("sports year reference-date setup requires explicit approval and records audit evidence", () => {
  const migration = readFileSync("supabase/migrations/20261104113000_sports_year_reference_date_setup.sql","utf8");
  const hardening = readFileSync("supabase/migrations/20261104140000_sports_houses_authorization_privacy_hardening.sql","utf8");
  assert.match(workspace,/Official age reference date/);
  assert.match(workspace,/const savedDate = yearSettings\?\.ageReferenceDate \?\? null/);
  assert.match(workspace,/currentDate=\{savedDate\}/);
  assert.match(workspace,/useState\(currentDate \?\? ""\)/);
  assert.match(workspace,/schoolApprovalConfirmed/);
  assert.match(sportsActions,/schoolApprovalConfirmed: z\.literal\("on"\)/);
  assert.match(sportsActions,/ageReferenceDate\.slice\(0, 4\)/);
  assert.match(sportsActions,/rpc\("set_sports_year_reference_date"/);
  assert.match(sportsActions,/canSetSportsYearReferenceDate/);
  assert.match(hardening,/app_private\.is_active_school_admin\(p_school_id\)/);
  assert.match(hardening,/v_existing_reference_date is distinct from p_age_reference_date/);
  assert.match(hardening,/p_school_approval_confirmed is not true/);
  assert.match(migration,/sports\.year_reference_date\.configured/);
  assert.match(migration,/insert into public\.audit_events/);
});

test("learner compact summary uses reusable effective guardian resolver without addresses", () => {
  assert.match(guardianQueries,/getEffectiveLearnerGuardianContact/);
  assert.match(learnerPage,/Effective guardian \/ contact/);
  assert.match(learnerPage,/Current subjects/);
  assert.match(learnerPage,/compactContext\.houseName/);
  const summary = learnerPage.slice(learnerPage.indexOf('At a glance'),learnerPage.indexOf('Overview</span>'));
  assert.doesNotMatch(summary,/address/i);
  assert.match(readFileSync("supabase/migrations/20261003180000_sports_houses_operational_completion.sql","utf8"),/can_read_guardian\(lg\.guardian_id\)/);
  assert.match(readFileSync("supabase/migrations/20261003180000_sports_houses_operational_completion.sql","utf8"),/can_read_learner_identity\(p_school_id,e\.learner_id\)/);
  assert.match(readFileSync("supabase/migrations/20261003180000_sports_houses_operational_completion.sql","utf8"),/can_read_learner_subject_registration\([\s\S]*p_school_id,[\s\S]*p_enrolment_id,[\s\S]*lsr\.subject_offering_id/);
});
