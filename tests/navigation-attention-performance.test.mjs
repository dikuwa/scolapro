import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appShell = readFileSync("src/components/shell/app-shell.tsx", "utf8");
const shellFrame = readFileSync("src/components/shell/shell-frame.tsx", "utf8");
const route = readFileSync("src/app/api/navigation-attention/route.ts", "utf8");

test("navigation attention no longer blocks the server AppShell", () => {
  assert.doesNotMatch(appShell, /getNavigationAttentionCounts\(/);
  assert.doesNotMatch(appShell, /attentionPromise/);
  assert.match(appShell, /attentionCacheKey/);
});

test("attention badges hydrate after shell render with a short per-user session cache", () => {
  assert.match(shellFrame, /fetch\("\/api\/navigation-attention"/);
  assert.match(shellFrame, /sessionStorage/);
  assert.match(shellFrame, /Date\.now\(\) \+ 30_000/);
  assert.match(shellFrame, /resolvedAttentionCounts/);
});

test("attention endpoint derives school and role from authenticated context", () => {
  assert.match(route, /getUserContext\(\)/);
  assert.match(route, /context\.currentSchoolMembership/);
  assert.match(route, /getNavigationAttentionCounts\(membership\.schoolId, membership\.roleKey\)/);
  assert.match(route, /private, no-store/);
});
