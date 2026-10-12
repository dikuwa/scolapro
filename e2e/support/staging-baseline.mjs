// Hosted-staging synthetic baseline.
//
// `e2e/support/seed-world.mjs` assumes the demo tenant/school/register-class
// structure created by `supabase/seed.sql` already exists. On a clean local
// reset that file runs after migrations; a fresh hosted staging project has
// migrations but **no** seed.sql, so the world seed fails at its first
// checkpoint. This module supplies the missing baseline as a deterministic,
// idempotent SQL fixture that is applied only to an isolated staging project.
//
// Two facts drive the design:
//   - `supabase/seed.sql` calls `app_private.*` calendar routines, which are NOT
//     exposed through PostgREST (`supabase/config.toml` exposes only `public` and
//     `graphql_public`), so the baseline cannot be applied with supabase-js.
//   - The baseline must therefore run as SQL, and only through a guarded,
//     non-production path.
//
// Security posture:
//   - The SQL applier is NOT a general query executor. It accepts no caller SQL
//     and requires a **branded** target produced by `resolveStagingManagementTarget`
//     (`isApprovedStagingTarget`). A hand-built `{ projectRef, accessToken }`
//     object is refused before any request.
//   - A read-only preflight verifies applied migration versions and the required
//     `app_private` functions before any write.
//   - Management-API failures never echo the response body (which could contain
//     secrets or SQL fragments) — only the HTTP status.
//
// Nothing here is executed at import time.

import { PRODUCTION_PROJECT_REF } from "./env-guard.mjs";
import {
  StagingSeedError,
  isApprovedStagingTarget,
  resolveStagingManagementTarget,
} from "./staging-seed-guard.mjs";

const MANAGEMENT_API = "https://api.supabase.com";

/** Demo tenant / school / structure. Mirrors `supabase/seed.sql` exactly. */
export const BASELINE = Object.freeze({
  tenant: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "ScolaPro Demo Education Group",
    slug: "demo-education-group",
  },
  school: {
    id: "22222222-2222-4222-8222-222222222222",
    tenant_id: "11111111-1111-4111-8111-111111111111",
    name: "Namib High School",
    emis_number: "DEMO001",
    region: "Erongo",
    town: "Swakopmund",
  },
  grades: Object.freeze([
    { id: "30000000-0000-4000-8000-000000000008", academic_year: 2026, grade_code: "8", display_name: "Grade 8" },
    { id: "30000000-0000-4000-8000-000000000009", academic_year: 2026, grade_code: "9", display_name: "Grade 9" },
    { id: "30000000-0000-4000-8000-000000000010", academic_year: 2026, grade_code: "10", display_name: "Grade 10" },
    { id: "30000000-0000-4000-8000-000000000011", academic_year: 2026, grade_code: "11", display_name: "Grade 11" },
    { id: "30000000-0000-4000-8000-000000000012", academic_year: 2026, grade_code: "12", display_name: "Grade 12" },
  ]),
  registerClasses: Object.freeze([
    { id: "40000000-0000-4000-8000-00000000001a", grade_id: "30000000-0000-4000-8000-000000000010", academic_year: 2026, class_code: "10A", display_name: "Grade 10/A" },
    { id: "40000000-0000-4000-8000-00000000001b", grade_id: "30000000-0000-4000-8000-000000000010", academic_year: 2026, class_code: "10B", display_name: "Grade 10/B" },
  ]),
  learners: Object.freeze([
    { id: "50000000-0000-4000-8000-000000000001", first_names: "Amara N.", surname: "Demo", preferred_name: "Amara", date_of_birth: "2010-05-14", sex: "female" },
    { id: "50000000-0000-4000-8000-000000000002", first_names: "Tomas K.", surname: "Sample", preferred_name: "Tomas", date_of_birth: "2010-02-03", sex: "male" },
  ]),
  enrolments: Object.freeze([
    { id: "60000000-0000-4000-8000-000000000001", learner_id: "50000000-0000-4000-8000-000000000001", grade_id: "30000000-0000-4000-8000-000000000010", register_class_id: "40000000-0000-4000-8000-00000000001a", academic_year: 2026, admission_number: "DEMO-001", enrolled_from: "2026-01-12" },
    { id: "60000000-0000-4000-8000-000000000002", learner_id: "50000000-0000-4000-8000-000000000002", grade_id: "30000000-0000-4000-8000-000000000010", register_class_id: "40000000-0000-4000-8000-00000000001b", academic_year: 2026, admission_number: "DEMO-002", enrolled_from: "2026-01-12" },
  ]),
});

/**
 * Baseline calendar routines, applied only after the school exists. Mirrors the
 * two `select app_private.*()` calls in `supabase/seed.sql`.
 */
export const BASELINE_CALENDAR_ROUTINES = Object.freeze([
  "app_private.recover_namib_high_2026_learner_calendar()",
  "app_private.apply_namib_high_2026_operational_calendar_source()",
]);

/**
 * Migration versions that must already be applied before the baseline can run.
 * The two calendar routines live in these migrations.
 */
