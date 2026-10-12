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
// Nothing here is executed at import time. Every write entrypoint resolves
// through `staging-seed-guard.mjs` first and refuses before any network call.

import { PRODUCTION_PROJECT_REF } from "./env-guard.mjs";
import {
  StagingSeedError,
  resolveStagingManagementTarget,
} from "./staging-seed-guard.mjs";

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
 * Tables that must exist before the baseline/world seed can run. This is the
 * migration preflight: a missing table means migrations were not applied.
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

/**
 * Read-only baseline verification: the demo tenant/school/classes/learners must
 * already exist. Throws an explicit error naming the missing row.
 */
export async function assertBaselinePresent(client) {
  const { data: school, error: schoolError } = await client
    .from("schools")
    .select("id,tenant_id,name")
    .eq("id", BASELINE.school.id)
    .maybeSingle();
  if (schoolError) throw new StagingSeedError(`baseline check failed: ${schoolError.message}`);
  if (!school || school.tenant_id !== BASELINE.tenant.id) {
    throw new StagingSeedError(
      `baseline missing: demo school ${BASELINE.school.id} (${BASELINE.school.name}) is absent. ` +
        "Run the staging baseline bootstrap first.",
    );
  }

  const { data: classes, error: classError } = await client
    .from("register_classes")
    .select("id")
    .in("id", BASELINE.registerClasses.map((klass) => klass.id));
  if (classError) throw new StagingSeedError(`baseline check failed: ${classError.message}`);
  const presentClasses = new Set((classes ?? []).map((row) => row.id));
  for (const klass of BASELINE.registerClasses) {
    if (!presentClasses.has(klass.id)) {
      throw new StagingSeedError(
        `baseline missing: register class ${klass.id} (${klass.display_name}) is absent.`,
      );
    }
  }

  const { count, error: enrolmentError } = await client
    .from("enrolments")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", BASELINE.tenant.id);
  if (enrolmentError) throw new StagingSeedError(`baseline check failed: ${enrolmentError.message}`);
  if ((count ?? 0) < BASELINE.enrolments.length) {
    throw new StagingSeedError(
      `baseline missing: expected at least ${BASELINE.enrolments.length} demo enrolments, found ${count ?? 0}.`,
    );
  }
}

/**
 * Applies baseline SQL through the Supabase Management API query endpoint. This
 * is the only write entrypoint for the baseline and it refuses a production ref
 * defensively, on top of the caller having already resolved the staging guard.
 *
 * Never runs `supabase db reset`.
 */
export async function applyBaselineViaManagementApi({
  projectRef,
  accessToken,
  sql,
  fetchImpl = globalThis.fetch,
}) {
  if (!projectRef || projectRef === PRODUCTION_PROJECT_REF) {
    throw new StagingSeedError(
      `refusing to apply baseline SQL: project ref "${projectRef ?? "(unset)"}" is not an isolated staging project`,
    );
  }
  if (!accessToken) {
    throw new StagingSeedError("refusing to apply baseline SQL: SUPABASE_ACCESS_TOKEN is required");
  }

  const response = await fetchImpl(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new StagingSeedError(
      `baseline SQL failed: HTTP ${response.status}${detail ? ` ${detail.slice(0, 200)}` : ""}`,
    );
  }
  return response.json().catch(() => null);
}

/**
 * Orchestrates the guarded baseline bootstrap. Resolves the staging identity +
 * Management token first (refusing before any network call), then applies the
 * deterministic baseline SQL. Testable via `fetchImpl`.
 *
 * @param {object} options
 * @param {Record<string, string | undefined>} [options.env]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {(message: string) => void} [options.log]
 */
export async function runStagingBaselineBootstrap({ env = process.env, fetchImpl, log = () => {} }) {
  const target = resolveStagingManagementTarget(env);
  const sql = buildBaselineSql();
  log(`[staging-baseline] applying deterministic baseline to projectRef=${target.projectRef}`);
  await applyBaselineViaManagementApi({
    projectRef: target.projectRef,
    accessToken: target.accessToken,
    sql,
    fetchImpl,
  });
  log("[staging-baseline] baseline applied.");
  return target;
}
