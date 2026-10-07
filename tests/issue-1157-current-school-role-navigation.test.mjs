import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync("src/components/shell/app-shell.tsx", "utf8");
const navigation = readFileSync("src/components/shell/navigation.tsx", "utf8");

test("shell unions roles only within the selected school", () => {
  assert.match(shell, /const currentSchoolMemberships = membership/);
  assert.match(shell, /context\.memberships\.filter\(\(item\) => item\.schoolId === membership\.schoolId\)/);
  assert.match(shell, /new Set\(currentSchoolMemberships\.map\(\(item\) => item\.roleKey\)\)/);
  assert.doesNotMatch(shell, /new Set\(context\.memberships\.map\(\(item\) => item\.roleKey\)\)/);
});

test("room inventory staff identity scope also stays inside the current school", () => {
  assert.match(shell, /currentSchoolMemberships\.map\(\(item\) => item\.staffMemberId\)/);
  assert.doesNotMatch(shell, /context\.memberships\.map\(\(item\) => item\.staffMemberId\)/);
});

test("multi-role navigation remains additive so school admin is never narrowed by extra roles", () => {
  assert.match(navigation, /for \(const candidateRole of resolvedRoles\)/);
  assert.match(navigation, /allowed\.add\(key\)/);
  assert.match(navigation, /school_admin: \[[\s\S]*"school_settings"[\s\S]*"staff"[\s\S]*"learners"[\s\S]*"timetable"[\s\S]*"assessment"/);
});
