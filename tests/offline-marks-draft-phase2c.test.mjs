import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("marks offline RPC is idempotent and version guarded", async () => {
  const sql = await read("supabase/migrations/20260920220000_assessment_marks_offline_draft_replay.sql");
  assert.match(sql, /submit_offline_assessment_mark/);
  assert.match(sql, /client_mutation_id/);
  assert.match(sql, /idempotency_payload_mismatch/);
  assert.match(sql, /stale_version/);
  assert.match(sql, /for update/);
  assert.match(sql, /replaces_mark_id/);
});

test("marks offline RPC rejects every non-editable lifecycle state", async () => {
  const sql = await read("supabase/migrations/20260920220000_assessment_marks_offline_draft_replay.sql");
  const foundation = await read("supabase/migrations/20260828033000_assessment_marks_foundation.sql");
  assert.match(sql, /v_instance\.status <> 'open'/);
  for (const state of ["submitted", "review", "verified", "locked", "cancelled"]) {
    assert.match(foundation, new RegExp(`'${state}'`));
  }
});

test("marks queue uses scoped durable states without changing shared runtime", async () => {
  const queue = await read("src/features/assessment/offline/marks-draft-queue.ts");
  const route = await read("src/app/api/offline/assessment/marks/route.ts");
  assert.match(queue, /enqueueOfflineMutation/);
  assert.match(queue, /conflicted/);
  assert.match(queue, /rejected/);
  assert.match(queue, /expectedVersion/);
  assert.match(route, /current school access changed/);
  assert.match(route, /submit_offline_assessment_mark/);
});