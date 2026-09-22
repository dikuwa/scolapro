import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/reports/report-cards/page.tsx", "utf8");
const worker = readFileSync("src/features/reporting/server/process-report-card-render-queue.ts", "utf8");
const pulse = readFileSync("src/app/api/report-card-batches/process/route.ts", "utf8");
const exportWorker = readFileSync("src/features/reporting/server/process-report-card-batch-export-queue.ts", "utf8");
const actions = readFileSync("src/features/reporting/server/actions.ts", "utf8");
const management = readFileSync("src/features/reporting/server/report-card-management.ts", "utf8");
const workspace = readFileSync("src/features/reporting/paged-report-card-management.tsx", "utf8");
const workerSchedule = readFileSync(".github/workflows/report-card-worker.yml", "utf8");
const loadBenchmark = readFileSync("scripts/benchmark-report-card-worker.mjs", "utf8");
const internalWorker = readFileSync("src/app/api/internal/report-card-render/route.ts", "utf8");
const workerHealth = readFileSync("src/features/reporting/server/report-card-worker-health.ts", "utf8");

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


test("combined report export removes serial artifact-download waterfall with bounded chunks", () => {
  assert.match(exportWorker, /const EXPORT_DOWNLOAD_CONCURRENCY = 6/);
  assert.match(exportWorker, /offset < orderedItems\.length; offset \+= EXPORT_DOWNLOAD_CONCURRENCY/);
  assert.match(exportWorker, /sourceBytes = await Promise\.all\(chunk\.map/);
  assert.match(exportWorker, /for \(const bytes of sourceBytes\)/);
});


test("large PDF preparation is split into durable bounded print packs", () => {
  assert.match(actions, /const PDF_PRINT_PACK_SIZE = 250/);
  assert.match(actions, /const PDF_PRINT_PACK_CREATE_CONCURRENCY = 4/);
  assert.match(actions, /createPdfPrintPacks/);
  assert.match(actions, /offset < input\.enrolmentIds\.length; offset \+= PDF_PRINT_PACK_SIZE/);
  assert.match(actions, /Print pack \$\{index \+ 1\}\/\$\{chunks\.length\}/);
  assert.match(actions, /p_operation: "pdf"/);
  assert.match(actions, /across \$\{printPackCount\} resumable print packs/);
});

test("PDF scope resolution remains current-school and current-year bounded", () => {
  assert.match(actions, /\.eq\("school_id", input\.schoolId\)/);
  assert.match(actions, /\.eq\("academic_year", input\.academicYear\)/);
  assert.match(actions, /\.eq\("status", "current"\)/);
  assert.match(actions, /query = query\.eq\("grade_id", input\.scopeId as string\)/);
  assert.match(actions, /query = query\.eq\("register_class_id", input\.scopeId as string\)/);
});

test("report-card management retains enough print-pack history for a 5000 learner school", () => {
  assert.match(management, /\.limit\(30\)/);
  assert.match(workspace, /visibleBatches\.slice\(0, 20\)\.map/);
});


test("report-card worker can run independently of an open browser on a bounded schedule", () => {
  assert.match(workerSchedule, /cron: "\*\/5 \* \* \* \*"/);
  assert.match(workerSchedule, /workflow_dispatch/);
  assert.match(workerSchedule, /group: report-card-worker/);
  assert.match(workerSchedule, /cancel-in-progress: false/);
  assert.match(workerSchedule, /REPORT_CARD_WORKER_URL/);
  assert.match(workerSchedule, /INTERNAL_JOB_RUNNER_SECRET/);
  assert.match(workerSchedule, /Authorization: Bearer \$INTERNAL_JOB_RUNNER_SECRET/);
  assert.match(workerSchedule, /--max-time 55/);
  assert.match(workerSchedule, /--retry 2/);
});


test("report-card load benchmark is explicitly armed and reports p95 plus queue outcomes", () => {
  assert.match(loadBenchmark, /REPORT_CARD_LOAD_TEST_ARMED === "YES"/);
  assert.match(loadBenchmark, /REPORT_CARD_LOAD_CONCURRENCY/);
  assert.match(loadBenchmark, /REPORT_CARD_LOAD_ROUNDS/);
  assert.match(loadBenchmark, /REPORT_CARD_LOAD_FAILURE_PROBE === "YES"/);
  assert.match(loadBenchmark, /percentile\(durations, 95\)/);
  assert.match(loadBenchmark, /requestsPerSecond/);
  assert.match(loadBenchmark, /batchProcessed/);
  assert.match(loadBenchmark, /renderCompleted/);
  assert.match(loadBenchmark, /exportsCompleted/);
  assert.match(loadBenchmark, /if \(failures\.length\) process\.exit\(1\)/);
});


test("internal report-card queue health is opt-in and aggregate-only", () => {
  assert.match(internalWorker, /searchParams\.get\("health"\) === "1"/);
  assert.match(internalWorker, /includeHealth \? await getReportCardWorkerHealth\(\) : null/);
  assert.match(internalWorker, /\.\.\.\(includeHealth \? \{ healthBefore, healthAfter \} : \{\}\)/);
  assert.match(workerHealth, /report_card_batches/);
  assert.match(workerHealth, /report_card_render_jobs/);
  assert.match(workerHealth, /count: "exact", head: true/);
  assert.match(workerHealth, /oldestActiveAt/);
  assert.match(workerHealth, /oldestReadyAt/);
  assert.match(workerHealth, /oldestWaitingAt/);
  assert.doesNotMatch(workerHealth, /school_id.*select|learner_id.*select|snapshot_id.*select/);
});

test("load benchmark can capture final queue health without enabling telemetry by default", () => {
  assert.match(loadBenchmark, /REPORT_CARD_LOAD_INCLUDE_HEALTH === "YES"/);
  assert.match(loadBenchmark, /health=1/);
  assert.match(loadBenchmark, /healthAfter:/);
});
