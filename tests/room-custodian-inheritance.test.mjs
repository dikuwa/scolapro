import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Issue #702 — Room Inventory: default custodian inheritance + manual override.
// The register teacher is derived, never duplicated, and never merged with the
// room-inventory custodian responsibility.
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const migration = read("supabase/migrations/20260924140000_room_custodian_inheritance.sql");
const pgtap = read("supabase/tests/room_custodian_inheritance_test.sql");
const queries = read("src/features/room-inventory/server/queries.ts");
const actions = read("src/features/room-inventory/server/actions.ts");
const workspace = read("src/features/room-inventory/room-inventory-workspace.tsx");

// SQL comments describe intent; assertions run against executable SQL only.
const sql = migration.replace(/^--.*$/gm, "");

test("1. inheritance is derived only: no new room model and no duplicated teacher data", () => {
  assert.doesNotMatch(sql, /create table/i);
  assert.doesNotMatch(sql, /register_teacher_staff_id\s+uuid/i);
  assert.doesNotMatch(sql, /insert into public\.room_inventory_custodians/i);
  // The derivation reads the canonical home-room relationship from #701.
  assert.match(sql, /rc\.home_room_id\s*=\s*v_room\.id/);
  assert.match(sql, /rc\.register_teacher_staff_id/);
  assert.match(sql, /rc\.tenant_id\s*=\s*v_room\.tenant_id/);
  assert.match(sql, /rc\.school_id\s*=\s*v_room\.school_id/);
});

test("2. resolution precedence is manual override, then inherited default, then explicit states", () => {
  assert.match(sql, /v_out_source\s*:=\s*'manual'/);
  assert.match(sql, /v_out_source\s*:=\s*'inherited'/);
  assert.match(sql, /v_out_source\s*:=\s*'ambiguous'/);
  assert.match(sql, /v_out_source\s*:=\s*'none'/);
  // manual is checked before inherited
  const manual = sql.indexOf("v_out_source := 'manual'");
  const inherited = sql.indexOf("v_out_source := 'inherited'");
  assert.ok(manual > -1 && inherited > -1 && manual < inherited, "manual wins over inherited");
  // ambiguity never resolves to a staff member
  assert.match(sql, /v_out_source\s*:=\s*'ambiguous'[\s\S]{0,80}v_out_staff\s*:=\s*null/);
  // the default and the override stay separately reportable
  assert.match(sql, /inherited_staff_member_id/);
  assert.match(sql, /manual_staff_member_id/);
});

