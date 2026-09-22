import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/reports/report-cards/page.tsx", "utf8");
const worker = readFileSync("src/features/reporting/server/process-report-card-render-queue.ts", "utf8");
const pulse = readFileSync("src/app/api/report-card-batches/process/route.ts", "utf8");

test("report-card management starts independent reads without serial learner-roster blocking", () => {
  assert.match(page, /individualLearnersPromise = getIndividualReportCardLearnerOptions/);
  assert.match(page, /metaPromise = getReportCardManagementMeta/);
  assert.match(page, /wholeSchoolSummaryPromise = getReportCardScopeSummary/);
  assert.match(page, /selectedScopeSummaryPromise = scopeType === "grade"/);
  assert.match(page, /bulkStatusPagePromise = individualLearnerId/);

  const rosterStart = page.indexOf("const individualLearnersPromise");
  const rosterAwait = page.indexOf("const individualLearners = await individualLearnersPromise");
  const critical = page.slice(rosterStart, rosterAwait);
  assert.match(critical, /getReportCardManagementMeta/);
  assert.match(critical, /getReportCardStatusPage/);
  assert.match(critical, /getReportCardScopeSummary/);
});

test("report-card render worker bounds claims and uses limited parallel execution", () => {
  assert.match(worker, /const MAX_RENDER_CLAIM = 12/);
  assert.match(worker, /const RENDER_CONCURRENCY = 4/);
  assert.match(worker, /Math\.min\(limit, MAX_RENDER_CLAIM\)/);
  assert.match(worker, /runWithConcurrency\(jobs, RENDER_CONCURRENCY/);
  assert.match(worker, /FOR UPDATE SKIP LOCKED/);
  assert.doesNotMatch(worker, /for \(const job of jobs\)/);
});

test("report-card render worker reuses school and frozen logo reads within one invocation", () => {
  assert.match(worker, /schoolCache = new Map/);
  assert.match(worker, /logoCache = new Map/);
  assert.match(worker, /loadSchool\(supabase, job\.school_id, schoolCache\)/);
  assert.match(worker, /loadFrozenSchoolLogo\(supabase, snapshot\.data_snapshot, logoCache\)/);
});

test("authenticated browser pulse cannot claim an oversized render batch", () => {
  assert.match(pulse, /processReportCardRenderQueue\(12\)/);
  assert.doesNotMatch(pulse, /processReportCardRenderQueue\(40\)/);
});
