import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/features/academics/server/academic-analysis.ts", "utf8");
const pageSource = fs.readFileSync("src/app/academics/analysis/page.tsx", "utf8");
const filtersSource = fs.readFileSync("src/features/academics/components/academic-analysis-filters.tsx", "utf8");
const printSource = fs.readFileSync("src/app/academics/analysis/print/page.tsx", "utf8");
const excelSource = fs.readFileSync("src/app/academics/analysis/export.xlsx/route.ts", "utf8");

test("academic analysis is a read layer over canonical official results", () => {
  assert.match(source, /from\("official_results"\)/);
  assert.doesNotMatch(source, /insert\(|update\(|delete\(/);
});

test("analysis preserves official and provisional basis without silently mixing", () => {
  assert.match(source, /type AcademicAnalysisBasis = "official" \| "provisional"/);
  assert.match(source, /if \(basis === "official"\)/);
  assert.match(source, /typedResults = await loadProvisionalResults/);
});

test("symbol distribution resolves historical grading scale bands", () => {
  assert.match(source, /grading_scale_key/);
  assert.match(source, /grading_scale_version/);
  assert.match(source, /from\("grading_scale_bands"\)/);
  assert.match(source, /pass_classification/);
  assert.doesNotMatch(source, /40%|A–C|A-G|A–G/);
});

test("missing statuses are not converted to zero and quality is governed rather than assumed", () => {
  assert.match(source, /row\.result_value != null/);
  assert.match(source, /academic_analysis_quality_symbols/);
  assert.match(source, /qualitySymbolsByScaleId/);
  assert.match(source, /qualityCount == null \? null/);
  assert.doesNotMatch(source, /A-C|A–C|\["A","B","C"\]/);
});

test("phase 1 calculations include average median spread and classified denominators", () => {
  for (const token of ["average", "median", "minimum", "maximum", "standardDeviation", "classifiedResults", "passRate", "failRate"]) {
    assert.match(source, new RegExp(token));
  }
});

test("official analysis resolves class from the historical result enrolment rather than current allocation", () => {
  assert.match(source, /enrolment_id/);
  assert.match(source, /from\("enrolments"\)/);
  assert.match(source, /from\("register_classes"\)/);
  assert.match(source, /className:/);
});

test("teacher attribution comes from historical assessment allocations and preserves handovers", () => {
  assert.match(source, /from\("assessment_instances"\)/);
  assert.match(source, /from\("teacher_allocations"\)/);
  assert.match(source, /from\("staff_members"\)/);
  assert.match(source, /multiple_assessment_allocations/);
  assert.match(source, /teacherAttribution/);
});

test("shared scope drives subject grade class and teacher aggregates", () => {
  for (const token of ["subjectSummaries", "gradeSummaries", "classSummaries", "teacherSummaries", "aggregateBy", "subjectOfferingId?:", "grade?:", "className?:", "teacher?:"]) assert.match(source, new RegExp(token.replace(/[?]/g, "\\\?")));
  assert.match(source, /aggregateNumericValues/);
  assert.match(source, /passRate: rate\(passed, classified\)/);
});

test("provisional analysis uses the canonical calculation RPC and never mixes official rows", () => {
  assert.match(source, /loadProvisionalResults/);
  assert.match(source, /rpc\("calculate_subject_result"/);
  assert.match(source, /if \(basis === "official"\)/);
  assert.match(source, /else \{\s*typedResults = await loadProvisionalResults/);
});

test("provisional calculation scope is bounded to assessment-instance classes before RPC work", () => {
  assert.match(source, /classesByScheme/);
  assert.match(source, /eligibleClasses\.has\(enrolment\.register_class_id\)/);
  assert.match(source, /Promise\.all\(calculations\)/);
  assert.match(source, /if \(!eligibleClasses\.has\(enrolment\.register_class_id\)\) continue;/);
  assert.doesNotMatch(source, /await db\.rpc\("calculate_subject_result"[\s\S]{0,800}await db\.rpc\("calculate_subject_result"/);
});

test("HOD analysis uses governed subject responsibilities instead of whole-school application scope", () => {
  assert.match(source, /getHodScopeConfiguration/);
  assert.match(source, /membership\.roleKey === "hod"/);
  assert.match(source, /activeResponsibilitySubjectIds/);
  assert.match(source, /typedResults = typedResults\.filter/);
});

test("provisional eligibility reuses enrolment and subject-registration lifecycle semantics", () => {
  assert.match(source, /enrolled_from,enrolled_to,status/);
  assert.match(source, /learner_subject_registrations/);
  assert.match(source, /registered_at,withdrawn_at/);
  assert.match(source, /enrolmentEffective/);
  assert.match(source, /subjectEligible/);
  assert.match(source, /registration\.status === "active"/);
});

test("historical grading scales and bands are bulk-resolved outside the offering loop", () => {
  assert.match(source, /scaleIdByRef/);
  assert.match(source, /bandsByScaleId/);
  assert.match(source, /\.in\("grading_scale_id", scaleIds\)/);
  const rowsLoop = source.slice(source.indexOf("const rows: AcademicAnalysisRow[]"));
  assert.doesNotMatch(rowsLoop, /await db\.from\("grading_scales"\)/);
  assert.doesNotMatch(rowsLoop, /await db\.from\("grading_scale_bands"\)/);
});

test("analysis rows partition each subject offering by historical register class", () => {
  assert.match(source, /cohortClassKeys/);
  assert.match(source, /for \(const cohortClassKey of cohortClassKeys\)/);
  assert.match(source, /className: cohortClassKey === "unassigned"/);
  assert.doesNotMatch(source, /"Multiple classes"/);
});

test("aggregate median and spread derive from resolved numeric results, not row averages", () => {
  assert.match(source, /numericValues: number\[\]/);
  assert.match(source, /aggregateNumericValues = group\.flatMap/);
  assert.match(source, /summarizeNumericValues\(aggregateNumericValues\)/);
  assert.doesNotMatch(source, /weightedAverage/);
});

test("exports are projected from the same filtered analysis rows", () => {
  assert.match(source, /exportRows: AcademicAnalysisExportRow\[\]/);
  assert.match(source, /exportRows: filteredRows\.map/);
  assert.match(source, /symbols: row\.summary\.symbolDistribution/);
});

test("analysis workspace exposes a filtered Excel export action", () => {
  assert.match(pageSource, /export\.xlsx/);
  assert.match(pageSource, /exportParams/);
});

test("print PDF view receives the same filtered analysis scope", () => {
  assert.match(pageSource, /\/academics\/analysis\/print\?\$\{exportParams\.toString\(\)\}/);
});

test("subject and teacher filters remain in the governed analysis scope and export query", () => {
  assert.match(filtersSource, /name="subject"/);
  assert.match(filtersSource, /name="teacher"/);
  assert.match(pageSource, /exportParams\.set\("subject"/);
  assert.match(pageSource, /exportParams\.set\("teacher"/);
  assert.match(source, /subjectOfferingId\?:/);
  assert.match(source, /teacher\?:/);
});

test("phase-one subject and teacher reports stay descriptive and unranked", () => {
  assert.match(pageSource, /Subject summary/);
  assert.match(pageSource, /Teacher–subject analysis/);
  assert.match(pageSource, /No ranking or competence score is applied/);
  assert.doesNotMatch(pageSource, /Best teacher|Worst teacher|Teacher rank|Teacher score/);
});

test("phase-one grade and class reports use shared governed aggregates", () => {
  assert.match(pageSource, /Grade analysis/);
  assert.match(pageSource, /workspace\.gradeSummaries\.map/);
  assert.match(pageSource, /Class analysis/);
  assert.match(pageSource, /workspace\.classSummaries\.map/);
  assert.match(pageSource, /historical register class/);
});

test("management analysis does not expose learner or parent routes", () => {
  assert.doesNotMatch(pageSource, /parent|guardian/i);
  assert.doesNotMatch(pageSource, /learnerId|learner_id/);
});

test("analysis authority explicitly excludes platform memberships and unsupported school roles", () => {
  assert.match(source, /context\.platformMemberships\.length/);
  assert.match(source, /!context\.currentSchoolMembership/);
  assert.match(source, /school_admin.*principal.*deputy_principal.*hod.*teacher.*class_teacher/);
  assert.doesNotMatch(source, /platform_support/);
});

test("HOD analysis is constrained by governed subject responsibilities before aggregation", () => {
  assert.match(source, /getHodScopeConfiguration/);
  assert.match(source, /getHodScopeConfiguration/);
  assert.match(source, /activeResponsibilitySubjectIds/);
  assert.match(source, /typedResults = typedResults\.filter/);
});

test("historical teacher attribution resolves through teacher allocations", () => {
  assert.match(source, /from\("teacher_allocations"\)/);
  assert.match(source, /staff_member_id/);
  assert.doesNotMatch(pageSource, /best teacher|worst teacher|teacher rank|teacher score/i);
});


test("academic analysis filters reuse the ScolaPro searchable-select component instead of browser-native selects", () => {
  assert.match(filtersSource, /SearchableSelect/);
  assert.match(filtersSource, /name="grade"/);
  assert.match(filtersSource, /name="class"/);
  assert.match(filtersSource, /name="subject"/);
  assert.match(filtersSource, /name="teacher"/);
  assert.doesNotMatch(filtersSource, /<select\b/);
  assert.match(source, /filterOptions/);
});

test("analysis page and exports enforce the same three-term scope", () => {
  for (const routeSource of [pageSource, printSource, excelSource]) {
    assert.match(routeSource, /Math\.min\(3, Math\.max\(1,/);
  }
});

test("provisional empty state does not present itself as official", () => {
  assert.match(pageSource, /basis === "official" \? "No official results available" : "No provisional results available"/);
});
