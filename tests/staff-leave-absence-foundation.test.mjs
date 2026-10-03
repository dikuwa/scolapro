import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261003222000_staff_leave_absence_foundation.sql", "utf8");
const pg = readFileSync("supabase/tests/staff_leave_absence_foundation_test.sql", "utf8");
const actions = readFileSync("src/features/staff/leave/server/actions.ts", "utf8");
const workspace = readFileSync("src/features/staff/leave/server/workspace.ts", "utf8");
const component = readFileSync("src/features/staff/leave/staff-leave-workspace.tsx", "utf8");
const page = readFileSync("src/app/staff/leave/page.tsx", "utf8");
const navigation = readFileSync("src/components/shell/navigation.tsx", "utf8");

test("leave foundation does not seed invented policy entitlements or a mutable balance column", () => {
  assert.doesNotMatch(migration, /insert into public\.staff_leave_types/i);
  assert.doesNotMatch(migration, /\bbalance\s+numeric/i);
  assert.match(migration, /units_delta numeric\(8,2\)/);
  assert.match(migration, /Staff leave ledger entries are immutable/);
  assert.match(migration, /A source reference is required for manual leave ledger entries/);
});

test("request, decision, cancellation and operational absence remain distinct audited lifecycle steps", () => {
  assert.match(migration, /staff\.leave_request\.submitted/);
  assert.match(migration, /staff\.leave_request\.approved/);
  assert.match(migration, /staff\.leave_request\.rejected/);
  assert.match(migration, /staff\.leave_request\.cancelled/);
  assert.match(migration, /insert into public\.staff_absences/);
  assert.match(migration, /Approved leave cancellation reversal/);
  assert.match(migration, /Staff leave decision history is final/);
});

test("self-service and school-wide authority remain separated", () => {
  assert.match(migration, /staff_leave_actor_staff_member/);
  assert.match(migration, /array\['school_admin','principal','deputy_principal'\]/);
  assert.match(migration, /Staff cannot approve or reject their own leave request/);
  assert.match(page, /managerRoles/);
  assert.match(page, /staffMemberId/);
});

test("private evidence uses a bounded storage path and approval can require evidence", () => {
  assert.match(migration, /staff-leave-evidence/);
  assert.match(migration, /can_access_staff_leave_object/);
  assert.match(migration, /Required leave evidence has not been attached/);
  assert.match(actions, /10 \* 1024 \* 1024/);
  assert.match(actions, /register_staff_leave_attachment/);
});

test("workspace derives balances and timetable impact instead of mutating calendar or timetable", () => {
  assert.match(migration, /sum\(le\.units_delta\)/);
  assert.match(migration, /join public\.timetable_slots ts/);
  assert.match(migration, /ts\.status='active'/);
  assert.doesNotMatch(migration, /update public\.timetable_slots/i);
  assert.doesNotMatch(migration, /insert into public\.school_day_overrides/i);
  assert.match(workspace, /list_staff_leave_workspace/);
  assert.match(component, /Timetable slots/);
});

test("staff leave route is responsive and reachable by employee roles without exposing it to learners or parents", () => {
  assert.match(component, /sm:grid-cols-4/);
  assert.match(component, /lg:grid-cols-2/);
  assert.match(navigation, /staff_leave/);
  assert.match(navigation, /teacher: \["staff_leave"/);
  assert.doesNotMatch(navigation, /learner: \[[^\]]*"staff_leave"/);
  assert.doesNotMatch(navigation, /parent: \[[^\]]*"staff_leave"/);
  assert.match(page, /Staff Leave & Absence/);
});

test("pgTAP plan matches the focused lifecycle assertions", () => {
  const plan = Number(pg.match(/select plan\((\d+)\)/)?.[1] ?? 0);
  const assertions = ["has_table", "has_function", "is", "ok", "throws_ok", "lives_ok"]
    .reduce((sum, name) => sum + (pg.match(new RegExp(`select\\s+${name}\\s*\\(`, "gi")) ?? []).length, 0);
  assert.equal(plan, assertions);
  assert.equal(plan, 33);
});
