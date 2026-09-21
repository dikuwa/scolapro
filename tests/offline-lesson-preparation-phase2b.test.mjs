import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const workspace = await read("src/features/academics/lesson-preparation-workspace.tsx");
const queue = await read("src/features/academics/offline/lesson-preparation-queue.ts");
const route = await read("src/app/api/offline/lesson-preparation/route.ts");
const action = await read("src/features/academics/server/lesson-preparation.ts");
const migration = await read("supabase/migrations/20260921123000_lesson_preparation_offline_drafts.sql");
const runtime = await read("src/components/offline/offline-runtime.tsx");
const center = await read("src/components/offline/offline-sync-center.tsx");

test("preparation drafts use scoped IndexedDB and stable queued mutations", () => {
  assert.match(workspace, /scoped IndexedDB/);
  assert.doesNotMatch(workspace, /localStorage/);
  assert.match(queue, /enqueueOfflineMutation/);
  assert.match(queue, /clientMutationId/);
  assert.match(queue, /saveOfflineSnapshot/);
});

test("sync revalidates user, tenant, school and draft authority", () => {
  assert.match(route, /context\.user\.id !== parsed\.data\.scope\.userId/);
  assert.match(route, /membership\.tenantId !== parsed\.data\.scope\.tenantId/);
  assert.match(route, /membership\.schoolId !== parsed\.data\.scope\.schoolId/);
  assert.match(migration, /p_client_mutation_id/);
  assert.match(migration, /v_existing\.status <> 'draft'/);
  assert.match(migration, /server draft changed while this device was offline/);
  assert.match(action, /save_lesson_preparation_offline_draft/);
  assert.match(migration, /different lesson preparation data/);
});

test("offline scope is bounded to the current preparation and reconnect", () => {
  assert.match(workspace, /getCachedLessonPreparationDraft/);
  assert.match(workspace, /syncQueuedLessonPreparationDrafts/);
  assert.match(workspace, /preparationUpdatedAt/);
  assert.match(workspace, /preparationStatus && selected\.preparationStatus !== "draft"/);
  assert.match(runtime, /syncQueuedLessonPreparationDrafts/);
  assert.match(center, /LESSON_PREPARATION_MUTATION/);
  assert.match(center, /Lesson preparation/);
  assert.match(queue, /expectedUpdatedAt: body\.updatedAt/);
});