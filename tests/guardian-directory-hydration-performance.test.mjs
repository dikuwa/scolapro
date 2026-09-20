import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const directory = await read("src/features/guardians/server/directory.ts");
const migration = await read("supabase/migrations/20260920180000_guardian_directory_detail_hydration.sql");

test("guardian directory hydrates details through one governed RPC", () => {
  assert.match(directory, /rpc\("get_guardian_directory_details"/);
  assert.match(directory, /p_school_id: schoolId/);
  assert.match(directory, /p_guardian_ids: guardianIds/);
  assert.doesNotMatch(directory, /from\("guardian_contacts"\)/);
  assert.doesNotMatch(directory, /from\("guardian_addresses"\)/);
  assert.doesNotMatch(directory, /from\("guardian_profiles"\)/);
});

test("hydration RPC enforces current-school and scoped guardian visibility", () => {
  assert.match(migration, /is_guardian_current_school\(p_school_id\)/);
  assert.match(migration, /platform_admin/);
  assert.match(migration, /school_admin','principal','deputy_principal','counsellor','hod/);
  assert.match(migration, /can_access_learner_observations\(e\.school_id,e\.learner_id\)/);
  assert.match(migration, /lg\.effective_from<=current_date/);
  assert.match(migration, /e\.enrolled_from<=current_date/);
});

test("hydration RPC keeps client execute boundary explicit", () => {
  assert.match(migration, /revoke all on function public\.get_guardian_directory_details\(uuid,uuid\[\]\) from public,anon/);
  assert.match(migration, /grant execute on function public\.get_guardian_directory_details\(uuid,uuid\[\]\) to authenticated/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path=pg_catalog,public,app_private/);
});
