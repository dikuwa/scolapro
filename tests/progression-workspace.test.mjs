import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions = readFileSync(new URL("../src/features/progression/server/actions.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/features/progression/server/workspace.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../src/features/progression/progression-workspace.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/school/progression/page.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../src/components/shell/navigation.tsx", import.meta.url), "utf8");

test("progression actions use only the canonical governed RPCs", () => {
  for (const rpc of [
    "generate_year_end_progression",
    "override_year_end_progression",
    "approve_year_end_progression",
    "lock_year_end_progression",
    "publish_year_end_progression",
  ]) {
    assert.match(actions, new RegExp(`supabase\\.rpc\\("${rpc}"`));
  }
  // No parallel source of truth and no pass/promotion rules in application code.
  assert.doesNotMatch(actions, /\.from\("year_end_progressions"\)/);
  assert.doesNotMatch(actions, /\.update\(\{ status: "approved"/);
  assert.doesNotMatch(actions, /\.insert\(/);
  assert.doesNotMatch(component, /overall_average\s*[<>]=?\s*\d/);
  assert.doesNotMatch(component, /\bpass(?:ed)?\s*=\s*/i);
});

test("a readiness failure surfaces instead of blanking the workspace", () => {
  assert.match(workspace, /const readinessFailed = partialFailure/);
  assert.match(workspace, /\[learnersResult, registerClassesResult, progressionsResult, ruleSetsResult, readinessResult\]/);
  assert.match(workspace, /progression\.workspace\.partial_read_failure/);
  assert.match(workspace, /readinessFailed,/);
  // The fatal-error loop must not include the readiness projection.
  assert.doesNotMatch(workspace, /for \(const result of \[[^\]]*readinessResult[^\]]*\]\) \{\s*if \(result\.error\) throw/);
  assert.match(component, /workspace\.readinessFailed/);
  assert.match(component, /Recommendations could not be evaluated for this grade/);
});

test("workspace reads canonical enrolment, readiness and next-year configuration", () => {
  assert.match(workspace, /get_academic_analysis_promotion_readiness/);
  assert.match(workspace, /from\("year_end_progressions"\)/);
  assert.match(workspace, /from\("year_end_progression_publications"\)/);
  // Publications store destination_grade_id; destination_grade_code does not exist
  // on that table and made the read fail with 42703.
  assert.match(workspace, /destination_academic_year,destination_grade_id,destination_enrolment_id/);
  assert.doesNotMatch(workspace, /publication\.destination_grade_code/);
  assert.match(workspace, /from\("promotion_rule_sets"\)/);
  assert.match(workspace, /academic_years/);
  assert.match(workspace, /nextYearConfigured/);
  // Receipts are read from the append-only publication table so they remain
  // visible after the source enrolment closes.
  assert.match(workspace, /source_academic_year", academicYear/);
  assert.match(workspace, /publications,/);
  // Receipts are scoped by the progression's source grade, never by destination.
  assert.match(workspace, /source_grade_id"\).in\("id", receiptProgressionIds\)/);
  assert.match(workspace, /sourceGradeId === selectedGradeId/);
  assert.doesNotMatch(workspace, /receiptGradeIds/);
  assert.match(component, /role="region" aria-label="Published rollovers"/);
  assert.match(workspace, /destinationChoices/);
});

test("consequential actions require explicit confirmation and show pending state", () => {
  assert.match(actions, /confirmation: z\.literal\("confirmed"\)/);
  assert.match(actions, /publish_year_end_progression/);
  assert.match(component, /Publish rollover/);
  assert.match(component, /Lock decision/);
  assert.match(component, /checked=\{confirmed\}/);
  // The governed publish action requires an explicit confirmation token; the
  // checkbox alone does not submit one.
  assert.match(component, /<input type="hidden" name="confirmation" value=\{confirmed \? "confirmed" : ""\} \/>/);
  assert.match(component, /publishState\.message && !publishState\.success/);
  assert.match(component, /pending\.publish/);
  // Changing only the destination grade is a valid override and must be saveable.
  assert.match(component, /const initialGradeCode = learner\.progression\?\.destinationGradeCode \?\? ""/);
  assert.match(component, /overrideOutcome === progression\.outcome && destinationGradeCode === initialGradeCode/);
  assert.match(component, /pending\.publish \? "Publishing…"/);
  assert.match(component, /!workspace\.nextYearConfigured/);
  assert.match(component, /Generate recommendation/);
  assert.match(component, /Override outcome/);
  assert.match(component, /Approval requires school leadership/);
});

test("the route is limited to school leadership and discoverable for them", () => {
  assert.match(page, /progressionRoles = new Set\(\["school_admin", "principal", "deputy_principal"\]\)/);
  assert.match(page, /if \(!progressionRoles\.has\(role\)\) redirect\("\/"\)/);
  assert.match(navigation, /\{ key: "progression", label: "Year-end progression", href: "\/school\/progression"/);
  assert.match(navigation, /school_admin: \[[^\]]*"progression"/);
  assert.match(navigation, /principal: \[[^\]]*"progression"/);
  assert.match(navigation, /deputy_principal: \[[^\]]*"progression"/);
  assert.doesNotMatch(navigation, /hod: \[[^\]]*"progression"/);
});
