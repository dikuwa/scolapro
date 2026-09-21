import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const workspace = await read("src/components/offline/offline-library-workspace.tsx");
const page = await read("src/app/offline/page.tsx");
const queue = await read("src/features/library/offline/circulation-queue.ts");
const db = await read("src/lib/offline/db.ts");

test("offline fallback reads only the active scoped library snapshot and existing queue", () => {
  assert.match(page, /<OfflineLibraryWorkspace \/>/);
  assert.match(workspace, /getActiveOfflineScope/);
  assert.match(workspace, /listOfflineSnapshots<LibraryCirculationSnapshot>\(activeScope, LIBRARY_CIRCULATION_SNAPSHOT\)/);
  assert.match(workspace, /listOfflineMutations<OfflineLibraryCirculationPayload/);
  assert.match(workspace, /setSnapshot\(current\)/);
  assert.match(db, /scopeKey/);
});

test("offline fallback queues bounded issue and return intents through the existing circulation queue", () => {
  assert.match(workspace, /queueLibraryCirculation\(scope, \{\s*action: "issue"/);
  assert.match(workspace, /queueLibraryCirculation\(scope, \{\s*action: "return"/);
  assert.match(workspace, /Save issue intent/);
  assert.match(workspace, /Save return intent/);
  assert.match(workspace, /Local only/);
  assert.match(workspace, /remains unallocated until server sync accepts it/);
  assert.match(workspace, /remains active until server sync accepts it/);
  assert.match(queue, /LIBRARY_CIRCULATION_MUTATION/);
  assert.doesNotMatch(workspace, /CatalogManager|LibraryImport|ClassOperations/);
});

test("offline fallback has safe empty state and does not render raw queued payloads", () => {
  assert.match(workspace, /No library circulation snapshot is available on this device yet/);
  assert.match(workspace, /No library circulation snapshot is available/);
  assert.doesNotMatch(workspace, /record\.payload\.notes/);
  assert.doesNotMatch(workspace, /record\.lastError/);
});