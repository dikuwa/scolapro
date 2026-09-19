import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const page = await read("src/app/staff/page.tsx");
const directory = await read("src/features/staff/server/directory.ts");
const access = await read("src/features/staff/staff-access-manager.tsx");
const actions = await read("src/features/staff/server/access-actions.ts");
const migration = await read("supabase/migrations/20260919150000_staff_access_lifecycle.sql");

test("staff directory exposes access lifecycle states and selected identity action", () => {
  assert.match(page, /StaffAccessManager/);
  assert.match(page, /Invitation pending/);
  assert.match(page, /Account linked/);
  assert.match(directory, /list_staff_access_directory_page/);
  assert.match(access, /Enable ScolaPro access/);
  assert.match(access, /staffMemberId/);
  assert.match(access, /Employee .*bound automatically/);
});

test("linked staff use governed role management without placement mutation", () => {
  assert.match(access, /Add role/);
  assert.match(access, /endStaffRole/);
  assert.match(access, /Role changes do not change the staff placement/);
  assert.match(actions, /add_staff_school_role/);
  assert.match(actions, /end_staff_school_role/);
  assert.doesNotMatch(access, /setPassword|deleteStaff|assign_staff_to_school/);
});

test("database lifecycle binds invitations to exact staff identity and preserves history", () => {
  assert.match(migration, /staff_member_id uuid references public\.staff_members/);
  assert.match(migration, /create_staff_access_invitation/);
  assert.match(migration, /Staff member already has a linked account; manage roles instead/);
  assert.match(migration, /v_invite\.staff_member_id/);
  assert.match(migration, /school_membership\.role_added/);
  assert.match(migration, /school_membership\.role_ended/);
  assert.match(migration, /user_can_manage_current_school_membership/);
  assert.match(migration, /audit_events/);
  assert.doesNotMatch(migration, /delete from public\.school_memberships/i);
});

test("staff access UI remains responsive and provides loading-safe actions", () => {
  assert.match(page, /sm:grid-cols-\[2rem_minmax\(0,1fr\)_minmax\(12rem,0\.7fr\)_minmax\(18rem,1\.3fr\)\]/);
  assert.match(access, /disabled=\{invitePending \|\| !email\}/);
  assert.match(access, /disabled=\{rolePending\}/);
  assert.match(page, /No school staff linked yet/);
});