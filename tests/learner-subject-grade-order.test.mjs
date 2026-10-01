import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/features/learners/server/subject-assignments.ts", "utf8");

test("learner-subject workspace orders grades by a real grades column", () => {
  assert.match(
    source,
    /db\.from\("grades"\)[\s\S]*?\.eq\("academic_year", academicYear\)\.order\("display_name"\)/,
  );
  assert.doesNotMatch(
    source,
    /db\.from\("grades"\)[\s\S]*?\.order\("sort_order"\)/,
  );
});

test("register class ordering remains stable", () => {
  assert.match(
    source,
    /db\.from\("register_classes"\)[\s\S]*?\.order\("display_name"\)/,
  );
});
