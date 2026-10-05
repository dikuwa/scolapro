import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/features/academics/server/academic-analysis.ts", "utf8");
const page = fs.readFileSync("src/app/academics/analysis/page.tsx", "utf8");
const views = fs.readFileSync("src/features/academics/components/academic-analysis-views.tsx", "utf8");
const print = fs.readFileSync("src/app/academics/analysis/print/page.tsx", "utf8");
const excel = fs.readFileSync("src/features/academics/server/render-academic-analysis-xlsx.ts", "utf8");
const pdf = fs.readFileSync("src/features/academics/server/render-academic-analysis-pdf.ts", "utf8");
const route = fs.readFileSync("src/app/academics/analysis/export.xlsx/route.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261003081000_academic_analysis_quality_and_promotion_readiness.sql", "utf8");

test("Academic Analysis consolidates to six primary views", () => {
  for (const token of ["Overview", "Results", "Grades & Classes", "Learners & Risk", "Promotion Exceptions", "Trends"]) {
    assert.match(page + views, new RegExp(token.replace(/[&]/g, "\\&")));
  }
  assert.match(page, /AcademicAnalysisViews/);
  assert.doesNotMatch(page, /Teacher–subject analysis[\s\S]*primary tab/i);
});

test("quality symbols are effective-dated governed metadata and never hard-coded A-C", () => {
  assert.match(migration, /academic_analysis_quality_symbols/);
  assert.match(migration, /Historical quality-symbol definitions cannot be deleted/);
  assert.match(migration, /before insert or update or delete on public\.academic_analysis_quality_symbols/);
  assert.doesNotMatch(migration, /create policy academic_analysis_quality_symbols_delete/);
  assert.match(migration, /effective_from_year/);
  assert.match(migration, /effective_to_year/);
  assert.match(migration, /user_can_manage_school_settings/);
  assert.match(migration, /new\.created_by_user_id:=auth\.uid\(\)/);
  assert.match(migration, /created_by_user_id=auth\.uid\(\)/);
  assert.match(source, /qualitySymbolsByScaleId/);
  assert.doesNotMatch(source + views, /\["A","B","C"\]|A–C is|A-C is/);
});

test("promotion readiness delegates to the canonical promotion engine", () => {
  assert.match(migration, /evaluate_promotion_recommendation_scoped_engine/);
  assert.match(migration, /array\['school_admin','principal','deputy_principal'\]/);
  assert.doesNotMatch(migration, /array\['school_admin','principal','deputy_principal','hod'\]/);
  assert.match(source, /canReadPromotionReadiness = \["school_admin","principal","deputy_principal"\]/);
  assert.match(migration, /get_academic_analysis_promotion_readiness/);
  assert.match(migration, /from public\.academic_years ay/);
  assert.match(migration, /e\.enrolled_from<=v_year_end/);
  assert.match(migration, /e\.enrolled_to is null or e\.enrolled_to>=v_year_start/);
  assert.doesNotMatch(migration, /e\.status='current'[\s\S]*e\.enrolled_from<=current_date/);
  assert.match(source, /get_academic_analysis_promotion_readiness/);
  assert.doesNotMatch(source, /recommended_outcome\s*=|pass_outcome\s*=|fail_outcome\s*=/);
});

test("learner risk includes governed failures promotional risk and near-threshold analysis", () => {
  assert.match(source, /failedSubjects/);
  assert.match(source, /promotionalSubjectFailures/);
  assert.match(source, /promotion_rule_conditions/);
  assert.match(source, /minimum_subject_result/);
  assert.match(source, /promotionalSubjectCodesByGradeId/);
  assert.match(source, /gradeIdByRuleSetId/);
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
  assert.match(page, /view === "trends" \? undefined : params\.class/);
  assert.match(page, /view === "trends" \? undefined : params\.teacher/);
  assert.match(page, /Offering-wide trends/);
  assert.match(route, /view === "trends" \? undefined : url\.searchParams\.get\("class"\)/);
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
  assert.match(source, /riskLevel: "high" \| "watch" \| "stable" \| "unavailable"/);
  assert.match(source, /riskEvidenceAvailable/);
  assert.match(views, /Unavailable without governed grading\/promotion evidence/);
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
  for (const view of ["overview","results","grades","learners","promotion_exceptions","trends"]) {
    assert.match(excel, new RegExp(view + ': "' + ({
      overview: "Overview",
      results: "Results",
      grades: "Grades & Classes",
      learners: "Learners & Risk",
      promotion_exceptions: "Promotion Exceptions",
      trends: "Trends",
    })[view].replace(/[&]/g, "\\&") + '"'));
  }
  assert.match(excel, /buildOfficialDocumentWorkbookSheet/);
  assert.match(excel, /finalizeOfficialDocumentWorkbook/);
});

test("mixed grading-scale quality aggregates exclude unconfigured scales from the quality denominator", () => {
  assert.match(source, /qualityConfiguredRows/);
  assert.match(source, /qualityClassified/);
  assert.match(source, /rate\(aggregateQualityCount, qualityClassified\)/);
});

test("Academic Analysis remains a read layer without a parallel result store", () => {
  assert.match(source, /from\("official_results_current"\)/);
  assert.doesNotMatch(migration, /create table .*result/i);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(/);
});


test("Academic Analysis governed document exports add a deterministic numbering column first", () => {
  assert.match(pdf, /headers: \["No\.", \.\.\.sourceTable\.headers\]/);
  assert.match(pdf, /rows: sourceTable\.rows\.map\(\(row, index\) => \[String\(index \+ 1\), \.\.\.row\]\)/);
  assert.match(excel, /headers: \["No\.", \.\.\.sourceData\.headers\]/);
  assert.match(excel, /rows: sourceData\.rows\.map\(\(row, index\) => \[index \+ 1, \.\.\.row\]\)/);
  assert.match(excel, /centeredHeaderColumns: \[0\]/);
  assert.match(excel, /centeredDataColumns: \[0\]/);
});
