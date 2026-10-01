import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const context = readFileSync("src/lib/auth/get-user-context.ts", "utf8");

test("user context collapses shared database reads into one self-scoped RPC", () => {
  assert.match(
    context,
    /supabase\.rpc\("get_my_user_context", \{ p_as_of: today \}\)/,
  );
  assert.doesNotMatch(context, /\.from\("user_profiles"\)/);
  assert.doesNotMatch(context, /\.from\("school_memberships"\)/);
  assert.doesNotMatch(context, /\.from\("platform_memberships"\)/);
  assert.doesNotMatch(context, /\.from\("education_network_memberships"\)/);
  assert.doesNotMatch(context, /supabase\.rpc\("get_my_guardian_links"\)/);
});

test("user context keeps verified Auth identity checks outside the bundled RPC", () => {
  assert.match(context, /supabase\.auth\.getClaims\(\)/);
  assert.match(context, /supabase\.auth\.getUser\(\)/);
  assert.match(context, /user\.id !== verifiedUserId/);
});

test("user context keeps deterministic as-of date and role selection in TypeScript", () => {
  assert.match(context, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(context, /primarySchoolMembership\(memberships\)/);
  assert.match(context, /allSchoolMemberships\[0\]\?\.schoolId/);
});

test("bundled payload preserves profile fallback and all membership families", () => {
  assert.match(context, /profile\?\.preferred_name/);
  assert.match(context, /context\?\.school_memberships/);
  assert.match(context, /context\?\.platform_memberships/);
  assert.match(context, /context\?\.network_memberships/);
  assert.match(context, /context\?\.guardian_links/);
});
