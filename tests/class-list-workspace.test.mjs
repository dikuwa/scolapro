import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const resolver = source("src/features/learners/server/class-list-workspace.ts");
const route = source("src/app/api/official-documents/class-list/route.ts");
const html = source("src/features/documents/server/render-official-class-list-html.ts");
const pdf = source("src/features/documents/server/render-official-class-list-pdf.ts");
const workspace = source("src/features/learners/class-list-workspace.tsx");

test("class-list targets are validated inside effective actor scope", () => {
  assert.match(resolver, /staff_member_id === membership\.staffMemberId/);
  assert.match(resolver, /effectiveOn\(today, item\.active_from, item\.active_to\)/);
  assert.match(resolver, /requested roster is outside your active teaching scope/i);
  assert.match(resolver, /resolveTeachingGroups/);
  assert.match(resolver, /resolveTeachingGroupMembers/);
  assert.doesNotMatch(resolver, /class_list_v2|teaching_group_v2/i);
});

test("cross-school and arbitrary legacy class exports cannot widen scope", () => {
  assert.match(resolver, /\.eq\("school_id", input\.membership\.schoolId\)/);
  assert.match(route, /currentSchoolMembership/);
  assert.match(route, /workspace\.options\.register_class\.find/);
  assert.match(route, /outside your active teaching scope/);
  assert.doesNotMatch(route, /searchParams\.get\("schoolId"\)/);
});

test("guardian columns are stripped and hydration is permission controlled", () => {
  assert.match(resolver, /guardianRoles/);
  assert.match(resolver, /canViewGuardianFields \|\| !guardianColumns\.has/);
  assert.match(resolver, /hydrateGuardianColumns\(learners, canViewGuardianFields/);
  assert.match(workspace, /Guardian and contact columns are hidden/);
});

test("preview, print, PDF and real XLSX share one normalized configuration", () => {
  assert.match(route, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(route, /XLSX\.write\(workbook, \{ type: "array", bookType: "xlsx"/);
  assert.match(route, /documentInput/);
  assert.match(route, /columns: workspace\.configuration\.columns/);
  assert.match(route, /blankColumns: workspace\.configuration\.blankColumns/);
  assert.match(workspace, /format=xlsx/);
  assert.doesNotMatch(route, /text\/csv|\.csv/);
});

test("official documents use content-aware columns and safe multi-page rows", () => {
  assert.match(html, /classListColumnPercentages/);
  assert.match(html, /table-header-group/);
  assert.match(html, /page-break-inside: avoid/);
  assert.match(pdf, /totalWeight/);
  assert.match(pdf, /rowsPerPage/);
  assert.match(pdf, /drawTableHeader/);
});

test("presets and recents store configuration only", () => {
  assert.match(workspace, /type StoredConfiguration = \{ id: string; name: string; configuration: ClassListConfiguration \}/);
  assert.match(workspace, /localStorage\.setItem\(PRESETS_KEY/);
  assert.match(workspace, /localStorage\.setItem\(RECENTS_KEY/);
  assert.doesNotMatch(workspace, /localStorage\.setItem\([^\n]*learners/);
});

test("workspace exposes all required roster types, fixed columns and 0-6 blanks", () => {
  for (const type of ["register_class", "grade", "subject", "teacher_subject", "teaching_group", "field_group"]) assert.match(workspace, new RegExp(`value: "${type}"`));
  assert.match(workspace, /No\. \(fixed\)/);
  assert.match(workspace, /Learner \(fixed\)/);
  assert.match(workspace, /Array\.from\(\{ length: 7 \}/);
});
