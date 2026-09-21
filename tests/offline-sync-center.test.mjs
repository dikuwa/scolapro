import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const center = read("src/components/offline/offline-sync-center.tsx");
const runtime = read("src/components/offline/offline-runtime.tsx");
const db = read("src/lib/offline/db.ts");

test("offline sync center reads only the current scoped queue", () => {
  assert.match(center, /listOfflineMutations<Record<string, unknown>>\(scope\)/);
  assert.match(center, /record\.userId === scope\.userId/);
  assert.match(center, /record\.tenantId === scope\.tenantId/);
  assert.match(center, /record\.schoolId === scope\.schoolId/);
  assert.match(center, /signed-in user and school/i);
});

test("known queue kinds have human-readable labels without exposing payloads", () => {
  assert.match(center, /Daily attendance/);
  assert.match(center, /Lesson attendance/);
  assert.match(center, /Library circulation/);
  assert.match(center, /Issue intent/);
  assert.match(center, /Return intent/);
  assert.match(center, /safeReason/);
  assert.doesNotMatch(center, /JSON\.stringify\(record\.payload\)/);
  assert.doesNotMatch(center, /record\.payload\.(exceptions|notes)/);
});

test("attention center exposes all queue states and local timestamps", () => {
  for (const status of ["pending", "syncing", "conflicted", "rejected"]) assert.match(center, new RegExp(status));
  assert.match(center, /record\.updatedAt/);
  assert.match(center, /Updated locally/);
  assert.match(center, /lastError/);
});

test("retry is restricted to pending local items and uses existing sync", () => {
  assert.match(center, /const canRetry = record\.status === "pending"/);
  assert.match(db, /current\.status === "pending"/);
  assert.match(db, /retryOfflineMutation/);
  assert.match(runtime, /retryOfflineMutation/);
  assert.match(runtime, /await sync\(\)/);
  assert.doesNotMatch(center, /record\.status === "(conflicted|rejected)"[\s\S]{0,120}Retry/);
});

test("discard requires inline confirmation and is scoped to local queue records", () => {
  assert.match(center, /Discard local item\?/);
  assert.match(center, /Cancel/);
  assert.match(center, /onDiscard/);
  assert.match(db, /discardOfflineMutation/);
  assert.match(db, /store\.delete\(id\)/);
  assert.match(db, /current\.scopeKey === scopeKey\(scope\)/);
  assert.doesNotMatch(center, /fetch\([^)]*discard|\/api\/.*discard/);
});

test("context switching and logout keep the existing scoped cache clearing", () => {
  assert.match(db, /mutations\.clear\(\)/);
  assert.match(db, /snapshots\.clear\(\)/);
  assert.match(db, /if \(\(current\?\.value \?\? ""\) !== next\)/);
  assert.match(runtime, /activateOfflineScope\(scope\)/);
});

test("status UI remains responsive and reachable from the existing runtime", () => {
  assert.match(runtime, /<OfflineSyncCenter/);
  assert.match(center, /w-\[min\(24rem,calc\(100vw-2rem\)\)\]/);
  assert.match(center, /max-h-\[min\(70vh,40rem\)\]/);
  assert.match(center, /lg:right-5/);
  assert.match(center, /aria-expanded/);
});