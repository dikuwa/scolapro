import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appShell = readFileSync("src/components/shell/app-shell.tsx", "utf8");
const shellFrame = readFileSync("src/components/shell/shell-frame.tsx", "utf8");
const route = readFileSync("src/app/api/navigation-attention/route.ts", "utf8");
const attention = readFileSync("src/features/notifications/server/navigation-attention.ts", "utf8");

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

test("attention endpoint preserves unauthenticated JSON 401 without restoring context reads", () => {
  assert.match(route, /createSupabaseServerClient\(\)/);
  assert.match(route, /supabase\.auth\.getClaims\(\)/);
  assert.match(route, /status:\s*401/);
  assert.ok(route.indexOf("getClaims()") < route.indexOf("getNavigationAttentionCounts()"));
  assert.doesNotMatch(route, /getUserContext\(\)/);
  assert.doesNotMatch(route, /currentSchoolMembership/);
  assert.match(route, /getNavigationAttentionCounts\(\)/);
  assert.match(route, /private, no-store/);
});

test("navigation attention uses one self-scoped RPC and no direct queue table read", () => {
  assert.match(attention, /supabase\.rpc\("get_my_navigation_attention"/);
  assert.match(attention, /getNamibiaDateKey\(\)/);
  assert.doesNotMatch(attention, /profile_change_requests/);
  assert.doesNotMatch(attention, /getUserContext\(/);
});
