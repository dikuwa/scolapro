import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

const db = source("src/lib/offline/db.ts");
const queue = source("src/features/attendance/offline/daily-register-queue.ts");
const daily = source("src/features/attendance/daily-register.tsx");
const route = source("src/app/api/offline/attendance/route.ts");
const runtime = source("src/components/offline/offline-runtime.tsx");
const accountMenu = source("src/components/shell/account-menu.tsx");
const serviceWorker = source("public/sw.js");
const navigation = source("src/components/shell/navigation.tsx");
const action = source("src/features/attendance/server/actions.ts");
const manifest = source("src/app/manifest.ts");
const layout = source("src/app/layout.tsx");

test("PWA install metadata exposes stable identity, raster icons and iOS support", () => {
  assert.match(manifest, /id: "\/"/);
  assert.match(manifest, /start_url: "\/"/);
  assert.match(manifest, /scope: "\/"/);
  assert.match(manifest, /icon-192\.png/);
  assert.match(manifest, /icon-512\.png/);
  assert.match(manifest, /sizes: "192x192"/);
  assert.match(manifest, /sizes: "512x512"/);
  assert.match(layout, /appleWebApp: \{/);
  assert.match(layout, /icon-180\.png/);
});

test("offline business data uses scoped IndexedDB rather than localStorage", () => {
  assert.match(db, /indexedDB\.open\(DB_NAME, DB_VERSION\)/);
  assert.match(db, /userId: string/);
  assert.match(db, /tenantId: string/);
  assert.match(db, /schoolId: string/);
  assert.match(db, /scopeKey/);
  assert.doesNotMatch(db + queue, /localStorage/);
});

test("context changes and logout clear scoped offline data", () => {
  assert.match(db, /snapshots\.clear\(\)/);
  assert.match(db, /mutations\.clear\(\)/);
  assert.match(accountMenu, /clearOfflineData/);
});

test("attendance offline retry preserves the existing idempotency key and source provenance", () => {
  assert.match(queue, /clientMutationId/);
  assert.match(route, /formData\.set\("clientMutationId"/);
  assert.match(route, /formData\.set\("source", "offline"\)/);
  assert.match(action, /p_client_mutation_id: parsed\.data\.clientMutationId/);
  assert.match(action, /p_source: parsed\.data\.source/);
});

test("offline sync revalidates the exact authenticated user tenant and school", () => {
  assert.match(route, /context\.user\.id !== parsed\.data\.scope\.userId/);
  assert.match(route, /membership\.tenantId !== parsed\.data\.scope\.tenantId/);
  assert.match(route, /membership\.schoolId !== parsed\.data\.scope\.schoolId/);
  assert.match(route, /status: 409/);
});

test("daily register queues locally only when the browser is offline", () => {
  assert.match(daily, /navigator\.onLine/);
  assert.match(daily, /event\.preventDefault\(\)/);
  assert.match(daily, /queueDailyRegister/);
  assert.match(daily, /Attendance saved on this device/);
});

test("attendance evidence stays online-first in phase one", () => {
  assert.match(daily, /hasQueuedEvidence/);
  assert.match(daily, /Attendance evidence needs a connection/);
  assert.doesNotMatch(queue, /FileReader|arrayBuffer\(/);
});

test("service worker caches shell assets but never business API responses", () => {
  assert.match(serviceWorker, /_next\/static/);
  assert.match(serviceWorker, /OFFLINE_PATH/);
  assert.match(serviceWorker, /CACHE_NAME = "scolapro-shell-v2"/);
  assert.match(serviceWorker, /icon-192\.png/);
  assert.match(serviceWorker, /icon-512\.png/);
  assert.doesNotMatch(serviceWorker, /\/api\//);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
});

test("offline shell exposes cached attendance and registers synchronization runtime", () => {
  assert.match(runtime, /serviceWorker\.register\("\/sw\.js"/);
  assert.match(runtime, /window\.addEventListener\("online"/);
  assert.match(queue, /listCachedDailyRegisters/);
  assert.match(db, /SNAPSHOTS/);
});

test("role navigation uses Next route-shell prefetching without custom eager fetch hooks", () => {
  const links = [...navigation.matchAll(/<Link[^>]+>/g)].map((match) => match[0]);
  assert.ok(links.length > 0);
  for (const link of links) {
    assert.doesNotMatch(link, /prefetch=\{false\}/, `navigation link should allow Next shell prefetching: ${link}`);
  }
  assert.doesNotMatch(navigation, /router\.prefetch/);
});
