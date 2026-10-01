import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const overview = readFileSync("src/features/dashboard/server/overview.ts", "utf8");
const page = readFileSync("src/app/page.tsx", "utf8");

test("dashboard overview collapses three exact-count requests into one RPC", () => {
  assert.match(overview, /supabase\.rpc\("get_school_dashboard_overview"/);
  assert.doesNotMatch(overview, /\.from\("enrolments"\)/);
  assert.doesNotMatch(overview, /\.from\("grades"\)/);
  assert.doesNotMatch(overview, /\.from\("register_classes"\)/);
  assert.doesNotMatch(overview, /count:\s*"exact"/);
  assert.doesNotMatch(overview, /head:\s*true/);
});

test("dashboard overview keeps the same return shape", () => {
  assert.match(overview, /currentLearners:/);
  assert.match(overview, /gradeCount:/);
  assert.match(overview, /registerClassCount:/);
});

test("dashboard overview remains streamed behind Suspense", () => {
  assert.match(page, /<Suspense fallback=\{<DashboardOverviewLoading \/>\}>/);
  assert.match(page, /overview = await getDashboardOverview\(schoolId, academicYear\)/);
});
