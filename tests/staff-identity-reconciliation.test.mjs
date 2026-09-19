import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const migration = await read("supabase/migrations/20260919161000_staff_identity_reconciliation.sql");
const page = await read("src/app/staff/page.tsx");
const access = await read("src/features/staff/staff-access-manager.tsx");
const actions = await read("src/features/staff/server/access-actions.ts");

test("staff reconciliation preserves canonical identity and evidence boundaries", () => {
  assert.match(migration, /reconciled_into_staff_member_id/);
  assert.match(migration, /reconcile_staff_identities/);
  assert.match(migration, /Type RECONCILE to confirm/);
  assert.match(migration, /exact_employee_number/);
  assert.match(migration, /shared_auth_account/);
  assert.match(migration, /Strong identity evidence is required/);
  assert.match(migration, /Cannot reconcile two different linked Auth accounts/);
  assert.match(migration, /sm\.school_id=p_school_id/);
  assert.match(migration, /ssa\.school_id=p_school_id/);
  assert.match(migration, /ta\.school_id=p_school_id/);
  assert.match(migration, /staff\.identity\.reconciled/);
  assert.match(migration, /teacher_allocations/);
  assert.match(migration, /register_classes/);
  assert.doesNotMatch(migration, /delete from public\.staff_members/i);
  assert.doesNotMatch(migration, /delete from public\.school_memberships/i);
  assert.doesNotMatch(migration, /delete from public\.staff_school_assignments/i);
});

test("staff corrections are audited without changing Auth identity", () => {
  assert.match(migration, /correct_staff_details/);
  assert.match(migration, /staff\.identity\.corrected/);
  assert.match(migration, /auth_email_unchanged/);
  assert.match(actions, /correct_staff_details/);
  assert.match(access, /Correct staff details/);
});

test("directory exposes one governed identity action with responsive states", () => {
  assert.match(page, /StaffIdentityManager/);
  assert.match(access, /Reconcile duplicate/);
  assert.match(access, /Manage identity/);
  assert.match(access, /loading|Saving|Reconciling/);
  assert.match(access, /sm:grid-cols-2/);
});