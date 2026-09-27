import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const policy = readFileSync("src/features/conduct/policy-settings.tsx","utf8");
const route = readFileSync("src/app/conduct/policy/page.tsx","utf8");
const actions = readFileSync("src/features/conduct/server/actions.ts","utf8");
const conductPage = readFileSync("src/app/conduct/page.tsx","utf8");
const setupPage = readFileSync("src/app/school/setup/page.tsx","utf8");

test("conduct policy uses summary-first Recognition and Violations UI", () => {
  assert.match(policy,/Recognition groups/);
  assert.match(policy,/Violation groups/);
  assert.match(policy,/Groups are the scan layer/);
  assert.match(policy,/aria-expanded=\{open\}/);
  assert.match(policy,/Open one to see items or management actions/);
});

test("normal policy forms hide internal database fields", () => {
  assert.doesNotMatch(policy,/label="Domain"/);
  assert.doesNotMatch(policy,/label="Direction"/);
  assert.doesNotMatch(policy,/>Code</);
  assert.doesNotMatch(policy,/Display order/);
  assert.match(actions,/internalCode/);
});

test("policy supports search, archive restore delete and reorder on demand", () => {
  assert.match(policy,/Search groups or conduct items/);
  for (const token of ["Archive group","Restore group","Delete if unused","Move up","Move down","Archive","Restore"]) assert.match(policy,new RegExp(token));
  assert.match(actions,/reorder_conduct_policy_group/);
  assert.match(actions,/reorder_conduct_policy_category/);
});

test("policy route includes deputy principal in current-school management authority", () => {
  assert.match(route,/school_admin/);
  assert.match(route,/principal/);
  assert.match(route,/deputy_principal/);
  assert.match(route,/currentSchoolMembership/);
  assert.match(route,/membership\.schoolId === schoolId/);
});

test("Conduct links to dedicated policy route and Academic Setup no longer embeds duplicate policy editor", () => {
  assert.match(conductPage,/href="\/conduct\/policy"/);
  assert.doesNotMatch(setupPage,/ConductCategorySettings/);
});