test("3. eligibility honours active staff and governed effective placement", () => {
  assert.match(sql, /staff\.status\s*=\s*'active'/);
  assert.match(sql, /staff_member_covers_school_period\(/);
  assert.match(sql, /home_room_teacher_not_current/);
  assert.match(sql, /home_room_teacher_unassigned/);
  assert.match(sql, /no_home_room_class/);
  assert.match(sql, /multiple_register_teachers/);
});

test("4. clearing an override ends effective rows, keeps history and audits the restore", () => {
  assert.match(sql, /create or replace function public\.clear_room_inventory_custodian\(/);
  assert.match(sql, /set effective_to = p_effective_on - 1/);
  assert.match(sql, /delete from public\.room_inventory_custodians\s+where room_id = v_room\.id\s+and effective_to is null\s+and effective_from >= p_effective_on/);
  assert.match(sql, /room_inventory\.custodian\.cleared/);
  assert.match(sql, /restored_source/);
  assert.match(sql, /restored_staff_member_id/);
  assert.match(sql, /No manual custodian override to clear/);
  assert.match(sql, /not app_private\.can_manage_room_inventory\(v_room\.school_id\)/);
  // ended rows are never rewritten back into history
  assert.doesNotMatch(sql, /delete from public\.room_inventory_custodians\s+where room_id = v_room\.id\s+and effective_to is null\s+and effective_from </);
});

test("5. authority is not broadened by inheritance", () => {
  // #702 must not redefine the custodian authority check at all.
  assert.doesNotMatch(sql, /create or replace function app_private\.is_current_room_inventory_custodian/);
  assert.doesNotMatch(sql, /create or replace function public\.assign_room_inventory_custodian/);
  assert.match(sql, /position\('register_classes' in pg_get_functiondef\('app_private\.is_current_room_inventory_custodian\(uuid\)'::regprocedure\)\) > 0 then/);
  // Internal resolver stays private; the public wrappers authenticate.
  assert.match(sql, /revoke all on function app_private\.resolve_room_custodian_core\(uuid\) from public, anon, authenticated/);
  assert.match(sql, /if auth\.uid\(\) is null then\s+raise exception 'Authentication required'/);
  assert.match(sql, /app_private\.has_school_access\(/);
  assert.doesNotMatch(sql, /grant execute on function app_private\.resolve_room_custodian_core/);
});

test("6. the read model resolves custodians through the canonical resolver", () => {
  assert.match(queries, /supabase\.rpc\("resolve_school_room_custodians", \{ p_school_id: schoolId \}\)/);
  assert.match(queries, /custodianSource/);
  assert.match(queries, /RoomCustodianSource/);
  assert.match(queries, /inheritedCustodianId/);
  assert.match(queries, /inheritedCustodianName/);
  assert.match(queries, /homeRoomClasses/);
  assert.match(queries, /home_room_id/);
  // inheritance never writes: the workspace only reads.
  assert.doesNotMatch(queries, /\.insert\(|\.update\(|\.delete\(/);
  // register teacher names are looked up, never duplicated onto the room.
  assert.match(queries, /register_teacher_staff_id/);
  assert.match(queries, /staffNames\.get\(c\.register_teacher_staff_id\)/);
});

test("7. the clear-override action is governed and feedback-driven", () => {
  assert.match(actions, /export async function clearCustodian/);
  assert.match(actions, /rpc\("clear_room_inventory_custodian",\{p_room_id:p\.data\.roomId,p_effective_on:p\.data\.effectiveOn\}\)/);
  assert.match(actions, /revalidatePath\("\/school\/room-inventory"\)/);
  assert.match(actions, /The manual override could not be cleared/);
  // the assignment path is unchanged
  assert.match(actions, /rpc\("assign_room_inventory_custodian"/);
});

test("8. the workspace shows custodian provenance, not just a name", () => {
  assert.match(workspace, /<CustodianSourceChip source=\{room\.custodianSource\} \/>/);
  assert.match(workspace, /Manual override/);
  assert.match(workspace, /Home room default/);
  assert.match(workspace, /Inherited default — register teacher of/);
  assert.match(workspace, /custodianContextLine\(room\)/);
  // source is always stated in words, never by colour alone
  assert.match(workspace, /custodianSourceLabel: Record<RoomCustodianSource, string>/);
});

test("9. shared-room ambiguity is surfaced as a safe warning and never auto-picked", () => {
  assert.match(workspace, /room\.custodianSource === "ambiguous"/);
  assert.match(workspace, /register classes share this room and name\s+different register teachers/);
  assert.match(workspace, /nothing is\s+picked automatically/);
  assert.match(workspace, /role="status"/);
  assert.match(workspace, /bg-warning-soft\/60/);
  assert.match(workspace, /text-\[color:var\(--warning\)\]/);
  assert.match(workspace, /TriangleAlert/);
  // the warning never disables the manual path
  assert.doesNotMatch(workspace, /disabled=\{[^}]*ambiguous/);
});

test("10. manual override wins in the UI and clearing restores the default", () => {
  assert.match(workspace, /room\.custodianSource === "manual"/);
  assert.match(workspace, /Clear override/);
  assert.match(workspace, /Clearing the override restores the home room default/);
  assert.match(workspace, /Clearing the override[\s\S]{0,400}keeps this\s+assignment in the custodian history/);
  assert.match(workspace, /clearCustodian/);
  assert.match(workspace, /clear\(fd\)/);
  // inherited default pre-fills the governed assignment path
  assert.match(workspace, /Prefilled from the home room default/);
  assert.match(workspace, /room\.inheritedCustodianId/);
  assert.match(workspace, /"Assign as custodian"/);
});

test("11. controls stay on shared ScolaPro components with theme tokens only", () => {
  // Strip issue references such as "#702" so only colour literals are checked.
  const hexSafe = workspace.replace(/#\d{3,5}\b/g, "");
  assert.doesNotMatch(hexSafe, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(workspace, /<select/);
  assert.match(workspace, /from "@\/components\/ui\/picker"/);
  assert.match(workspace, /from "@\/components\/ui\/button"/);
  assert.match(workspace, /from "@\/components\/ui\/date-field"/);
  // no browser-native confirm/prompt for the governance action
  assert.doesNotMatch(workspace, /\bconfirm\(|\bprompt\(/);
});

test("12. pgTAP covers every #702 acceptance behaviour", () => {
  assert.match(pgtap, /select plan\(46\)/);
  for (const name of [
    "inherited custodian is the register teacher",
    "manual override wins over the inherited default",
    "clearing the override restores the inherited default",
    "changing the register teacher changes the inherited default",
    "historical custodian row survives clearing",
    "room without a register class resolves to no custodian",
    "room shared by classes with different register teachers is ambiguous",
    "ambiguous room never silently picks a custodian",
    "cross-school room resolution is denied",
    "cross-tenant room resolution is denied",
    "cross-school inheritance is denied at write time",
    "shared rooms are not blocked by a unique home-room constraint",
    "inherited default does not broaden room inventory authority",
    "a non-manager cannot clear a custodian override",
  ]) {
    assert.match(pgtap, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(pgtap, /order by occurred_at desc limit 1/);
});

