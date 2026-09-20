import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const subjectAction = await read("src/features/attendance/server/subject-actions.ts");
const dailyRoute = await read("src/app/api/offline/attendance/route.ts");
const subjectRoute = await read("src/app/api/offline/attendance/subject-period/route.ts");
const libraryRoute = await read("src/app/api/offline/library/route.ts");
const db = await read("src/lib/offline/db.ts");
const sw = await read("public/sw.js");
const accountMenu = await read("src/components/shell/account-menu.tsx");

test("offline storage remains explicitly scoped and cleared on context/logout", () => {
  assert.match(db, /userId: string/);
  assert.match(db, /tenantId: string/);
  assert.match(db, /schoolId: string/);
  assert.match(db, /scopeKey/);
  assert.match(db, /mutations\.clear\(\)/);
  assert.match(db, /snapshots\.clear\(\)/);
  assert.match(accountMenu, /clearOfflineData/);
});

test("offline endpoints revalidate authenticated user tenant and school", () => {
  for (const route of [dailyRoute, subjectRoute, libraryRoute]) {
    assert.match(route, /context\.user\.id !== parsed\.data\.scope\.userId/);
    assert.match(route, /membership\.tenantId !== parsed\.data\.scope\.tenantId/);
    assert.match(route, /membership\.schoolId !== parsed\.data\.scope\.schoolId/);
  }
});

test("service worker never caches business API responses", () => {
  assert.doesNotMatch(sw, /stableAsset[\s\S]*\/api\//);
  assert.match(sw, /_next\/static/);
  assert.match(sw, /\/brand\//);
});

test("subject attendance failures do not expose raw database error text to offline queues", () => {
  assert.doesNotMatch(subjectAction, /return \{ message: error\.message \}/);
  assert.match(subjectAction, /Lesson attendance could not be saved/);
  assert.match(subjectAction, /z\.string\(\)\.max\(500\)\.nullable\(\)/);
});
