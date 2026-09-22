import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const context = readFileSync("src/lib/auth/get-user-context.ts", "utf8");
const proxy = readFileSync("src/lib/supabase/proxy.ts", "utf8");

test("protected request boundary and user context use verified JWT claims", () => {
  assert.match(proxy, /supabase\.auth\.getClaims\(\)/);
  assert.match(context, /supabase\.auth\.getClaims\(\)/);
  assert.doesNotMatch(context, /supabase\.auth\.getUser\(\)/);
});

test("session user is accepted only when it matches the verified JWT subject", () => {
  assert.match(context, /supabase\.auth\.getSession\(\)/);
  assert.match(context, /user\.id !== verifiedUserId/);
});

test("user context remains request-memoized", () => {
  assert.match(context, /export const getUserContext = cache\(async/);
});
