const url = process.env.REPORT_CARD_WORKER_URL?.trim();
const secret = process.env.INTERNAL_JOB_RUNNER_SECRET?.trim();
const armed = process.env.REPORT_CARD_LOAD_TEST_ARMED === "YES";
const concurrency = Math.max(1, Math.min(Number(process.env.REPORT_CARD_LOAD_CONCURRENCY ?? 4), 12));
const rounds = Math.max(1, Math.min(Number(process.env.REPORT_CARD_LOAD_ROUNDS ?? 5), 50));
const includeHealth = process.env.REPORT_CARD_LOAD_INCLUDE_HEALTH === "YES";

if (!armed) {
  console.error("Refusing to run: set REPORT_CARD_LOAD_TEST_ARMED=YES explicitly.");
  process.exit(2);
}
if (!url || !secret) {
  console.error("REPORT_CARD_WORKER_URL and INTERNAL_JOB_RUNNER_SECRET are required.");
  process.exit(2);
}
if (!url.startsWith("https://")) {
  console.error("REPORT_CARD_WORKER_URL must use https://");
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

if (process.env.REPORT_CARD_LOAD_FAILURE_PROBE === "YES") {
  const failed = await invoke("intentional-invalid-load-test-token");
  if (failed.status !== 401) {
    console.error(`Failure probe expected 401 but received ${failed.status}.`);
    process.exit(1);
  }
  const recovered = await invoke();
  if (!recovered.ok) {
    console.error(`Recovery probe failed with HTTP ${recovered.status}.`);
    process.exit(1);
  }
  console.log(`Failure recovery probe: 401 -> ${recovered.status} in ${recovered.durationMs.toFixed(1)} ms`);
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
  requests: results.length,
  concurrency,
  rounds,
  successRate: results.length ? successes.length / results.length : 0,
  wallMs: Number(wallMs.toFixed(1)),
  requestsPerSecond: wallMs > 0 ? Number(((results.length * 1000) / wallMs).toFixed(2)) : 0,
  latencyMs: {
    min: Number(Math.min(...durations).toFixed(1)),
    p50: Number(percentile(durations, 50).toFixed(1)),
    p95: Number(percentile(durations, 95).toFixed(1)),
    max: Number(Math.max(...durations).toFixed(1)),
  },
  httpFailures: failures.map((result) => result.status),
  queueTotals,
  healthAfter: successes.findLast((result) => result.body?.healthAfter)?.body?.healthAfter ?? null,
};

console.log(JSON.stringify(summary, null, 2));

if (failures.length) process.exit(1);
