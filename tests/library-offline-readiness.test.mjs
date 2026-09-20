import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const queue = await read("src/features/library/offline/circulation-queue.ts");
const route = await read("src/app/api/offline/library/route.ts");
const workspace = await read("src/features/library/library-workspace.tsx");
const runtime = await read("src/components/offline/offline-runtime.tsx");
const page = await read("src/app/library/page.tsx");

test("library offline queue is scoped and bounded", () => {
  assert.match(queue, /LIBRARY_CIRCULATION_MUTATION/);
  assert.match(queue, /enqueueOfflineMutation/);
  assert.match(queue, /copies: snapshot\.copies\.slice\(0, 100\)/);
  assert.match(queue, /borrowers: snapshot\.borrowers\.slice\(0, 100\)/);
  assert.match(queue, /slice\(0, 100\)/);
  assert.match(queue, /status: "conflicted"/);
  assert.match(queue, /status: "rejected"/);
});

test("library offline sync revalidates current authenticated school and role", () => {
  assert.match(route, /context\.user\.id !== parsed\.data\.scope\.userId/);
  assert.match(route, /membership\.tenantId !== parsed\.data\.scope\.tenantId/);
  assert.match(route, /membership\.schoolId !== parsed\.data\.scope\.schoolId/);
  assert.match(route, /ltsmRoles\.has\(membership\.roleKey\)/);
  assert.match(route, /issueLibraryResource/);
  assert.match(route, /returnLibraryResource/);
});

test("library workspace queues issue and return only while offline", () => {
  assert.match(workspace, /navigator\.onLine/);
  assert.match(workspace, /queueLibraryCirculation/);
  assert.match(workspace, /action: "issue"/);
  assert.match(workspace, /action: "return"/);
  assert.match(workspace, /cacheLibraryCirculationSnapshot/);
  assert.match(page, /offlineScope=/);
  assert.match(runtime, /syncQueuedLibraryCirculation/);
});
