import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const queue = source("src/features/attendance/offline/subject-period-queue.ts");
const route = source("src/app/api/offline/attendance/subject-period/route.ts");
const action = source("src/features/attendance/server/subject-actions.ts");
const register = source("src/features/attendance/subject-period-register.tsx");
const runtime = source("src/components/offline/offline-runtime.tsx");
const db = source("src/lib/offline/db.ts");
const fallback = source("src/components/offline/offline-subject-period-workspace.tsx");
const offlinePage = source("src/app/offline/page.tsx");

 test("subject-period offline queue reuses scoped durable mutations and snapshots", () => {
  assert.match(queue, /SUBJECT_ATTENDANCE_MUTATION/);
  assert.match(queue, /enqueueOfflineMutation/);
  assert.match(queue, /saveOfflineSnapshot/);
  assert.match(queue, /clientMutationId/);
  assert.match(queue, /status: "conflicted"/);
  assert.match(queue, /status: "rejected"/);
  assert.match(queue, /offline\/attendance\/subject-period/);
  assert.match(db, /scopeKey/);
});

test("subject-period sync reuses the canonical RPC through authenticated server validation", () => {
  assert.match(route, /context\.user\.id !== parsed\.data\.scope\.userId/);
  assert.match(route, /membership\.tenantId !== parsed\.data\.scope\.tenantId/);
  assert.match(route, /membership\.schoolId !== parsed\.data\.scope\.schoolId/);
  assert.match(route, /submitSubjectAttendance/);
  assert.match(route, /source", "offline_sync/);
  assert.match(action, /p_source: parsed\.data\.source/);
  assert.match(action, /submit_subject_period_attendance/);
});

test("subject-period UI queues only while offline and keeps evidence online-first", () => {
  assert.match(register, /navigator\.onLine/);
  assert.match(register, /queueSubjectPeriodAttendance/);
  assert.match(register, /saved on this device/);
  assert.match(register, /cacheSubjectPeriodSnapshot/);
  assert.match(runtime, /syncQueuedSubjectPeriodAttendance/);
  assert.match(register, /clientMutationId/);
});

test("offline fallback exposes the existing scoped subject-period snapshots", () => {
  assert.match(offlinePage, /OfflineSubjectPeriodWorkspace/);
  assert.match(fallback, /getActiveOfflineScope/);
  assert.match(fallback, /listCachedSubjectPeriodSnapshots/);
  assert.match(fallback, /Cached subject-period lesson/);
  assert.match(fallback, /No cached subject-period lesson is available/);
  assert.match(fallback, /Loading cached subject-period lessons/);
  assert.match(fallback, /Cached subject-period lessons could not be loaded/);
  assert.match(fallback, /searchable/);
  assert.match(fallback, /key=\{selected\.id\}/);
  assert.match(fallback, /attendanceDate=\{selected\.payload\.attendanceDate\}/);
  assert.match(fallback, /offlineScope=\{scope\}/);
});

test("offline fallback preserves lesson-only boundaries and local-only safety copy", () => {
  assert.match(fallback, /separate from the daily register/);
  assert.match(fallback, /existing subject-period queue syncs/);
  assert.match(fallback, /Restricted evidence upload is unavailable offline/);
  assert.doesNotMatch(fallback, /indexedDB/);
  assert.doesNotMatch(fallback, /localStorage/);
  assert.doesNotMatch(fallback, /type="file"/);
  assert.match(offlinePage, /OfflineAttendanceWorkspace/);
  assert.match(offlinePage, /OfflineSubjectPeriodWorkspace/);
  assert.match(offlinePage, /OfflineLibraryWorkspace/);
});
