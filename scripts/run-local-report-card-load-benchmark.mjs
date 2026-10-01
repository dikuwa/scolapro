import { execFileSync } from "node:child_process";
import { requireLoopbackUrl } from "./lib/localhost-only.mjs";

const workerUrl = process.env.REPORT_CARD_WORKER_URL?.trim();
const secret = process.env.INTERNAL_JOB_RUNNER_SECRET?.trim();
const armed = process.env.REPORT_CARD_LOAD_TEST_ARMED === "YES";
const keepFixture = process.env.REPORT_CARD_LOAD_KEEP_FIXTURE === "YES";

function fail(message) {
  console.error(message);
  process.exit(2);
}

if (!armed) fail("Refusing to run: set REPORT_CARD_LOAD_TEST_ARMED=YES explicitly.");
if (!workerUrl || !secret) fail("REPORT_CARD_WORKER_URL and INTERNAL_JOB_RUNNER_SECRET are required.");

try {
  requireLoopbackUrl(workerUrl, {
    label: "Local report-card benchmark worker URL",
    protocols: ["http:", "https:"],
  });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const node = process.execPath;
const fixture = "scripts/local-report-card-load-fixture.mjs";
const benchmark = "scripts/benchmark-report-card-worker.mjs";

function run(script, args = [], extraEnv = {}) {
  execFileSync(node, [script, ...args], {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
}

let benchmarkSucceeded = false;
try {
  run(fixture, ["prepare"]);
  run(benchmark, [], {
    REPORT_CARD_LOAD_LOCAL_ONLY: "YES",
    REPORT_CARD_LOAD_FAILURE_PROBE: process.env.REPORT_CARD_LOAD_FAILURE_PROBE ?? "YES",
    REPORT_CARD_LOAD_INCLUDE_HEALTH: process.env.REPORT_CARD_LOAD_INCLUDE_HEALTH ?? "YES",
  });
  run(fixture, ["verify"]);
  benchmarkSucceeded = true;
} finally {
  if (!keepFixture) {
    try {
      run(fixture, ["cleanup"]);
    } catch (error) {
      console.error("Local report-card fixture cleanup failed.");
      if (benchmarkSucceeded) throw error;
    }
  }
}
