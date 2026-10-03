import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/features/academics/server/academic-analysis.ts", "utf8");
const page = fs.readFileSync("src/app/academics/analysis/page.tsx", "utf8");
const views = fs.readFileSync("src/features/academics/components/academic-analysis-views.tsx", "utf8");
const print = fs.readFileSync("src/app/academics/analysis/print/page.tsx", "utf8");
const excel = fs.readFileSync("src/features/academics/server/render-academic-analysis-xlsx.ts", "utf8");
const route = fs.readFileSync("src/app/academics/analysis/export.xlsx/route.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261003081000_academic_analysis_quality_and_promotion_readiness.sql", "utf8");

test("Academic Analysis consolidates to five primary views", () => {
  for (const token of ["Overview", "Results", "Grades & Classes", "Learners & Risk", "Trends"]) {
    assert.match(page + views, new RegExp(token.replace(/[&]/g, "\\&")));
  }
  assert.match(page, /AcademicAnalysisViews/);
  assert.doesNotMatch(page, /Teacher–subject analysis[\s\S]*primary tab/i);
});

test("quality symbols are effective-dated governed metadata and never hard-coded A-C", () => {
  assert.match(migration, /academic_analysis_quality_symbols/);
  assert.match(migration, /effective_from_year/);
  assert.match(migration, /effective_to_year/);
  assert.match(migration, /user_can_manage_school_settings/);
  assert.match(source, /qualitySymbolsByScaleId/);
  assert.doesNotMatch(source + views, /\["A","B","C"\]|A–C is|A-C is/);
});

test("promotion readiness delegates to the canonical promotion engine", () => {
  assert.match(migration, /evaluate_promotion_recommendation_scoped_engine/);
  assert.match(migration, /get_academic_analysis_promotion_readiness/);
  assert.match(source, /get_academic_analysis_promotion_readiness/);
  assert.doesNotMatch(source, /recommended_outcome\s*=|pass_outcome\s*=|fail_outcome\s*=/);
});

test("learner risk includes governed failures promotional risk and near-threshold analysis", () => {
  assert.match(source, /failedSubjects/);
  assert.match(source, /promotionalSubjectFailures/);
  assert.match(source, /promotion_rule_conditions/);
  assert.match(source, /minimum_subject_result/);
  assert.match(source, /nearThresholdSubjects/);
  assert.match(source, /minimum_value/);
  assert.match(source, /NEAR_THRESHOLD_MARGIN/);
  assert.match(views, /2\+ failures/);
  assert.match(views, /Promotional-subject risk/);
});

test("top improvers compare shared prior-term subjects rather than unrelated learner averages", () => {
  assert.match(source, /previousByKey/);
  assert.match(source, /sharedImprovements/);
  assert.match(source, /sharedImprovementSubjects/);
  assert.match(views, /shared subjects from the previous term/);
});

test("trend analysis reuses governed official-series comparability", () => {
  assert.match(source, /compare_official_result_series/);
  assert.match(source, /not_comparable/);
  assert.match(source, /Incompatible|error\.message/);
  assert.match(views, /Mixed provenance/);
  assert.match(views, /not comparable/);
});

test("teacher subject context stays descriptive and is never ranked", () => {
  assert.match(views, /Teacher–subject context/);
  assert.match(views, /No teacher ranking/);
  assert.doesNotMatch(source + views, /teacherScore|teacherRank|bestTeacher|worstTeacher/);
});

test("official and provisional basis remains explicit throughout the workspace", () => {
  assert.match(page, /OFFICIAL/);
  assert.match(page, /PROVISIONAL/);
  assert.match(print, /OFFICIAL/);
  assert.match(print, /PROVISIONAL/);
  assert.match(excel, /workspace\.basis\.toUpperCase/);
});

test("print and Excel are per-view and use the shared live school document header", () => {
  assert.match(print, /getLiveSchoolDocumentHeader/);
  assert.match(route, /getLiveSchoolDocumentHeader/);
  assert.match(route, /view/);
  assert.match(excel, /AcademicAnalysisView/);
  for (const view of ["overview","results","grades","learners","trends"]) {
    assert.match(excel, new RegExp('view === "' + view + '"'));
  }
});

test("Academic Analysis remains a read layer without a parallel result store", () => {
  assert.match(source, /from\("official_results"\)/);
  assert.doesNotMatch(migration, /create table .*result/i);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(/);
});
