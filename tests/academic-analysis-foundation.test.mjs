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
  assert.match(source, /if \(basis !== "official"\)/);
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
