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
  assert.match(section,/user_can_manage_current_school_membership/);
  assert.match(section,/No effective school placement/);
});

test("active role management protects the final School Admin", () => {
  assert.match(migration,/create or replace function public\.end_staff_school_role/);
  assert.match(migration,/Cannot remove the last active School Admin/);
  assert.match(migration,/v_successor_date:=greatest\(current_date,p_effective_to\+1\)/);
});

test("verified invitation acceptance reconciles only governed planned roles", () => {
  assert.match(migration,/after update of status on public.school_invitations/);
  assert.match(migration,/Accepted staff identity mismatch/);
  assert.match(migration,/Accepted staff account email is not verified/);
  assert.match(migration,/u\.email_confirmed_at is not null/);
  assert.match(migration,/No eligible planned staff roles remain/);
  assert.match(migration,/delete from public\.school_memberships/);
  assert.match(migration,/v_plan\.effective_from,v_plan\.effective_to/);
  assert.match(migration,/revoked_at is null/);
  assert.match(migration,/effective_to is null or effective_to>=current_date/);
  assert.match(migration,/staff\.planned_role_activated/);
});

test("school admin preassigns effective-dated roles before supplying login email", () => {
  assert.match(actions,/export async function planStaffSchoolRole/);
  assert.match(ui,/Preassign school role/);
  assert.match(ui,/Preassign role/);
  assert.match(ui,/name="effectiveFrom"/);
  assert.match(ui,/name="effectiveTo"/);
  assert.match(actions,/p_effective_to: parsed\.data\.effectiveTo \|\| null/);
  assert.match(migration,/Planned role end date cannot precede its start date/);
  assert.match(ui,/scheduled end date/);
});

test("staff invitation consumes preassigned roles and does not ask for a second role", () => {
  assert.match(ui,/const eligiblePlannedRoles/);
  assert.match(ui,/const invitationRoleKey/);
  assert.match(ui,/name="roleKey" value=\{invitationRoleKey\}/);
  assert.doesNotMatch(ui,/ariaLabel="Intended school role"/);
  assert.match(ui,/no extra role is granted by the invitation/);
  assert.match(ui,/Assign at least one current or scheduled role before creating login access/);
});

test("planned roles expose planned, scheduled, active and ended states", () => {
  const directory = read("src/features/staff/server/directory.ts");
  assert.match(migration, /create or replace function public.list_staff_planned_roles/);
  assert.match(directory, /plannedRoles: row.staff_id/);
  assert.match(ui, /"Scheduled"/);
  assert.match(ui, /"Active on account"/);
  assert.match(ui, /"Ended"/);
  assert.match(ui, /endPlannedStaffSchoolRole/);
});
