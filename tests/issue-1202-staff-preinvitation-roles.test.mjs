import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261009002500_staff_preinvitation_roles.sql");
const actions = read("src/features/staff/server/access-actions.ts");
const ui = read("src/features/staff/staff-access-manager.tsx");

test("role intentions never create login access before invitation", () => {
  assert.match(migration,/create table if not exists public.staff_planned_school_roles/);
  assert.match(migration,/create or replace function public.plan_staff_school_role/);
  const section=migration.slice(migration.indexOf("create or replace function public.plan_staff_school_role"),migration.indexOf("create or replace function public.end_planned_staff_school_role"));
  assert.doesNotMatch(section,/insert into public.school_memberships/);
  assert.match(section,/Self-assignment is not permitted/);
  assert.match(section,/School administrator permission required/);
  assert.match(section,/No effective school placement/);
});
test("verified invitation acceptance activates effective roles with identity checks", () => {
  assert.match(migration,/after update of status on public.school_invitations/);
  assert.match(migration,/new.accepted_user_id is null/);
  assert.match(migration,/Accepted staff identity mismatch/);
  assert.match(migration,/effective_from<=current_date/);
  assert.match(migration,/effective_to is null or effective_to>=current_date/);
  assert.match(migration,/insert into public.school_memberships/);
  assert.match(migration,/linked_at=now\(\)/);
});
test("school admin may preassign roles without providing email", () => {
  assert.match(actions,/export async function planStaffSchoolRole/);
  assert.match(ui,/Preassign school role/);
  assert.match(ui,/Preassign role/);
  assert.match(ui,/Role remains inactive until/);
});

test("planned roles are displayed and revocable before account creation", () => {
  const directory = read("src/features/staff/server/directory.ts");
  assert.match(migration, /create or replace function public.list_staff_planned_roles/);
  assert.match(directory, /plannedRoles: row.staff_id/);
  assert.match(ui, /row.plannedRoles.map/);
  assert.match(ui, /endPlannedStaffSchoolRole/);
  assert.match(actions, /export async function endPlannedStaffSchoolRole/);
});
