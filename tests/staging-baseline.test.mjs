import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PRODUCTION_PROJECT_REF } from "../e2e/support/env-guard.mjs";
import {
  StagingSeedError,
  resolveStagingSeedIdentity,
  resolveStagingManagementTarget,
} from "../e2e/support/staging-seed-guard.mjs";
import {
  BASELINE,
  BASELINE_CALENDAR_ROUTINES,
  REQUIRED_TABLES,
  applyBaselineViaManagementApi,
  assertBaselinePresent,
  assertSchemaReady,
  buildBaselineSql,
  runStagingBaselineBootstrap,
} from "../e2e/support/staging-baseline.mjs";

const STAGING_REF = "abcdefghijklmnopqrst"; // exactly 20 chars
const SEED_SQL = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../supabase/seed.sql"),
  "utf8",
);

function identityEnv(overrides = {}) {
  return {
    SCOLAPRO_E2E_SYNTHETIC_ONLY: "1",
    SCOLAPRO_E2E_SUPABASE_PROJECT_REF: STAGING_REF,
    STAGING_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
    ...overrides,
  };
}

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
// Read-only verification: explicit errors when the schema or baseline is absent
// ---------------------------------------------------------------------------

function fakeClient({ school = BASELINE.school, classes = null, enrolmentCount = 2, missingTable = null } = {}) {
  const presentClasses = classes ?? BASELINE.registerClasses;
  function query(table) {
    const api = {
      select() {
        return api;
      },
      eq() {
        return api;
      },
      in() {
        return api;
      },
      maybeSingle() {
        return { data: table === "schools" ? school : null, error: null };
      },
      then(resolve) {
        if (missingTable === table) {
          return Promise.resolve({ error: { message: "relation does not exist" } }).then(resolve);
        }
        if (table === "register_classes") {
          return Promise.resolve({ data: presentClasses.map((klass) => ({ id: klass.id })), error: null }).then(resolve);
        }
        if (table === "enrolments") {
          return Promise.resolve({ data: null, count: enrolmentCount, error: null }).then(resolve);
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

test("baseline verification fails when the demo school is missing", async () => {
  await assert.rejects(
    () => assertBaselinePresent(fakeClient({ school: null })),
    (error) => error instanceof StagingSeedError && /demo school/i.test(error.message),
  );
});

test("baseline verification fails when a demo register class is missing", async () => {
  await assert.rejects(
    () => assertBaselinePresent(fakeClient({ classes: [BASELINE.registerClasses[0]] })),
    (error) => error instanceof StagingSeedError && /register class/i.test(error.message),
  );
});

test("baseline verification fails when demo enrolments are absent", async () => {
  await assert.rejects(
    () => assertBaselinePresent(fakeClient({ enrolmentCount: 0 })),
    (error) => error instanceof StagingSeedError && /enrolment/i.test(error.message),
  );
});

test("baseline verification passes for a complete baseline", async () => {
  await assert.doesNotReject(() => assertBaselinePresent(fakeClient()));
});

// ---------------------------------------------------------------------------
// Write entrypoints: refuse before any network call on denied cases
// ---------------------------------------------------------------------------

test("baseline SQL applier refuses the production ref without calling fetch", async () => {
  let called = 0;
  const fetchImpl = async () => {
    called += 1;
    return { ok: true, json: async () => ({}) };
  };
  await assert.rejects(
    () =>
      applyBaselineViaManagementApi({
        projectRef: PRODUCTION_PROJECT_REF,
        accessToken: "token",
        sql: "select 1;",
        fetchImpl,
      }),
    StagingSeedError,
  );
  assert.equal(called, 0, "no request may be issued for a production ref");
});

test("baseline SQL applier refuses a missing access token", async () => {
  await assert.rejects(
    () => applyBaselineViaManagementApi({ projectRef: STAGING_REF, accessToken: "", sql: "select 1;", fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }),
    StagingSeedError,
  );
});

test("bootstrap refuses production identifiers before any write", async () => {
  let called = 0;
  const fetchImpl = async () => {
    called += 1;
    return { ok: true, json: async () => ({}) };
  };
  await assert.rejects(
    () =>
      runStagingBaselineBootstrap({
        env: identityEnv({
          SCOLAPRO_E2E_SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF,
          STAGING_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
          SUPABASE_ACCESS_TOKEN: "token",
        }),
        fetchImpl,
      }),
    StagingSeedError,
  );
  assert.equal(called, 0, "no unauthorized write may occur on a denied case");
});

test("bootstrap applies deterministic SQL to the guarded staging ref only", async () => {
  let captured = null;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return { ok: true, json: async () => ({}) };
  };
  await runStagingBaselineBootstrap({
    env: identityEnv({ SUPABASE_ACCESS_TOKEN: "token" }),
    fetchImpl,
    log: () => {},
  });

  assert.ok(captured, "a request should be issued for a valid staging target");
  assert.match(captured.url, new RegExp(`/projects/${STAGING_REF}/database/query$`));
  assert.ok(!captured.url.includes(PRODUCTION_PROJECT_REF), "must never target production");
  const body = JSON.parse(captured.init.body);
  assert.match(body.query, /insert into public\.tenants/);
  assert.match(body.query, /insert into public\.register_classes/);
});

// ---------------------------------------------------------------------------
// Identity resolver: --check reads no secret
// ---------------------------------------------------------------------------

test("identity resolves from non-secret environment only", () => {
  const identity = resolveStagingSeedIdentity(identityEnv());
  assert.equal(identity.projectRef, STAGING_REF);
  // No secret-bearing keys are present in the environment above.
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
  assert.throws(
    () => resolveStagingSeedIdentity(identityEnv({ SCOLAPRO_E2E_SYNTHETIC_ONLY: "0" })),
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
