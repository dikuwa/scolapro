import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Wave 3 curriculum route is dedicated and current-school staff scoped", () => {
  const page = read("src/app/teaching/curriculum/page.tsx");
  assert.match(page, /login\?next=\/teaching\/curriculum/);
  assert.match(page, /context\.platformMemberships\.length/);
  assert.match(page, /context\.memberships\.find/);
  assert.match(page, /Boolean\(item\.staffMemberId\)/);
  assert.match(page, /getTeacherCurriculumAccess/);
  assert.match(page, /schoolId: membership\.schoolId/);
  assert.match(page, /staffMemberId: membership\.staffMemberId/);
  assert.doesNotMatch(page, /service[_-]?role/i);
});

test("curriculum reader starts from effective teacher allocations and stays read only", () => {
  const source = read("src/features/teaching/server/curriculum-access.ts");
  assert.match(source, /\.from\("teacher_allocations"\)/);
  assert.match(source, /\.eq\("school_id", input\.schoolId\)/);
  assert.match(source, /\.eq\("academic_year", input\.academicYear\)/);
  assert.match(source, /\.eq\("staff_member_id", input\.staffMemberId\)/);
  assert.match(source, /\.lte\("active_from", today\)/);
  assert.match(source, /active_to\.is\.null,active_to\.gte/);

  for (const table of [
    "curriculum_versions",
    "curriculum_units",
    "curriculum_objectives",
    "curriculum_competencies",
  ]) {
    assert.match(source, new RegExp(`\\.from\\("${table}"\\)`));
  }

  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(source, /curriculum_practicals/);
});

test("teacher curriculum UI distinguishes provenance and missing registry content", () => {
  const source = read("src/features/teaching/curriculum-access-workspace.tsx");
  assert.match(source, /Registry metadata/);
  assert.match(source, /Source provenance/);
  assert.match(source, /Curriculum not linked to this allocation/);
  assert.match(source, /Curriculum registry entry not available/);
  assert.match(source, /Structured curriculum content not yet loaded/);
  assert.match(source, /No curriculum matches this search/);
  assert.match(source, /Search topic, objective or competency/);
  assert.match(source, /Planning/);
  assert.match(source, /\/teaching\/preparation/);
  assert.match(source, /does not scrape, invent, upload or relabel NIED content/);
  assert.doesNotMatch(source, /<select/);
});

test("Wave 3 curriculum access does not edit shared teaching tabs or central navigation", () => {
  const route = read("src/app/teaching/curriculum/page.tsx");
  const workspace = read("src/features/teaching/curriculum-access-workspace.tsx");
  assert.ok(route.length > 0);
  assert.ok(workspace.length > 0);
  assert.ok(fs.existsSync(path.join(root, "src/features/teaching/teaching-workspace.tsx")));
  assert.ok(fs.existsSync(path.join(root, "src/components/shell/navigation.tsx")));
});


test("curriculum surface renders exactly one Teaching back link", () => {
  const page = read("src/app/teaching/curriculum/page.tsx");
  const workspace = read("src/features/teaching/curriculum-access-workspace.tsx");
  assert.doesNotMatch(page, /href="\/teaching"/);
  assert.equal((workspace.match(/href="\/teaching"/g) ?? []).length, 1);
});
