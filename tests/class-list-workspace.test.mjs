import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const resolver = source("src/features/learners/server/class-list-workspace.ts");
const route = source("src/app/api/official-documents/class-list/route.ts");
const html = source("src/features/documents/server/render-official-class-list-html.ts");
const pdf = source("src/features/documents/server/render-official-class-list-pdf.ts");
const workspace = source("src/features/learners/class-list-workspace.tsx");
const page = source("src/app/class-lists/page.tsx");
const navigation = source("src/components/shell/navigation.tsx");

test("class-list targets remain school bounded while current staff can use school-wide scope", () => {
  assert.match(resolver, /rosterRoles = new Set/);
  for (const role of ["school_admin","principal","deputy_principal","hod","teacher","class_teacher","counsellor","learner_support","social_worker","librarian","ltsm","exam_officer","emis_officer"]) {
    assert.match(resolver, new RegExp(`"${role}"`));
  }
  assert.match(resolver, /schoolWide = canAccessClassLists\(membership\) && scope === "all"/);
  assert.match(resolver, /if \(schoolWide\) for \(const item of rows\.classes\)/);
  assert.match(resolver, /requested roster is outside your active school class-list scope/i);
  assert.match(page, /scope: single\(params\.scope\) === "my" \? "my" : "all"/);
  assert.match(resolver, /resolveTeachingGroups/);
  assert.match(resolver, /resolveTeachingGroupMembers/);
  assert.doesNotMatch(resolver, /class_list_v2|teaching_group_v2/i);
});

test("cross-school and arbitrary legacy class exports cannot widen school scope", () => {
  assert.match(resolver, /\.eq\("school_id", input\.membership\.schoolId\)/);
  assert.match(route, /currentSchoolMembership/);
  assert.match(route, /scope: url\.searchParams\.get\("scope"\) === "my" \? "my" : "all"/);
  assert.match(route, /workspace\.options\.register_class\.find/);
  assert.match(route, /outside your active school class-list scope/);
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


test("optional Teaching Group resolution cannot crash register and grade class lists", () => {
  assert.match(resolver, /resolveTeachingGroups[\s\S]*\.catch\(\(error\) =>/);
  assert.match(resolver, /continuing with register\/grade\/subject rosters/);
  assert.match(resolver, /return \[\];/);
});

test("Class Lists are discoverable for school staff but not learner or parent roles", () => {
  assert.match(navigation, /key: "class_lists", label: "Class Lists", href: "\/class-lists"/);
  for (const role of ["school_admin","principal","deputy_principal","hod","teacher","class_teacher","counsellor","learner_support","social_worker","librarian","ltsm","exam_officer","emis_officer"]) {
    const line = navigation.split("\n").find((item) => item.trimStart().startsWith(`${role}:`));
    assert.ok(line?.includes('"class_lists"'), `${role} should expose Class Lists`);
  }
  for (const role of ["learner","parent","board_member","platform_admin","platform_support","circuit_officer","regional_officer"]) {
    const line = navigation.split("\n").find((item) => item.trimStart().startsWith(`${role}:`));
    assert.ok(line && !line.includes('"class_lists"'), `${role} must not receive staff Class Lists navigation`);
  }
});


test("restored school-scale Class Lists use URI-safe guardian batches and tolerate optional group allocation reads", () => {
  assert.match(resolver, /POSTGREST_IN_BATCH_SIZE = 40/);
  assert.match(resolver, /for \(const batch of chunkIds\(learnerIds\)\)/);
  assert.match(resolver, /for \(const batch of chunkIds\(guardianIds\)\)/);
  assert.match(resolver, /class-list teaching group allocations unavailable; continuing without allocation links/);
  assert.match(resolver, /groupAllocations\.error \? \[\] : \(groupAllocations\.data \?\? \[\]\)/);
});
