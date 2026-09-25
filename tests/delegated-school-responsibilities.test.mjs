import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/migrations/20260925150000_delegated_school_responsibilities.sql");
const shell = read("src/components/shell/app-shell.tsx");
const nav = read("src/components/shell/navigation.tsx");
const page = read("src/app/school/responsibilities/page.tsx");
const workspace = read("src/features/responsibilities/responsibilities-workspace.tsx");
const capabilityMap = read("src/lib/permissions/school-duty-capabilities.ts");

test("delegated responsibilities reuse school_duty_assignments instead of adding roles", () => {
  assert.match(migration, /public\.school_duty_assignments/);
  assert.match(migration, /school_duty_capabilities/);
  assert.doesNotMatch(migration, /alter table public\.school_memberships[\s\S]*role_key/);
  assert.doesNotMatch(migration, /create table .*roles/i);
});

test("assignment governance is school-local effective-dated and audited", () => {
  assert.match(migration, /user_can_manage_school_duties\(auth\.uid\(\),p_school_id\)/);
  assert.match(migration, /staff_member_has_school_assignment/);
  assert.match(migration, /overlapping duty assignment/);
  assert.match(migration, /school_duty\.assigned/);
  assert.match(migration, /school_duty\.ended/);
});

test("shell derives delegated navigation from effective duty keys", () => {
  assert.match(shell, /select\("id,duty_key"\)/);
  assert.match(shell, /lte\("active_from", today\)/);
  assert.match(shell, /active_to\.is\.null,active_to\.gte/);
  assert.match(shell, /navigationKeyForSchoolDuty/);
  assert.match(capabilityMap, /late_arrival_recorder/);
  assert.match(capabilityMap, /navigationKey: "late_arrivals"/);
});

test("leadership gets a dedicated responsibilities workspace using design-system controls", () => {
  assert.match(page, /school_admin/);
  assert.match(page, /principal/);
  assert.match(page, /deputy_principal/);
  assert.match(nav, /Responsibilities/);
  assert.match(workspace, /<Picker/);
  assert.match(workspace, /<DateField/);
  assert.doesNotMatch(workspace, /<select/);
});

test("only explicitly approved bounded custodianship enters generic duty capabilities", () => {
  assert.match(capabilityMap, /crc_custodian/);
  assert.match(capabilityMap, /does not grant counselling or psychometric access/);
  assert.doesNotMatch(capabilityMap, /room_inventory_custodian|librarian/);
  assert.match(migration, /Domain-specific custodianship remains in its authoritative domain model/);
});
