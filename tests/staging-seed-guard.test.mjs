import { test } from "node:test";
import assert from "node:assert/strict";
import {
  StagingSeedError,
  isApprovedStagingTarget,
  resolveStagingSeedTarget,
  resolveStagingManagementTarget,
  stagingSeedRejection,
  supabaseRefFromKey,
} from "../e2e/support/staging-seed-guard.mjs";
import { PRODUCTION_PROJECT_REF } from "../e2e/support/env-guard.mjs";
import { DEMO, OUTSIDER_TENANT, SYNTHETIC_ACCOUNTS } from "../e2e/support/accounts.mjs";
import { seedSyntheticWorld } from "../e2e/support/seed-world.mjs";

const STAGING_REF = "abcdefghijklmnopqrst"; // exactly 20 chars
const PASSWORD = "LocalE2ePassword2026";

function validEnv(overrides = {}) {
  return {
    SCOLAPRO_E2E_SYNTHETIC_ONLY: "1",
    SCOLAPRO_E2E_APPROVED_STAGING_REFS: STAGING_REF,
    SCOLAPRO_E2E_SUPABASE_PROJECT_REF: STAGING_REF,
    STAGING_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
    STAGING_SUPABASE_SERVICE_ROLE_KEY: "sb_secret_staging_example_value",
    SCOLAPRO_E2E_PASSWORD: PASSWORD,
    ...overrides,
  };
}

/** Builds a legacy-style Supabase JWT carrying the given project ref. */
function jwtKeyForRef(ref) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: "supabase", ref, role: "service_role" })).toString("base64url");
  return `${header}.${payload}.signature`;
}

// ---------------------------------------------------------------------------
// Guard: accepts a valid, isolated, synthetic-only staging target
// ---------------------------------------------------------------------------

test("accepts an isolated staging target with synthetic-only acknowledgement", () => {
  const target = resolveStagingSeedTarget(validEnv());
  assert.equal(target.target, "staging");
  assert.equal(target.production, false);
  assert.equal(target.projectRef, STAGING_REF);
  assert.equal(target.apiUrl, `https://${STAGING_REF}.supabase.co`);
});

test("accepts a legacy JWT staging key whose ref matches the declared ref", () => {
  const target = resolveStagingSeedTarget(
    validEnv({ STAGING_SUPABASE_SERVICE_ROLE_KEY: jwtKeyForRef(STAGING_REF) }),
  );
  assert.equal(target.projectRef, STAGING_REF);
});

// ---------------------------------------------------------------------------
// Approval binding and target branding
// ---------------------------------------------------------------------------

test("refuses when the approval allowlist is missing", () => {
  const env = validEnv();
  delete env.SCOLAPRO_E2E_APPROVED_STAGING_REFS;
  assert.throws(
    () => resolveStagingSeedTarget(env),
    (error) => error instanceof StagingSeedError && /approv/i.test(error.message),
  );
});

test("refuses a ref that is not on the approval allowlist", () => {
  assert.throws(
    () => resolveStagingSeedTarget(validEnv({ SCOLAPRO_E2E_APPROVED_STAGING_REFS: "zyxwvutsrqponmlkjihg" })),
    (error) => error instanceof StagingSeedError && /unapproved|approv/i.test(error.message),
  );
});

test("accepts a ref that appears in a multi-entry approval allowlist", () => {
  const target = resolveStagingSeedTarget(
    validEnv({ SCOLAPRO_E2E_APPROVED_STAGING_REFS: `zyxwvutsrqponmlkjihg, ${STAGING_REF}` }),
  );
  assert.equal(target.projectRef, STAGING_REF);
});

test("credential resolvers return branded approved targets only", () => {
  const seedTarget = resolveStagingSeedTarget(validEnv());
  const managementTarget = resolveStagingManagementTarget(validEnv({ SUPABASE_ACCESS_TOKEN: "token" }));
  assert.equal(isApprovedStagingTarget(seedTarget), true);
  assert.equal(isApprovedStagingTarget(managementTarget), true);
  assert.equal(isApprovedStagingTarget({ projectRef: STAGING_REF, accessToken: "token" }), false);
  assert.equal(isApprovedStagingTarget(null), false);
  assert.equal(isApprovedStagingTarget("staging"), false);
});

// ---------------------------------------------------------------------------
// Guard: refuses missing synthetic-only acknowledgement
// ---------------------------------------------------------------------------

test("refuses when SCOLAPRO_E2E_SYNTHETIC_ONLY is unset", () => {
  const env = validEnv();
  delete env.SCOLAPRO_E2E_SYNTHETIC_ONLY;
  assert.throws(() => resolveStagingSeedTarget(env), StagingSeedError);
});

test("refuses when SCOLAPRO_E2E_SYNTHETIC_ONLY is not exactly 1", () => {
  assert.throws(
    () => resolveStagingSeedTarget(validEnv({ SCOLAPRO_E2E_SYNTHETIC_ONLY: "true" })),
    StagingSeedError,
  );
});

