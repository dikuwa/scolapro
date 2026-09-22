import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync("src/app/page.tsx", "utf8");

test("home uses the same deterministic primary school membership as the app shell", () => {
  assert.match(home, /context\.currentSchoolMembership \?\? undefined/);
  assert.doesNotMatch(home, /context\.memberships\[0\]/);
});
