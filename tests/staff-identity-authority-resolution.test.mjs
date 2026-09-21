import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260921130000_staff_identity_authority_resolution.sql", import.meta.url),
  "utf8",
);

test("authority resolution stays bound to the confirmed Martin Mukoya case", () => {
  assert.match(migration, /6cd951d1-c0cc-49b0-91ed-23e3efcd1843/);
  assert.match(migration, /a77cb29b-5949-44f3-88f6-0fd2eeff1b06/);
  assert.match(migration, /941dd4db-e760-4695-b084-a2b6a5941086/);
  assert.match(migration, /AUTHORIZE MARTIN MUKOYA EMP-001 RESOLUTION/);
  assert.match(migration, /not available for arbitrary identities/);
});

test("authority resolution preserves auth and reconciliation provenance", () => {
  assert.match(migration, /preserved_secondary_auth_user_id/);
  assert.match(migration, /auth_accounts_reassigned',false/);
  assert.match(migration, /auth_accounts_deleted',false/);
  assert.match(migration, /reconciled_into_staff_member_id/);
  assert.match(migration, /staff\.identity\.authority_resolved/);
  assert.doesNotMatch(migration, /delete from public\.staff_members/i);
  assert.doesNotMatch(migration, /delete from auth\.users/i);
});

test("authority resolution preserves operational references without weakening normal reconciliation", () => {
  assert.match(migration, /staff_school_assignments/);
  assert.match(migration, /teacher_allocations/);
  assert.match(migration, /register_classes/);
  assert.match(migration, /user_can_reconcile_staff/);
  assert.doesNotMatch(migration, /create or replace function public\.reconcile_staff_identities/);
});
