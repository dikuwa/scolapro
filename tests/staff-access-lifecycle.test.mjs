import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const page = await read("src/app/staff/page.tsx");
const directory = await read("src/features/staff/server/directory.ts");
const access = await read("src/features/staff/staff-access-manager.tsx");
const actions = await read("src/features/staff/server/access-actions.ts");
const migration = await read("supabase/migrations/20260919151000_staff_access_lifecycle.sql");
const revocationMigration = await read("supabase/migrations/20261007081500_staff_role_immediate_revocation.sql");

test("staff directory exposes compact access lifecycle states and identity action", () => {
  assert.match(page, /StaffDirectoryRowControls/);
  assert.match(directory, /list_staff_access_directory_page/);
  assert.match(access, /Invitation pending/);
  assert.match(access, /Account linked/);
  assert.match(access, /No login account/);
  assert.match(access, /Manage access/);
  assert.match(access, /staffMemberId/);
});

test("linked staff use governed role management without placement mutation", () => {
  assert.match(access, /Add role/);
  assert.match(access, /endStaffRole/);
  assert.match(access, /No active ScolaPro roles/);
  assert.match(actions, /add_staff_school_role/);
  assert.match(actions, /end_staff_school_role/);
  assert.doesNotMatch(access, /setPassword|deleteStaff|assign_staff_to_school/);
});

test("database lifecycle binds invitations to exact staff identity and preserves history", () => {
  assert.match(migration, /staff_member_id uuid references public\.staff_members/);
  assert.match(migration, /create_staff_access_invitation/);
  assert.match(migration, /Staff member already has a linked account; manage roles instead/);
  assert.match(migration, /v_invite\.staff_member_id/);
  assert.match(migration, /where si\.token_hash=encode\(digest\(p_token,'sha256'\),'hex'\) for update/);
  assert.match(migration, /v_invite\.status='accepted'/);
  assert.match(migration, /v_invite\.accepted_user_id=auth\.uid\(\)/);
  assert.match(migration, /return query select v_invite\.school_id,v_invite\.role_key/);
  assert.match(migration, /from public\.staff_school_assignments as ssa/);
  assert.match(migration, /ssa\.school_id=v_invite\.school_id and ssa\.staff_member_id=v_staff_id/);
  assert.match(migration, /from public\.staff_members as sm/);
  assert.match(migration, /sm\.tenant_id=v_invite\.tenant_id/);
  assert.match(migration, /school_membership\.role_added/);
  assert.match(migration, /school_membership\.role_ended/);
  assert.match(migration, /user_can_manage_current_school_membership/);
  assert.match(migration, /audit_events/);
  assert.doesNotMatch(migration, /delete from public\.school_memberships/i);
});

test("staff role revocation stops current authorization without UI-only filtering", () => {
  assert.match(revocationMigration, /p_effective_to date default \(current_date - 1\)/);
  assert.match(revocationMigration, /active_to >= \(active_from - 1\)/);
  assert.match(revocationMigration, /school_membership\.role_ended/);
  assert.match(revocationMigration, /revoked_on/);
  assert.doesNotMatch(revocationMigration, /delete from public\.school_memberships/i);
});

test("social worker invitations preserve canonical support placement", () => {
  assert.match(
    migration,
    /v_invite\.role_key in \('counsellor','social_worker','librarian'\) then 'support'/,
  );
});

test("staff access UI remains responsive and provides loading-safe actions", () => {
  assert.match(page, /md:grid-cols-\[2rem_minmax\(0,1fr\)_minmax\(11rem,0\.8fr\)\]/);
  assert.match(page, /lg:grid-cols-\[2rem_minmax\(15rem,1\.1fr\)_minmax\(12rem,0\.72fr\)_minmax\(24rem,1\.45fr\)\]/);
  assert.match(access, /disabled=\{invitePending \|\| !email\}/);
  assert.match(access, /loading=\{rolePending\}/);
  assert.match(page, /No school staff linked yet/);
});