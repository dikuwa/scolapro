import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { boundedInteger, requireLoopbackUrl } from "../scripts/lib/localhost-only.mjs";

const benchmark = readFileSync("scripts/benchmark-report-card-worker.mjs", "utf8");
const fixture = readFileSync("scripts/local-report-card-load-fixture.mjs", "utf8");
const runner = readFileSync("scripts/run-local-report-card-load-benchmark.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

test("remote benchmark remains https-only while local mode is loopback-only", () => {
  assert.match(benchmark, /REPORT_CARD_LOAD_LOCAL_ONLY === "YES"/);
  assert.match(benchmark, /requireLoopbackUrl/);
  assert.match(benchmark, /workerUrl\.protocol !== "https:"/);
  assert.match(benchmark, /mode: localOnly \? "local-only" : "remote"/);
});

test("local fixture is explicitly armed and refuses non-loopback Supabase", () => {
  assert.match(fixture, /REPORT_CARD_LOAD_TEST_ARMED !== "YES"/);
  assert.match(fixture, /Refusing to \$\{ACTION\} local load fixture/);
  assert.match(fixture, /requireLoopbackUrl\(status\.API_URL/);
  assert.match(fixture, /requireLoopbackUrl\(status\.DB_URL/);
  assert.match(fixture, /SCHOOL_COUNT = 3/);
  assert.match(fixture, /LEARNERS_PER_SCHOOL = 12/);
});

test("local fixture creates canonical snapshots and both HTML and PDF render jobs", () => {
  assert.match(fixture, /report_card_snapshots/);
  assert.match(fixture, /queue_report_card_render/);
  assert.match(fixture, /for \(const format of \["html", "pdf"\]\)/);
  assert.match(fixture, /template_version: TEMPLATE_VERSION/);
  assert.match(fixture, /status: "certified"/);
  assert.match(fixture, /requireExclusiveLocalRenderQueue/);
  assert.match(fixture, /Refusing to mix the benchmark/);
});

test("local fixture verification proves all schools drain exactly once", () => {
  assert.match(fixture, /duplicateJobIdentities/);
  assert.match(fixture, /duplicateOutputDocumentIds/);
  assert.match(fixture, /exactlyOnce/);
  assert.match(fixture, /completionStateValid/);
  assert.match(fixture, /outputsMatch/);
  assert.match(fixture, /active !== 0/);
  assert.match(fixture, /perSchool\.some/);
  assert.match(fixture, /school\.completed !== LEARNERS_PER_SCHOOL \* 2/);
});

test("local runner prepares benchmarks verifies and cleans benchmark-owned data", () => {
  assert.match(runner, /requireLoopbackUrl/);
  assert.match(runner, /run\(fixture, \["prepare"\]\)/);
  assert.match(runner, /REPORT_CARD_LOAD_LOCAL_ONLY: "YES"/);
  assert.match(runner, /run\(fixture, \["verify"\]\)/);
  assert.match(runner, /run\(fixture, \["cleanup"\]\)/);
  assert.equal(packageJson.scripts["bench:report-cards:local"], "node scripts/run-local-report-card-load-benchmark.mjs");
});

test("cleanup uses the Storage API and limits the immutable-fixture bypass to one transaction", () => {
  assert.match(fixture, /\.from\("report-card-artifacts"\)\s*\.remove\(artifactPaths\)/);
  assert.match(fixture, /set local session_replication_role=replica/);
  assert.doesNotMatch(fixture, /delete from storage\.objects/);
  assert.match(fixture, /Benchmark-owned cleanup did not complete/);
});

test("localhost guard accepts only explicit loopback hosts and expected protocols", () => {
  assert.equal(requireLoopbackUrl("http://127.0.0.1:3000/worker", {
    label: "worker",
    protocols: ["http:", "https:"],
  }).hostname, "127.0.0.1");
  assert.equal(requireLoopbackUrl("postgresql://postgres@localhost:5432/postgres", {
    label: "database",
    protocols: ["postgres:", "postgresql:"],
  }).hostname, "localhost");
  assert.throws(() => requireLoopbackUrl("https://example.com/worker", {
    label: "worker",
    protocols: ["http:", "https:"],
  }), /must use a loopback host/);
  assert.throws(() => requireLoopbackUrl("mysql://localhost/database", {
    label: "database",
    protocols: ["postgres:", "postgresql:"],
  }), /must use postgres: or postgresql:/);
});

test("benchmark concurrency and rounds reject invalid values instead of producing NaN", () => {
  assert.equal(boundedInteger(undefined, {
    fallback: 4,
    minimum: 1,
    maximum: 12,
    label: "concurrency",
  }), 4);
  assert.throws(() => boundedInteger("many", {
    fallback: 4,
    minimum: 1,
    maximum: 12,
    label: "concurrency",
  }), /must be an integer/);
});

test("benchmark records job throughput and includes recovery work in measured requests", () => {
  assert.match(benchmark, /renderedJobsPerSecond/);
  assert.match(benchmark, /failureRecoveryProbe/);
  assert.doesNotMatch(benchmark, /const recovered = await invoke\(\)/);
});
