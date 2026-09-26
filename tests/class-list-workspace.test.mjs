import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const resolver = source("src/features/learners/server/class-list-workspace.ts");
const route = source("src/app/api/official-documents/class-list/route.ts");
const html = source("src/features/documents/server/render-official-class-list-html.ts");
const pdf = source("src/features/documents/server/render-official-class-list-pdf.ts");
const workspace = source("src/features/learners/class-list-workspace.tsx");
const documentActions = source("src/features/learners/class-list-document-actions.tsx");
const learnerDirectory = source("src/features/learners/learner-directory.tsx");
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
  assert.match(documentActions, /format=xlsx/);
  assert.doesNotMatch(route, /text\/csv|\.csv/);
});

test("official documents use content-fit portrait columns and safe multi-page rows", () => {
  assert.match(html, /width: auto; max-width: 100%; border-collapse: collapse; table-layout: auto/);
  assert.match(html, /data-column="admissionNumber"/);
  assert.match(html, /table-header-group/);
  assert.match(html, /page-break-inside: avoid/);
  assert.match(pdf, /preferredColumnWidth/);
  assert.match(pdf, /fitColumnWidths/);
  assert.match(pdf, /tableWidth/);
  assert.match(pdf, /layout: "compact_left"/);
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


test("class-list grade ordering only uses canonical grade columns", () => {
  assert.doesNotMatch(resolver, /\.order\("sort_order"\)/);
  assert.match(resolver, /from\("grades"\)[\s\S]*\.order\("display_name"\)\.order\("id"\)/);
});


test("class-list preview uses compact spreadsheet layout and clearable recents", () => {
  assert.match(workspace, /w-max min-w-0 table-auto border-collapse/);
  assert.match(workspace, /border border-border-subtle px-2\.5 py-2/);
  assert.match(workspace, /function clearRecents\(\)/);
  assert.match(workspace, /localStorage\.removeItem\(RECENTS_KEY\)/);
  assert.match(workspace, />Clear<\/button>/);
});

test("official class-list columns place admission before learner and abbreviate sex", () => {
  const document = source("src/features/documents/server/class-list-document.ts");
  assert.match(document, /hasAdmissionNumber/);
  assert.match(document, /optionalColumn\("admissionNumber"\)/);
  assert.match(document, /key: "learner"/);
  assert.ok(document.indexOf('optionalColumn("admissionNumber")') < document.indexOf('key: "learner"'));
  assert.match(document, /normalized === "male" \|\| normalized === "m"\) return "M"/);
  assert.match(document, /normalized === "female" \|\| normalized === "f"\) return "F"/);
});


test("class-list exports carry bundled PDF branding and compact Excel document structure", () => {
  const routeSource = source("src/app/api/official-documents/class-list/route.ts");
  const profileSource = source("src/features/documents/server/school-document-profile.ts");
  const pdfHeader = source("src/features/documents/server/official-document-pdf-header.ts");
  assert.match(profileSource, /\/brand\/schools\/namib-high\/crest\.png/);
  assert.match(routeSource, /loadClassListLogoBytes/);
  assert.match(routeSource, /readFile\(join\(process\.cwd\(\), "public"/);
  assert.match(routeSource, /xlsxBytes\(workspace, header\)/);
  assert.match(routeSource, /header\.schoolName/);
  assert.match(routeSource, /header\.postalLines\.join/);
  assert.match(routeSource, /font: \{ bold: true, sz: 10 \}/);
  assert.match(routeSource, /orientation: "portrait"/);
  assert.match(routeSource, /fitToWidth: 1/);
  assert.match(pdfHeader, /compact_left/);
  assert.match(pdfHeader, /const logoWidth = compactLeft \? 66 : LOGO_WIDTH/);
});


test("all Class List document access points use the shared preview/print/PDF/Excel actions", () => {
  assert.match(workspace, /ClassListDocumentActions baseHref=\{exportBase\}/);
  assert.match(learnerDirectory, /ClassListDocumentActions baseHref=\{classListHref\} compact/);
  assert.match(documentActions, /Preview \/ Print/);
  assert.match(documentActions, />PDF</);
  assert.match(documentActions, />Excel</);
  assert.match(documentActions, /format=pdf/);
  assert.match(documentActions, /format=xlsx/);
  assert.doesNotMatch(workspace, /<Printer|<Download|<FileSpreadsheet/);
  assert.doesNotMatch(learnerDirectory, /Print class list|Download PDF/);
});
