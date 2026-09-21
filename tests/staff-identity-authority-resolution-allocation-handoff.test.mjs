import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260921131500_staff_identity_authority_resolution_allocation_handoff.sql", import.meta.url),
  "utf8",
);

test("authority resolution preserves immutable teacher allocation identity", () => {
  assert.doesNotMatch(migration, /set\s+staff_member_id\s*=\s*c_canonical_staff_id\s+where\s+id=v_allocation\.id/is);
  assert.match(migration, /set active_to=current_date-1/);
  assert.match(migration, /create_teacher_allocation_period/);
  assert.match(migration, /dependent records; review required/);
});

test("canonical current placement and teacher access are recreated explicitly", () => {
  assert.match(migration, /insert into public\.staff_school_assignments/);
  assert.match(migration, /position_title/);
  assert.match(migration, /insert into public\.school_memberships/);
  assert.match(migration, /'teacher',current_date,null/);
});

test("historical and auth provenance remain retained", () => {
  assert.match(migration, /preserved_secondary_auth_user_id/);
  assert.match(migration, /preserved_revoked_school_invitations/);
  assert.match(migration, /auth_accounts_reassigned',false/);
  assert.doesNotMatch(migration, /delete from auth\.users/i);
});
