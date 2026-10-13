import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PRODUCTION_PROJECT_REF } from "../e2e/support/env-guard.mjs";
import {
  StagingSeedError,
  isApprovedStagingTarget,
  resolveStagingSeedIdentity,
  resolveStagingManagementTarget,
} from "../e2e/support/staging-seed-guard.mjs";
import {
  BASELINE,
  BASELINE_CALENDAR_ROUTINES,
  REQUIRED_APP_PRIVATE_FUNCTIONS,
  REQUIRED_MIGRATION_VERSIONS,
  REQUIRED_TABLES,
  applyApprovedStagingBaseline,
  assertBaselinePresent,
  assertSchemaReady,
  buildBaselineSql,
  runStagingBaselineBootstrap,
  verifyStagingPrerequisites,
} from "../e2e/support/staging-baseline.mjs";

const STAGING_REF = "abcdefghijklmnopqrst"; // exactly 20 chars
const SEED_SQL = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../supabase/seed.sql"),
  "utf8",
);

function identityEnv(overrides = {}) {
  return {
    SCOLAPRO_E2E_SYNTHETIC_ONLY: "1",
    SCOLAPRO_E2E_APPROVED_STAGING_REFS: STAGING_REF,
    SCOLAPRO_E2E_SUPABASE_PROJECT_REF: STAGING_REF,
    STAGING_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
    ...overrides,
  };
}

function recordingFetch({ ok = true, status = 200, body = [], textBody = "" } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok, status, json: async () => body, text: async () => textBody };
  };
  return { fetchImpl, calls };
}

const COMPLETE_PREREQS = [
  { versions: [...REQUIRED_MIGRATION_VERSIONS], functions: [...REQUIRED_APP_PRIVATE_FUNCTIONS] },
];

// ---------------------------------------------------------------------------
// Baseline SQL: deterministic, idempotent, and in parity with supabase/seed.sql
// ---------------------------------------------------------------------------

test("baseline SQL is deterministic and idempotent", () => {
  const first = buildBaselineSql();
  const second = buildBaselineSql();
  assert.equal(first, second, "identical input must yield identical SQL");

  const inserts = first.match(/insert into public\.\w+/g) ?? [];
  const conflicts = first.match(/on conflict \(id\) do nothing;/g) ?? [];
  assert.ok(inserts.length >= 6, "expected an insert per baseline table");
  assert.equal(conflicts.length, inserts.length, "every insert must be idempotent");
});

test("baseline SQL stays in parity with supabase/seed.sql", () => {
  const sql = buildBaselineSql();
  const ids = [
    BASELINE.tenant.id,
    BASELINE.school.id,
    ...BASELINE.grades.map((grade) => grade.id),
    ...BASELINE.registerClasses.map((klass) => klass.id),
    ...BASELINE.learners.map((learner) => learner.id),
    ...BASELINE.enrolments.map((enrolment) => enrolment.id),
  ];
  for (const id of ids) {
    assert.ok(sql.includes(id), `baseline SQL must contain ${id}`);
    assert.ok(SEED_SQL.includes(id), `supabase/seed.sql must contain ${id} (parity)`);
  }
  for (const routine of BASELINE_CALENDAR_ROUTINES) {
    assert.ok(sql.includes(routine), `baseline SQL must call ${routine}`);
    assert.ok(SEED_SQL.includes(routine), `supabase/seed.sql must call ${routine} (parity)`);
  }
});

// ---------------------------------------------------------------------------
// Fake PostgREST client for exact-row verification
// ---------------------------------------------------------------------------

function baselineRows() {
  return {
    tenants: { [BASELINE.tenant.id]: { ...BASELINE.tenant } },
    schools: { [BASELINE.school.id]: { ...BASELINE.school } },
    grades: Object.fromEntries(
      BASELINE.grades.map((grade) => [
        grade.id,
        { tenant_id: BASELINE.tenant.id, school_id: BASELINE.school.id, ...grade },
      ]),
    ),
    register_classes: Object.fromEntries(
      BASELINE.registerClasses.map((klass) => [
        klass.id,
        { tenant_id: BASELINE.tenant.id, school_id: BASELINE.school.id, ...klass },
      ]),
    ),
    learners: Object.fromEntries(
      BASELINE.learners.map((learner) => [learner.id, { tenant_id: BASELINE.tenant.id, ...learner }]),
    ),
    enrolments: Object.fromEntries(
      BASELINE.enrolments.map((enrolment) => [
        enrolment.id,
        { tenant_id: BASELINE.tenant.id, school_id: BASELINE.school.id, ...enrolment },
      ]),
    ),
  };
}