export const REQUIRED_MIGRATION_VERSIONS = Object.freeze([
  "20261004110740",
  "20261006212006",
]);

/** `app_private` functions the baseline depends on (not PostgREST-exposed). */
export const REQUIRED_APP_PRIVATE_FUNCTIONS = Object.freeze([
  "recover_namib_high_2026_learner_calendar",
  "apply_namib_high_2026_operational_calendar_source",
]);

/**
 * Tables that must exist before the baseline/world seed can run. This is the
 * table-level migration preflight; a missing table means migrations were not applied.
 */
export const REQUIRED_TABLES = Object.freeze([
  "tenants",
  "schools",
  "grades",
  "register_classes",
  "learners",
  "enrolments",
  "staff_members",
  "school_memberships",
  "staff_school_assignments",
  "school_day_overrides",
  "user_profiles",
]);

/** Renders a SQL literal for a string/number/null value. */
function sqlLiteral(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Builds a deterministic `insert ... on conflict (id) do nothing` statement. */
function insertStatement(table, columns, rows) {
  const values = rows
    .map((row) => `  (${columns.map((column) => sqlLiteral(row[column])).join(", ")})`)
    .join(",\n");
  return `insert into public.${table} (${columns.join(", ")})\nvalues\n${values}\non conflict (id) do nothing;`;
}

/**
 * Builds the full baseline SQL. Deterministic: identical input yields identical
 * output, and every statement is idempotent via `on conflict (id) do nothing`.
 */
export function buildBaselineSql() {
  const statements = [
    "-- ScolaPro hosted-staging synthetic baseline (generated; deterministic, idempotent).",
    "-- Applied only to an isolated, non-production staging project.",
    insertStatement("tenants", ["id", "name", "slug"], [BASELINE.tenant]),
    insertStatement(
      "schools",
      ["id", "tenant_id", "name", "emis_number", "region", "town"],
      [BASELINE.school],
    ),
    insertStatement(
      "grades",
      ["id", "tenant_id", "school_id", "academic_year", "grade_code", "display_name"],
      BASELINE.grades.map((grade) => ({
        tenant_id: BASELINE.tenant.id,
        school_id: BASELINE.school.id,
        ...grade,
      })),
    ),
    insertStatement(
      "register_classes",
      ["id", "tenant_id", "school_id", "grade_id", "academic_year", "class_code", "display_name"],
      BASELINE.registerClasses.map((klass) => ({
        tenant_id: BASELINE.tenant.id,
        school_id: BASELINE.school.id,
        ...klass,
      })),
    ),
    insertStatement(
      "learners",
      ["id", "tenant_id", "first_names", "surname", "preferred_name", "date_of_birth", "sex"],
      BASELINE.learners.map((learner) => ({ tenant_id: BASELINE.tenant.id, ...learner })),
    ),
    insertStatement(
      "enrolments",
      [
        "id",
        "tenant_id",
        "school_id",
        "learner_id",
        "academic_year",
        "grade_id",
        "register_class_id",
        "admission_number",
        "enrolled_from",
      ],
      BASELINE.enrolments.map((enrolment) => ({
        tenant_id: BASELINE.tenant.id,
        school_id: BASELINE.school.id,
        ...enrolment,
      })),
    ),
    ...BASELINE_CALENDAR_ROUTINES.map((routine) => `select ${routine};`),
  ];
  return `${statements.join("\n\n")}\n`;
}

// ---------------------------------------------------------------------------
// Guarded Management-API access
// ---------------------------------------------------------------------------

function assertApprovedTarget(target) {
  if (!isApprovedStagingTarget(target)) {
    throw new StagingSeedError(
      "refusing Management-API access: target was not produced by the approved staging resolver",
    );
  }
  if (!target.projectRef || target.projectRef === PRODUCTION_PROJECT_REF) {
    throw new StagingSeedError(
      "refusing Management-API access: target is not an approved isolated staging ref",
    );
  }
}

/**
 * Issues a read-only or baseline Management-API query for an approved target.
 * Never echoes the response body, which may contain secrets or SQL fragments.
 */
async function runManagementQuery({ target, sql, fetchImpl = globalThis.fetch }) {
  assertApprovedTarget(target);
  const response = await fetchImpl(
    `${MANAGEMENT_API}/v1/projects/${target.projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${target.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!response.ok) {
    // Status only — never the body.
    throw new StagingSeedError(`management API request failed (HTTP ${response.status})`);
  }
  return response.json().catch(() => null);
}

/**
 * Read-only preflight: verifies the required migration versions are applied and
 * the required `app_private` functions exist. Fails closed with an explicit,
 * non-secret error naming the missing prerequisite. Never writes.
 */
export async function verifyStagingPrerequisites({ target, fetchImpl = globalThis.fetch }) {
  const sql =
    "select " +
    "coalesce((select json_agg(version order by version) from supabase_migrations.schema_migrations), '[]'::json) as versions, " +
    "coalesce((select json_agg(p.proname order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app_private'), '[]'::json) as functions;";
  const rows = await runManagementQuery({ target, sql, fetchImpl });
  const row = Array.isArray(rows) ? rows[0] : rows;
  const versions = new Set(Array.isArray(row?.versions) ? row.versions : []);
  const functions = new Set(Array.isArray(row?.functions) ? row.functions : []);

  const missingVersions = REQUIRED_MIGRATION_VERSIONS.filter((version) => !versions.has(version));
  if (missingVersions.length > 0) {
    throw new StagingSeedError(
      `staging prerequisite check failed: missing migration version(s) ${missingVersions.join(", ")}`,
    );
  }
  const missingFunctions = REQUIRED_APP_PRIVATE_FUNCTIONS.filter((name) => !functions.has(name));
  if (missingFunctions.length > 0) {
    throw new StagingSeedError(
      `staging prerequisite check failed: missing function(s) ${missingFunctions.join(", ")}`,
    );
  }
  return { versions: [...versions], functions: [...functions] };
}

/**
 * Applies the generated baseline SQL to an approved staging target. Takes **no
 * caller-supplied SQL** — it always applies `buildBaselineSql()`. A non-branded
 * or production target is refused before any request. Never runs `supabase db reset`.
 */
export async function applyApprovedStagingBaseline({ target, fetchImpl = globalThis.fetch }) {
  assertApprovedTarget(target);
  const sql = buildBaselineSql();
  return runManagementQuery({ target, sql, fetchImpl });
}

// ---------------------------------------------------------------------------
// Read-only PostgREST verification (exact synthetic rows)
// ---------------------------------------------------------------------------

/**
 * Read-only migration preflight: every required table must be queryable. Throws
 * an explicit error naming the first missing table.
 */
export async function assertSchemaReady(client) {
  for (const table of REQUIRED_TABLES) {
    const { error } = await client.from(table).select("*", { count: "exact", head: true });
    if (error) {
      throw new StagingSeedError(
        `schema preflight failed: table "${table}" is not queryable (${error.message}). ` +
          "Have migrations been applied to this project?",
      );
    }
  }
}

/** Requires an exact synthetic row; any mismatch is a non-synthetic collision. */
async function requireExactRow(client, table, expected) {
  const columns = Object.keys(expected).filter((column) => column !== "id");
  const { data, error } = await client
    .from(table)
    .select(["id", ...columns].join(","))
    .eq("id", expected.id)
    .maybeSingle();
  if (error) throw new StagingSeedError(`baseline check failed for ${table}: ${error.message}`);
  if (!data) {
    throw new StagingSeedError(`baseline missing: ${table} row ${expected.id} is absent`);
  }
  for (const column of columns) {
    if (String(data[column]) !== String(expected[column])) {
      throw new StagingSeedError(
        `baseline collision: ${table} ${expected.id} has ${column}="${data[column]}", ` +
          `expected "${expected[column]}" (non-synthetic row)`,
      );
    }
  }
}

/**
 * Read-only baseline verification: every demo row must exist **and match the
 * expected synthetic values exactly**. A preexisting row with the demo id but
 * different content is a collision and fails closed. Writes nothing.
 */
export async function assertBaselinePresent(client) {
  await requireExactRow(client, "tenants", BASELINE.tenant);
  await requireExactRow(client, "schools", BASELINE.school);

  for (const grade of BASELINE.grades) {
    await requireExactRow(client, "grades", {
      tenant_id: BASELINE.tenant.id,
      school_id: BASELINE.school.id,
      ...grade,
    });
  }
  for (const klass of BASELINE.registerClasses) {
    await requireExactRow(client, "register_classes", {
      tenant_id: BASELINE.tenant.id,
      school_id: BASELINE.school.id,
      ...klass,
    });
  }
  for (const learner of BASELINE.learners) {
    await requireExactRow(client, "learners", { tenant_id: BASELINE.tenant.id, ...learner });
  }
  for (const enrolment of BASELINE.enrolments) {
    await requireExactRow(client, "enrolments", {
      tenant_id: BASELINE.tenant.id,
      school_id: BASELINE.school.id,
      ...enrolment,
    });
  }
}

// ---------------------------------------------------------------------------
// Guarded orchestration
// ---------------------------------------------------------------------------

/**
 * Orchestrates the guarded baseline bootstrap: resolve the approved staging
 * target (refusing before any network call), run the read-only version/function
 * preflight, then apply the deterministic baseline SQL. Testable via `fetchImpl`.
 *
 * @param {object} options
 * @param {Record<string, string | undefined>} [options.env]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {(message: string) => void} [options.log]
 */
export async function runStagingBaselineBootstrap({ env = process.env, fetchImpl, log = () => {} }) {
  const target = resolveStagingManagementTarget(env);
  log(`[staging-baseline] verifying prerequisites for projectRef=${target.projectRef}`);
  await verifyStagingPrerequisites({ target, fetchImpl });
  log(`[staging-baseline] applying deterministic baseline to projectRef=${target.projectRef}`);
  await applyApprovedStagingBaseline({ target, fetchImpl });
  log("[staging-baseline] baseline applied.");
  return target;
}
