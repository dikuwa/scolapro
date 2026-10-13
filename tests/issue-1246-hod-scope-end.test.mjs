import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261013025813_end_hod_scope_responsibilities.sql");
const actions = read("src/features/academics/server/hod-scope-actions.ts");
const ui = read("src/features/academics/hod-scope-configuration.tsx");
const query = read("src/features/academics/server/hod-scope.ts");

test("whole portfolio end is governed, atomic, and only closes appointment-owned authority", () => {
  assert.match(migration, /create or replace function public.end_hod_scope_responsibilities/);
  assert.match(migration, /security definer/);
  assert.match(migration, /user_current_school_matches/);
  assert.match(migration, /school_admin','principal','deputy_principal/);
  assert.match(migration, /for update of a/);
  assert.match(migration, /update public.hod_portfolio_appointments/);
  assert.match(migration, /portfolio_appointment_id=v_appointment.id/);
  assert.match(migration, /revoke all on function public.end_hod_scope_responsibilities/);
  assert.match(migration, /grant execute on function public.end_hod_scope_responsibilities/);
});

test("multi-subject end validates complete selection before changing any rows", () => {
  assert.match(migration, /not between 1 and 100/);
  assert.match(migration, /count\(distinct sid\)/);
  assert.match(migration, /for update;/);
  assert.match(migration, /v_count<>v_selected/);
  assert.match(migration, /portfolio_appointment_id is null/);
  assert.match(actions, /form.getAll\("responsibilityIds"\)/);
  assert.match(actions, /end_hod_scope_responsibilities/);
  assert.doesNotMatch(actions.slice(actions.indexOf("export async function endHodSubjectResponsibility"), actions.indexOf("const unassignedPortfolioSchema")), /\.from\("subject_department_responsibilities"\)\.update/);
});

test("advanced end defaults to whole scope and supports multi-select standalone subjects", () => {
  assert.match(ui, /useState<"scope" \| "subjects">\("scope"\)/);
  assert.match(ui, /Whole scope/);
  assert.match(ui, /Select subjects/);
  assert.match(ui, /multiple/);
  assert.match(ui, /name="appointmentId"/);
  assert.match(ui, /name="responsibilityIds"/);
  assert.match(ui, /!row.portfolioAppointmentId/);
  assert.match(query, /portfolio_appointment_id/);
});