// ---------------------------------------------------------------------------
// Guard: refuses the production project and production hosts/credentials
// ---------------------------------------------------------------------------

test("refuses the production project ref", () => {
  assert.throws(
    () =>
      resolveStagingSeedTarget(
        validEnv({
          SCOLAPRO_E2E_SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF,
          STAGING_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
        }),
      ),
    StagingSeedError,
  );
});

test("refuses a production Vercel host as the staging URL", () => {
  assert.throws(
    () => resolveStagingSeedTarget(validEnv({ STAGING_SUPABASE_URL: "https://scola-pro.vercel.app" })),
    StagingSeedError,
  );
});

test("refuses a staging URL whose ref is the production project", () => {
  assert.throws(
    () =>
      resolveStagingSeedTarget(
        validEnv({ STAGING_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co` }),
      ),
    StagingSeedError,
  );
});

test("refuses when NEXT_PUBLIC_SUPABASE_URL points at production", () => {
  assert.throws(
    () =>
      resolveStagingSeedTarget(
        validEnv({ NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co` }),
      ),
    StagingSeedError,
  );
});

test("refuses a staging key identical to the production service-role key", () => {
  assert.throws(
    () =>
      resolveStagingSeedTarget(
        validEnv({
          STAGING_SUPABASE_SERVICE_ROLE_KEY: "sb_secret_production_looking_value",
          SUPABASE_SERVICE_ROLE_KEY: "sb_secret_production_looking_value",
        }),
      ),
    StagingSeedError,
  );
});

test("refuses a staging key identical to the production publishable key", () => {
  assert.throws(
    () =>
      resolveStagingSeedTarget(
        validEnv({
          STAGING_SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_production_value",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_production_value",
        }),
      ),
    StagingSeedError,
  );
});

test("refuses a legacy JWT staging key that belongs to another ref", () => {
  assert.throws(
    () =>
      resolveStagingSeedTarget(
        validEnv({ STAGING_SUPABASE_SERVICE_ROLE_KEY: jwtKeyForRef(PRODUCTION_PROJECT_REF) }),
      ),
    StagingSeedError,
  );
});

// ---------------------------------------------------------------------------
// Guard: refuses ambiguous identity
// ---------------------------------------------------------------------------

test("refuses a missing declared staging ref", () => {
  const env = validEnv();
  delete env.SCOLAPRO_E2E_SUPABASE_PROJECT_REF;
  assert.throws(() => resolveStagingSeedTarget(env), StagingSeedError);
});

test("refuses a malformed declared staging ref", () => {
  assert.throws(
    () => resolveStagingSeedTarget(validEnv({ SCOLAPRO_E2E_SUPABASE_PROJECT_REF: "short" })),
    StagingSeedError,
  );
});

test("refuses when STAGING_PROJECT_ID disagrees with the declared ref", () => {
  assert.throws(
    () => resolveStagingSeedTarget(validEnv({ STAGING_PROJECT_ID: "zyxwvutsrqponmlkjihg" })),
    StagingSeedError,
  );
});

test("refuses when the staging URL ref differs from the declared ref", () => {
  assert.throws(
    () =>
      resolveStagingSeedTarget(
        validEnv({ STAGING_SUPABASE_URL: "https://zyxwvutsrqponmlkjihg.supabase.co" }),
      ),
    StagingSeedError,
  );
});

test("refuses a staging URL that is not a hosted Supabase project", () => {
  assert.throws(
    () => resolveStagingSeedTarget(validEnv({ STAGING_SUPABASE_URL: "https://example.test" })),
    StagingSeedError,
  );
});

test("refuses a missing staging URL", () => {
  const env = validEnv();
  delete env.STAGING_SUPABASE_URL;
  assert.throws(() => resolveStagingSeedTarget(env), StagingSeedError);
});

test("refuses a missing staging secret key", () => {
  const env = validEnv();
  delete env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  assert.throws(() => resolveStagingSeedTarget(env), StagingSeedError);
});

test("rejection helper returns null when safe and a reason when unsafe", () => {
  assert.equal(stagingSeedRejection(validEnv()), null);
  assert.match(
    stagingSeedRejection(validEnv({ SCOLAPRO_E2E_SYNTHETIC_ONLY: "0" })) ?? "",
    /synthetic/i,
  );
});

test("supabaseRefFromKey decodes legacy JWTs and returns null for opaque keys", () => {
  assert.equal(supabaseRefFromKey(jwtKeyForRef(STAGING_REF)), STAGING_REF);
  assert.equal(supabaseRefFromKey("sb_secret_opaque_value"), null);
  assert.equal(supabaseRefFromKey("not-a-jwt"), null);
});

// ---------------------------------------------------------------------------
// Isolated seed validation (no network, no database)
//
// Docker is not available in every environment, so the seed's database contract
// is validated against an in-memory fake client: the same upsert keys, the same
// deterministic identifiers, and byte-identical results across two runs.
// ---------------------------------------------------------------------------

