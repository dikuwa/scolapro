import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const queue = source("src/features/teaching/offline/coverage-queue.ts");
const route = source("src/app/api/offline/teaching/coverage/route.ts");
const action = source("src/features/teaching/server/coverage-actions.ts");
const workspace = source("src/features/teaching/coverage-workspace.tsx");
const migration = source("supabase/migrations/20260921120000_teaching_actual_offline_idempotency.sql");
const dbTest = source("supabase/tests/teaching_actual_offline_idempotency_test.sql");

test("teaching coverage uses a bounded scoped durable queue and cache", () => {
  assert.match(queue, /TEACHING_COVERAGE_MUTATION/);
  assert.match(queue, /TEACHING_COVERAGE_SNAPSHOT/);
  assert.match(queue, /enqueueOfflineMutation/);
  assert.match(queue, /saveOfflineSnapshot/);
  assert.match(queue, /scheduleItemId/);
  assert.match(queue, /status: "conflicted"/);
  assert.match(queue, /status: "rejected"/);
  assert.doesNotMatch(queue, /localStorage|cache\("/);
});

test("reconnect revalidates exact authenticated school scope through the canonical action", () => {
  assert.match(route, /context\.user\.id !== parsed\.data\.scope\.userId/);
  assert.match(route, /membership\.tenantId !== parsed\.data\.scope\.tenantId/);
  assert.match(route, /membership\.schoolId !== parsed\.data\.scope\.schoolId/);
  assert.match(route, /recordTeachingActual/);
  assert.match(route, /source", "offline_sync"/);
  assert.match(action, /record_teaching_actual_idempotent/);
  assert.match(action, /teaching_schedule_items/);
});

test("coverage preserves actual fields and never rewrites planned teaching", () => {
  for (const field of ["taughtOn", "periodsUsed", "coverageState", "reflection", "compensatoryAction"]) assert.match(queue, new RegExp(field));
  assert.match(workspace, /planned schedule item is not modified/);
  assert.match(workspace, /queueTeachingActual/);
  assert.match(workspace, /syncQueuedTeachingActuals/);
});

test("database contract is append-only and idempotent with executable regression coverage", () => {
  assert.match(migration, /record_teaching_actual_idempotent/);
  assert.match(migration, /client_operation_receipts/);
  assert.match(migration, /teaching_actuals/);
  assert.match(migration, /can_record_teaching_actual/);
  assert.doesNotMatch(migration, /update public\.teaching_schedule_items|delete from public\.teaching_schedule_items/);
  assert.match(dbTest, /replaying the same operation returns the original actual/);
  assert.match(dbTest, /changed teaching data is rejected/);
  assert.match(dbTest, /offline recording never rewrites planned schedule items/);
});
