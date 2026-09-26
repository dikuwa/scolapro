import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const context = readFileSync("src/lib/auth/get-user-context.ts", "utf8");
const proxy = readFileSync("src/lib/supabase/proxy.ts", "utf8");

test("protected request boundary and user context use verified JWT claims", () => {
  assert.match(proxy, /supabase\.auth\.getClaims\(\)/);
  assert.match(context, /supabase\.auth\.getClaims\(\)/);
  assert.match(context, /supabase\.auth\.getUser\(\)/);
});

test("authenticated user is accepted only when it matches the verified JWT subject", () => {
  assert.doesNotMatch(context, /supabase\.auth\.getSession\(\)/);
  assert.match(context, /user\.id !== verifiedUserId/);
});

test("user context remains request-memoized", () => {
  assert.match(context, /export const getUserContext = cache\(async/);
});


test("login redirect validates the backing Auth user before leaving login", () => {
  assert.match(proxy, /if \(isAuthenticated && pathname === "\/login"\)/);
  assert.match(proxy, /await supabase\.auth\.getUser\(\)/);
  assert.match(proxy, /!userError && user\?\.id === data\?\.claims\?\.sub/);
  assert.match(proxy, /return response;/);
});

test("normal protected requests still rely on verified claims without a per-request getUser call in proxy", () => {
  const loginBranch = proxy.indexOf('if (isAuthenticated && pathname === "/login")');
  const firstGetUser = proxy.indexOf("supabase.auth.getUser()");
  assert.ok(loginBranch >= 0 && firstGetUser > loginBranch);
  assert.match(proxy, /const isAuthenticated = Boolean\(data\?\.claims\?\.sub\)/);
});
