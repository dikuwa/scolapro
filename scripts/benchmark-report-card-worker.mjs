import { boundedInteger, requireLoopbackUrl } from "./lib/localhost-only.mjs";

const url = process.env.REPORT_CARD_WORKER_URL?.trim();
const secret = process.env.INTERNAL_JOB_RUNNER_SECRET?.trim();
const armed = process.env.REPORT_CARD_LOAD_TEST_ARMED === "YES";
const concurrency = boundedInteger(process.env.REPORT_CARD_LOAD_CONCURRENCY, {
  fallback: 4,
  minimum: 1,
  maximum: 12,
  label: "REPORT_CARD_LOAD_CONCURRENCY",
});
const rounds = boundedInteger(process.env.REPORT_CARD_LOAD_ROUNDS, {
  fallback: 5,
  minimum: 1,
  maximum: 50,
  label: "REPORT_CARD_LOAD_ROUNDS",
});
const includeHealth = process.env.REPORT_CARD_LOAD_INCLUDE_HEALTH === "YES";
const localOnly = process.env.REPORT_CARD_LOAD_LOCAL_ONLY === "YES";

if (!armed) {
  console.error("Refusing to run: set REPORT_CARD_LOAD_TEST_ARMED=YES explicitly.");
  process.exit(2);
}
if (!url || !secret) {
  console.error("REPORT_CARD_WORKER_URL and INTERNAL_JOB_RUNNER_SECRET are required.");
  process.exit(2);
}
try {
  const workerUrl = new URL(url);
  if (localOnly) {
    requireLoopbackUrl(url, {
      label: "Local load benchmark REPORT_CARD_WORKER_URL",
      protocols: ["http:", "https:"],
    });
  } else if (workerUrl.protocol !== "https:") {
    throw new Error("REPORT_CARD_WORKER_URL must use https://.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
}

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
};

async function invoke(token = secret) {
  const started = performance.now();
  const endpoint = includeHealth
    ? `${url}${url.includes("?") ? "&" : "?"}health=1`
    : url;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "scolapro-report-card-load-benchmark",
    },
    signal: AbortSignal.timeout(58_000),
  });
  const durationMs = performance.now() - started;
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, ok: response.ok, durationMs, body };
}

let failureProbeStatus = null;
if (process.env.REPORT_CARD_LOAD_FAILURE_PROBE === "YES") {
  const failed = await invoke("intentional-invalid-load-test-token");
  if (failed.status !== 401) {
    console.error(`Failure probe expected 401 but received ${failed.status}.`);
    process.exit(1);
  }
  failureProbeStatus = failed.status;
}

const results = [];
const startedAt = performance.now();

for (let round = 0; round < rounds; round += 1) {
  const wave = await Promise.all(Array.from({ length: concurrency }, () => invoke()));
  results.push(...wave);
}

const wallMs = performance.now() - startedAt;
const durations = results.map((result) => result.durationMs);
const successes = results.filter((result) => result.ok);
const failures = results.filter((result) => !result.ok);
const recovered = results[0] ?? null;
const queueTotals = successes.reduce(
  (totals, result) => {
    const body = result.body ?? {};
    totals.batchProcessed += Number(body.batch?.processed ?? 0);
    totals.renderClaimed += Number(body.render?.claimed ?? 0);
    totals.renderCompleted += Number(body.render?.completed ?? 0);
    totals.renderFailed += Number(body.render?.failed ?? 0);
    totals.exportsCompleted += Number(body.export?.completed ?? 0);
    totals.exportsFailed += Number(body.export?.failed ?? 0);
    return totals;
  },
  {
    batchProcessed: 0,
    renderClaimed: 0,
    renderCompleted: 0,
    renderFailed: 0,
    exportsCompleted: 0,
    exportsFailed: 0,
  },
);

const summary = {
  mode: localOnly ? "local-only" : "remote",
  requests: results.length,
  concurrency,
  rounds,
  successRate: results.length ? successes.length / results.length : 0,
  wallMs: Number(wallMs.toFixed(1)),
  requestsPerSecond: wallMs > 0 ? Number(((results.length * 1000) / wallMs).toFixed(2)) : 0,
  renderedJobsPerSecond: wallMs > 0
    ? Number(((queueTotals.renderCompleted * 1000) / wallMs).toFixed(2))
    : 0,
  latencyMs: {
    min: Number(Math.min(...durations).toFixed(1)),
    p50: Number(percentile(durations, 50).toFixed(1)),
    p95: Number(percentile(durations, 95).toFixed(1)),
    max: Number(Math.max(...durations).toFixed(1)),
  },
  httpFailures: failures.map((result) => result.status),
  failureRecoveryProbe: failureProbeStatus === null ? null : {
    failureStatus: failureProbeStatus,
    recoveredStatus: recovered?.status ?? null,
    recovered: Boolean(recovered?.ok),
  },
  queueTotals,
  healthAfter: successes.findLast((result) => result.body?.healthAfter)?.body?.healthAfter ?? null,
};

console.log(JSON.stringify(summary, null, 2));

if (failures.length) process.exit(1);
if (failureProbeStatus !== null && !recovered?.ok) process.exit(1);