function conflictKey(row, onConflict) {
  return onConflict
    .split(",")
    .map((column) => String(row[column.trim()]))
    .join("\u0000");
}

function createFakeSupabase(seedTables = {}) {
  const tables = new Map();
  const ensure = (table) => {
    if (!tables.has(table)) tables.set(table, new Map());
    return tables.get(table);
  };
  for (const [table, rows] of Object.entries(seedTables)) {
    const map = ensure(table);
    for (const row of rows) map.set(conflictKey(row, "id"), { ...row });
  }
  const authUsers = new Map();

  class Query {
    constructor(table) {
      this.table = table;
      this.mode = null;
      this.opts = {};
      this.payload = null;
      this.filters = [];
    }
    select(_columns, opts = {}) {
      this.mode = "select";
      this.opts = opts;
      return this;
    }
    update(payload) {
      this.mode = "update";
      this.payload = payload;
      return this;
    }
    upsert(row, opts = {}) {
      ensure(this.table).set(conflictKey(row, opts.onConflict ?? "id"), { ...row });
      return Promise.resolve({ error: null });
    }
    eq(column, value) {
      this.filters.push([column, value]);
      return this;
    }
    matched() {
      return [...ensure(this.table).values()].filter((row) =>
        this.filters.every(([column, value]) => row[column] === value),
      );
    }
    maybeSingle() {
      return { data: this.matched()[0] ?? null, error: null };
    }
    then(resolve, reject) {
      let result;
      if (this.mode === "update") {
        for (const row of this.matched()) Object.assign(row, this.payload);
        result = { error: null };
      } else if (this.opts.head) {
        result = { data: null, count: this.matched().length, error: null };
      } else {
        result = { data: this.matched(), error: null };
      }
      return Promise.resolve(result).then(resolve, reject);
    }
  }

  return {
    from: (table) => new Query(table),
    auth: {
      admin: {
        getUserById: (id) => Promise.resolve({ data: { user: authUsers.get(id) ?? null } }),
        // Mirror the real API: the returned user exposes identity fields, not the
        // password. Storing only `{ id, email }` keeps repeated runs identical.
        createUser: ({ id, email }) => {
          const user = { id, email };
          authUsers.set(id, user);
          return Promise.resolve({ data: { user }, error: null });
        },
        updateUserById: (id, { email }) => {
          const user = { id, email: email ?? authUsers.get(id)?.email };
          authUsers.set(id, user);
          return Promise.resolve({ data: { user }, error: null });
        },
      },
    },
    dump: () => ({
      tables: Object.fromEntries(
        [...tables.entries()].map(([table, map]) => [
          table,
          [...map.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        ]),
      ),
      authUsers: [...authUsers.values()].sort((a, b) => String(a.id).localeCompare(String(b.id))),
    }),
  };
}

function seededFake() {
  return createFakeSupabase({
    schools: [{ id: DEMO.schoolId, tenant_id: DEMO.tenantId, name: DEMO.schoolName }],
    register_classes: [{ id: DEMO.registerClass10A, register_teacher_staff_id: null }],
  });
}

test("isolated seed is idempotent and deterministic (fake client, no network)", async () => {
  const client = seededFake();

  await seedSyntheticWorld({ client, password: PASSWORD });
  const first = client.dump();
  await seedSyntheticWorld({ client, password: PASSWORD });
  const second = client.dump();

  assert.deepEqual(second, first, "running the seed twice must leave an identical world");

  // Deterministic identifiers from the shared fixture, not generated values.
  assert.equal(first.tables.school_memberships.length, 5);
  assert.equal(first.tables.staff_members.length, 3);
  assert.equal(first.tables.staff_school_assignments.length, 3);
  assert.equal(first.tables.user_profiles.length, 5);
  assert.equal(first.tables.school_day_overrides.length, 3);
  assert.equal(first.authUsers.length, 5);
  assert.equal(first.tables.tenants.length, 1);
  assert.equal(first.tables.tenants[0].id, OUTSIDER_TENANT.tenantId);

  const membershipIds = first.tables.school_memberships.map((row) => row.id).sort();
  assert.deepEqual(
    membershipIds,
    [
      SYNTHETIC_ACCOUNTS.admin.membershipId,
      SYNTHETIC_ACCOUNTS.registerTeacher.membershipId,
      SYNTHETIC_ACCOUNTS.unassignedTeacher.membershipId,
      SYNTHETIC_ACCOUNTS.hod.membershipId,
      SYNTHETIC_ACCOUNTS.outsider.membershipId,
    ].sort(),
  );
});

test("isolated seed binds the register teacher and leaves the isolation tenant empty", async () => {
  const client = seededFake();
  await seedSyntheticWorld({ client, password: PASSWORD });
  const dump = client.dump();

  const boundClass = dump.tables.register_classes.find((row) => row.id === DEMO.registerClass10A);
  assert.equal(boundClass.register_teacher_staff_id, SYNTHETIC_ACCOUNTS.registerTeacher.staffMemberId);
  assert.deepEqual(dump.tables.learners ?? [], []);
});
