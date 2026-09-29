import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/features/academics/server/academic-analysis.ts", "utf8");

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

test("missing statuses are not converted to zero and quality is not assumed", () => {
  assert.match(source, /row\.result_value != null/);
  assert.match(source, /qualityCount: null/);
  assert.match(source, /qualityRate: null/);
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
  assert.match(source, /weightedAverage/);
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
