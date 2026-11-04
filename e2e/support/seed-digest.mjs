// Deterministic digest of the synthetic E2E world.
//
// Used by `scripts/verify-e2e-seed-idempotency.mjs` to prove that re-running the
// seed leaves the world byte-for-byte identical. The digest deliberately projects
// only the columns the seed writes — never `updated_at`/`created_at`-style columns
// that a re-upsert could legitimately touch — so it measures *fixture* stability,
// not row-version churn.

import { createHash } from "node:crypto";

/** The fixture-defined columns the seed controls, per table. */
export const WORLD_PROJECTION = Object.freeze({
  tenants: ["id", "name", "slug"],
  schools: ["id", "tenant_id", "name", "emis_number", "region", "town"],
  grades: ["id", "tenant_id", "school_id", "academic_year", "grade_code", "display_name"],
  register_classes: [
    "id",
    "tenant_id",
    "school_id",
    "grade_id",
    "academic_year",
    "class_code",
    "display_name",
    "register_teacher_staff_id",
  ],
  learners: ["id", "tenant_id", "first_names", "surname", "preferred_name", "date_of_birth", "sex"],
  enrolments: [
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
  staff_members: ["id", "tenant_id", "user_id", "employee_number", "first_name", "last_name", "status"],
  school_memberships: [
    "id",
    "tenant_id",
    "school_id",
    "user_id",
    "staff_member_id",
    "role_key",
    "active_from",
    "active_to",
  ],
  staff_school_assignments: [
    "id",
    "tenant_id",
    "school_id",
    "staff_member_id",
    "assignment_type",
    "position_title",
    "effective_from",
    "created_by_user_id",
  ],
  school_day_overrides: [
    "tenant_id",
    "school_id",
    "school_date",
    "is_school_day",
    "teaching_impact",
    "reason",
    "source",
    "created_by_user_id",
  ],
  user_profiles: ["user_id", "display_name", "preferred_name", "must_change_password"],
});

function normalize(value) {
  return value === null || value === undefined ? null : String(value);
}

/**
 * Produces a stable SHA-256 digest of the projected world. Row order and any
 * non-projected columns do not affect the result.
 *
 * @param {Record<string, Array<Record<string, unknown>>>} rowsByTable
 * @returns {string}
 */
export function digestWorld(rowsByTable) {
  const canonical = {};
  for (const table of Object.keys(WORLD_PROJECTION).sort()) {
    const columns = WORLD_PROJECTION[table];
    const rows = (rowsByTable?.[table] ?? []).map((row) => columns.map((column) => normalize(row[column])));
    rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    canonical[table] = rows;
  }
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