function fakeClient({ missingTable = null, remove = [], patch = [] } = {}) {
  const rows = baselineRows();
  for (const [table, id] of remove) delete rows[table]?.[id];
  for (const [table, id, changes] of patch) {
    if (rows[table]?.[id]) Object.assign(rows[table][id], changes);
  }

  function query(table) {
    let idFilter = null;
    const api = {
      select() {
        return api;
      },
      eq(column, value) {
        if (column === "id") idFilter = value;
        return api;
      },
      maybeSingle() {
        const row = idFilter ? rows[table]?.[idFilter] : null;
        return { data: row ? { ...row } : null, error: null };
      },
      then(resolve) {
        if (missingTable === table) {
          return Promise.resolve({ error: { message: "relation does not exist" } }).then(resolve);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };
    return api;
  }
  return { from: (table) => query(table) };
}

test("schema preflight passes when every required table is queryable", async () => {
  await assert.doesNotReject(() => assertSchemaReady(fakeClient()));
  assert.ok(REQUIRED_TABLES.includes("school_memberships"));
});

test("schema preflight fails explicitly when a migration is missing", async () => {
  await assert.rejects(
    () => assertSchemaReady(fakeClient({ missingTable: "school_memberships" })),
    (error) => error instanceof StagingSeedError && /school_memberships/.test(error.message),
  );
});

// ---------------------------------------------------------------------------
// Exact synthetic-row verification (collision detection)
// ---------------------------------------------------------------------------

test("baseline verification passes for an exact synthetic baseline", async () => {
  await assert.doesNotReject(() => assertBaselinePresent(fakeClient()));
});

test("baseline verification fails when the demo school is missing", async () => {
  await assert.rejects(
    () => assertBaselinePresent(fakeClient({ remove: [["schools", BASELINE.school.id]] })),
    (error) => error instanceof StagingSeedError && /missing/i.test(error.message),
  );
});

test("baseline verification fails when a demo register class is missing", async () => {
  await assert.rejects(
    () => assertBaselinePresent(fakeClient({ remove: [["register_classes", BASELINE.registerClasses[1].id]] })),
    (error) => error instanceof StagingSeedError && /missing/i.test(error.message),
  );
});

test("baseline verification fails on a non-synthetic collision", async () => {
  await assert.rejects(
    () =>
      assertBaselinePresent(
        fakeClient({ patch: [["schools", BASELINE.school.id, { name: "Real School" }]] }),
      ),
    (error) => error instanceof StagingSeedError && /collision/i.test(error.message),
  );
});

// ---------------------------------------------------------------------------
// Privileged write surface: no arbitrary SQL, branded target only
// ---------------------------------------------------------------------------

test("baseline applier refuses a hand-built target without making a request", async () => {
  const { fetchImpl, calls } = recordingFetch();
  await assert.rejects(
    () =>
      applyApprovedStagingBaseline({
        target: { projectRef: STAGING_REF, accessToken: "token" },
        fetchImpl,
      }),
    StagingSeedError,
  );
  assert.equal(calls.length, 0);
});

test("baseline applier refuses an unbranded production target without a request", async () => {
  const { fetchImpl, calls } = recordingFetch();
  await assert.rejects(
    () =>
      applyApprovedStagingBaseline({
        target: { projectRef: PRODUCTION_PROJECT_REF, accessToken: "token" },
        fetchImpl,
      }),
    StagingSeedError,
  );
  assert.equal(calls.length, 0);
});

test("baseline applier ignores caller-supplied SQL (never an arbitrary executor)", async () => {
  const { fetchImpl, calls } = recordingFetch();
  const target = resolveStagingManagementTarget(identityEnv({ SUPABASE_ACCESS_TOKEN: "token" }));
  await applyApprovedStagingBaseline({
    target,
    sql: "drop table public.learners;",
    fetchImpl,
  });
  assert.equal(calls.length, 1);
  const posted = JSON.parse(calls[0].init.body).query;
  assert.equal(posted, buildBaselineSql());
  assert.ok(!posted.includes("drop table"), "caller SQL must never be executed");
});

// ---------------------------------------------------------------------------
// Version/function preflight
// ---------------------------------------------------------------------------

test("prerequisite preflight passes when versions and functions are present", async () => {
  const { fetchImpl } = recordingFetch({ body: COMPLETE_PREREQS });
  const target = resolveStagingManagementTarget(identityEnv({ SUPABASE_ACCESS_TOKEN: "token" }));
  await assert.doesNotReject(() => verifyStagingPrerequisites({ target, fetchImpl }));
});

test("prerequisite preflight fails on a missing migration version", async () => {
  const { fetchImpl } = recordingFetch({
    body: [{ versions: [REQUIRED_MIGRATION_VERSIONS[0]], functions: [...REQUIRED_APP_PRIVATE_FUNCTIONS] }],
  });
  const target = resolveStagingManagementTarget(identityEnv({ SUPABASE_ACCESS_TOKEN: "token" }));
  await assert.rejects(
    () => verifyStagingPrerequisites({ target, fetchImpl }),
    (error) => error instanceof StagingSeedError && /migration version/i.test(error.message),
  );
});

test("prerequisite preflight fails on a missing function", async () => {
  const { fetchImpl } = recordingFetch({
    body: [{ versions: [...REQUIRED_MIGRATION_VERSIONS], functions: [] }],
  });
  const target = resolveStagingManagementTarget(identityEnv({ SUPABASE_ACCESS_TOKEN: "token" }));
  await assert.rejects(
    () => verifyStagingPrerequisites({ target, fetchImpl }),
    (error) => error instanceof StagingSeedError && /function/i.test(error.message),
  );
});

// ---------------------------------------------------------------------------
// Sanitized Management-API failures
// ---------------------------------------------------------------------------

test("management API failures are sanitized and never echo the response body", async () => {
  const secret = "sb_secret_leaky_token_value";
  const { fetchImpl } = recordingFetch({ ok: false, status: 500, textBody: `boom ${secret} drop table x` });
  const target = resolveStagingManagementTarget(identityEnv({ SUPABASE_ACCESS_TOKEN: "token" }));
  await assert.rejects(
    () => applyApprovedStagingBaseline({ target, fetchImpl }),
    (error) => {
      assert.ok(error instanceof StagingSeedError);
      assert.match(error.message, /HTTP 500/);
      assert.ok(!error.message.includes(secret), "must not leak secrets");
      assert.ok(!/drop table/.test(error.message), "must not leak SQL fragments");
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Guarded orchestration: every denied path makes zero requests
// ---------------------------------------------------------------------------

test("bootstrap makes zero requests for denied environments", async () => {
  const denied = [
    identityEnv({
      SCOLAPRO_E2E_SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF,
      STAGING_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
      SUPABASE_ACCESS_TOKEN: "token",
    }),
    identityEnv({ SCOLAPRO_E2E_APPROVED_STAGING_REFS: "", SUPABASE_ACCESS_TOKEN: "token" }), // no allowlist
    identityEnv({ SCOLAPRO_E2E_APPROVED_STAGING_REFS: "zyxwvutsrqponmlkjihg", SUPABASE_ACCESS_TOKEN: "token" }),
    identityEnv({ SCOLAPRO_E2E_APPROVED_STAGING_REFS: `${STAGING_REF},not-a-ref`, SUPABASE_ACCESS_TOKEN: "token" }), // malformed allowlist entry
    identityEnv({ SCOLAPRO_E2E_APPROVED_STAGING_REFS: `${STAGING_REF},${PRODUCTION_PROJECT_REF}`, SUPABASE_ACCESS_TOKEN: "token" }), // production-tainted allowlist
    identityEnv({ SCOLAPRO_E2E_SYNTHETIC_ONLY: "0", SUPABASE_ACCESS_TOKEN: "token" }),
    identityEnv(), // missing access token
  ];
  for (const env of denied) {
    const { fetchImpl, calls } = recordingFetch();
    await assert.rejects(() => runStagingBaselineBootstrap({ env, fetchImpl }));
    assert.equal(calls.length, 0, `no request may be issued for ${JSON.stringify(env.SCOLAPRO_E2E_SUPABASE_PROJECT_REF)}`);
  }
});

const isWriteRequest = (call) => {
  try {
    return /insert into public\./.test(JSON.parse(call.init.body).query);
  } catch {
    return false;
  }
};

test("bootstrap issues a read-only preflight before the single baseline write", async () => {
  const { fetchImpl, calls } = recordingFetch({ body: COMPLETE_PREREQS });
  await runStagingBaselineBootstrap({
    env: identityEnv({ SUPABASE_ACCESS_TOKEN: "token" }),
    fetchImpl,
    log: () => {},
  });
  assert.equal(calls.length, 2, "expected a read-only preflight then a single baseline apply");
  for (const call of calls) {
    assert.match(call.url, new RegExp(`/projects/${STAGING_REF}/database/query$`));
    assert.ok(!call.url.includes(PRODUCTION_PROJECT_REF));
  }

  const preflightQuery = JSON.parse(calls[0].init.body).query;
  assert.match(preflightQuery, /supabase_migrations\.schema_migrations/);
  assert.ok(!isWriteRequest(calls[0]), "the preflight must be read-only");

  assert.equal(JSON.parse(calls[1].init.body).query, buildBaselineSql(), "the write must be the static generated SQL");
});

test("a failed preflight issues zero write requests", async () => {
  const cases = [
    { name: "missing migration version", options: { body: [{ versions: [REQUIRED_MIGRATION_VERSIONS[0]], functions: [...REQUIRED_APP_PRIVATE_FUNCTIONS] }] } },
    { name: "missing function", options: { body: [{ versions: [...REQUIRED_MIGRATION_VERSIONS], functions: [] }] } },
    { name: "malformed body", options: { body: { unexpected: true } } },
    { name: "denied token", options: { ok: false, status: 403, textBody: "forbidden" } },
  ];
  for (const scenario of cases) {
    const { fetchImpl, calls } = recordingFetch(scenario.options);
    await assert.rejects(
      () => runStagingBaselineBootstrap({ env: identityEnv({ SUPABASE_ACCESS_TOKEN: "token" }), fetchImpl, log: () => {} }),
      StagingSeedError,
      scenario.name,
    );
    assert.equal(calls.filter(isWriteRequest).length, 0, `no write may occur when the preflight fails (${scenario.name})`);
  }
});

test("a rejected token is sanitized on the preflight path", async () => {
  const secret = "sb_secret_stale_token";
  const { fetchImpl } = recordingFetch({ ok: false, status: 401, textBody: `denied ${secret} insert into public.learners` });
  const target = resolveStagingManagementTarget(identityEnv({ SUPABASE_ACCESS_TOKEN: "token" }));
  await assert.rejects(
    () => verifyStagingPrerequisites({ target, fetchImpl }),
    (error) => {
      assert.ok(error instanceof StagingSeedError);
      assert.match(error.message, /HTTP 401/);
      assert.ok(!error.message.includes(secret), "must not leak the token");
      assert.ok(!/insert into/.test(error.message), "must not leak SQL");
      return true;
    },
  );
});

test("generated baseline SQL contains only the fixed synthetic identifiers", () => {
  const fixtureIds = new Set([
    BASELINE.tenant.id,
    BASELINE.school.id,
    ...BASELINE.grades.map((grade) => grade.id),
    ...BASELINE.registerClasses.map((klass) => klass.id),
    ...BASELINE.learners.map((learner) => learner.id),
    ...BASELINE.enrolments.map((enrolment) => enrolment.id),
  ]);
  const sqlIds = new Set(
    buildBaselineSql().match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [],
  );
  assert.deepEqual([...sqlIds].sort(), [...fixtureIds].sort());
});

test("baseline verification fails on learner and enrolment collisions", async () => {
  await assert.rejects(
    () => assertBaselinePresent(fakeClient({ patch: [["learners", BASELINE.learners[0].id, { surname: "Real" }]] })),
    (error) => error instanceof StagingSeedError && /collision/i.test(error.message),
  );
  await assert.rejects(
    () => assertBaselinePresent(fakeClient({ patch: [["enrolments", BASELINE.enrolments[0].id, { admission_number: "REAL-1" }]] })),
    (error) => error instanceof StagingSeedError && /collision/i.test(error.message),
  );
});

// ---------------------------------------------------------------------------
// Identity resolver: --check reads no secret
// ---------------------------------------------------------------------------

test("identity resolves from non-secret environment only", () => {
  const identity = resolveStagingSeedIdentity(identityEnv());
  assert.equal(identity.projectRef, STAGING_REF);
  assert.equal(identity.production, false);
});

test("identity refuses production refs and ambiguous identities", () => {
  assert.throws(
    () => resolveStagingSeedIdentity(identityEnv({ SCOLAPRO_E2E_SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF })),
    StagingSeedError,
  );
  assert.throws(
    () => resolveStagingSeedIdentity(identityEnv({ STAGING_PROJECT_ID: "zyxwvutsrqponmlkjihg" })),
    StagingSeedError,
  );
});

test("management target requires an access token and refuses production", () => {
  assert.throws(
    () => resolveStagingManagementTarget(identityEnv()),
    (error) => error instanceof StagingSeedError && /SUPABASE_ACCESS_TOKEN/.test(error.message),
  );
  assert.throws(
    () =>
      resolveStagingManagementTarget(
        identityEnv({ SCOLAPRO_E2E_SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF, SUPABASE_ACCESS_TOKEN: "token" }),
      ),
    StagingSeedError,
  );
});

test("approved management targets are branded", () => {
  const target = resolveStagingManagementTarget(identityEnv({ SUPABASE_ACCESS_TOKEN: "token" }));
  assert.equal(isApprovedStagingTarget(target), true);
});
