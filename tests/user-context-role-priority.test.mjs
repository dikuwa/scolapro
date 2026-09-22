import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const context = readFileSync("src/lib/auth/get-user-context.ts", "utf8");

test("primary school membership uses deterministic role priority", () => {
  assert.match(context, /primarySchoolRolePriority/);
  assert.match(context, /"school_admin",[\s\S]*"principal",[\s\S]*"teacher"/);
  assert.match(context, /primarySchoolMembership\(memberships\)/);
  assert.doesNotMatch(context, /const currentSchoolMembership = memberships\[0\]/);
});
