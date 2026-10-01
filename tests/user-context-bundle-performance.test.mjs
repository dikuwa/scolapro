import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const context = readFileSync("src/lib/auth/get-user-context.ts", "utf8");

test("user context resolves shared DB state through one self-scoped RPC", () => {
  assert.match(context, /supabase\.rpc\("get_my_user_context", \{ p_as_of_date: today \}\)/);
  assert.doesNotMatch(context, /\.from\("user_profiles"\)/);
  assert.doesNotMatch(context, /\.from\("school_memberships"\)/);
  assert.doesNotMatch(context, /\.from\("platform_memberships"\)/);
  assert.doesNotMatch(context, /\.from\("education_network_memberships"\)/);
  assert.doesNotMatch(context, /supabase\.rpc\("get_my_guardian_links"\)/);
});

test("identity verification remains outside the bundled DB RPC", () => {
  assert.match(context, /supabase\.auth\.getClaims\(\)/);
  assert.match(context, /supabase\.auth\.getUser\(\)/);
  assert.match(context, /user\.id !== verifiedUserId/);
});

test("current-school selection and role priority remain application-side", () => {
  assert.match(context, /const currentSchoolId = allSchoolMemberships\[0\]\?\.schoolId \?\? null/);
  assert.match(context, /primarySchoolMembership\(memberships\)/);
});
