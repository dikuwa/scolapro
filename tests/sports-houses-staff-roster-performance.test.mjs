import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const queries = readFileSync("src/features/sports-houses/server/queries.ts", "utf8");

test("sports houses collapses staff placement assignment and identity reads into one RPC", () => {
  assert.match(queries, /supabase\.rpc\("get_sports_house_staff_roster"/);
  assert.doesNotMatch(queries, /from\("staff_school_assignments"\)/);
  assert.doesNotMatch(queries, /from\("sports_staff_house_assignments"\)/);
  assert.doesNotMatch(queries, /from\("staff_members"\)/);
  assert.doesNotMatch(queries, /readIdentityRowsInChunks|IDENTITY_READ_CHUNK_SIZE/);
});

test("sports houses staff roster preserves workspace mapping semantics", () => {
  assert.match(queries, /houseId: row\.house_id/);
  assert.match(queries, /houseName: house\?\.name \?\? null/);
  assert.match(queries, /roleKey: row\.role_key/);
  assert.match(queries, /assignmentSource: row\.assignment_source/);
  assert.match(queries, /isLocked: row\.is_locked \?\? false/);
  assert.match(queries, /assignedAt: row\.assigned_at/);
  assert.match(queries, /name \|\| "Staff member"/);
});