import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const resolver = source("src/features/learners/server/class-list-workspace.ts");
const route = source("src/app/api/official-documents/class-list/route.ts");
const html = source("src/features/documents/server/render-official-class-list-html.ts");
const pdf = source("src/features/documents/server/render-official-class-list-pdf.ts");
const xlsx = source("src/features/documents/server/render-official-class-list-xlsx.ts");
const workspace = source("src/features/learners/class-list-workspace.tsx");
const documentActions = source("src/features/learners/class-list-document-actions.tsx");
const learnerDirectory = source("src/features/learners/learner-directory.tsx");
const page = source("src/app/class-lists/page.tsx");
const navigation = source("src/components/shell/navigation.tsx");
const documentModel = source("src/features/documents/server/class-list-document.ts");

test("class-list targets remain school bounded while current staff can use school-wide scope", () => {
  assert.match(resolver, /rosterRoles = new Set/);
  for (const role of ["school_admin","principal","deputy_principal","hod","teacher","class_teacher","counsellor","learner_support","social_worker","librarian","ltsm","exam_officer","emis_officer"]) {
    assert.match(resolver, new RegExp(`"${role}"`));
  }
  assert.match(resolver, /schoolWide = canAccessClassLists\(membership\) && scope === "all"/);
  assert.match(resolver, /if \(schoolWide\) for \(const item of rows\.classes\)/);
  assert.match(resolver, /requested roster is outside your active school class-list scope/i);
  assert.match(page, /const scope = single\(params\.scope\) === "my" \? "my" : "all"/);
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
  assert.match(route, /renderClassListXlsx\(batch\.lists\[0\], header, logoBytes\)/);
  assert.match(route, /documentInput/);
  assert.match(route, /columns: workspace\.configuration\.columns/);
  assert.match(route, /blankColumns: workspace\.configuration\.blankColumns/);
  assert.match(documentActions, /format=xlsx/);
  assert.match(xlsx, /buildOfficialClassListColumns\(input\.configuration\.columns, input\.configuration\.blankColumns\)/);
  assert.doesNotMatch(route, /text\/csv|\.csv/);
});

test("official documents use compact content-fit portrait columns and safe multi-page rows", () => {
  assert.match(html, /class-document/);
  assert.match(html, /class-list-header/);
  assert.match(html, /table-header-group/);
  assert.match(pdf, /preferredColumnWidth/);
  assert.match(pdf, /fitColumnWidths/);
  assert.match(pdf, /CLASS_LIST_HEADER_HEIGHT = 58/);
  assert.match(pdf, /ROW_HEIGHT = 13/);
  assert.match(pdf, /drawClassListHeader/);
  assert.match(pdf, /rowsPerPage/);
});

test("column presets remain local recipes and do not replace the active batch", () => {
  assert.match(workspace, /type StoredConfiguration = \{ id: string; name: string; configuration: ClassListConfiguration \}/);
  assert.match(workspace, /localStorage\.setItem\(PRESETS_KEY/);
  assert.match(workspace, /columns: allowedColumns/);
  assert.match(workspace, /blankColumns: item\.configuration\.blankColumns/);
  assert.doesNotMatch(workspace, /setTargets\([^\n]*item\.configuration/);
  assert.doesNotMatch(workspace, /localStorage\.setItem\([^\n]*learners/);
});

test("workspace exposes all required roster types, multi-select semantics, fixed columns and 0-6 blanks", () => {
  for (const type of ["register_class", "grade", "subject", "teacher_subject", "teaching_group", "field_group"]) assert.match(workspace, new RegExp(`value: "${type}"`));
  assert.match(workspace, /aria-multiselectable="true"/);
  assert.match(workspace, /Remove \$\{targetLabel\(data, target\)\}/);
  assert.match(workspace, /Clear all/);
  assert.match(workspace, /No\. 🔒/);
  assert.match(workspace, /Learner 🔒/);
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


test("class-list batch preview fills the available document area and keeps roster boundaries", () => {
  assert.match(workspace, /w-full min-w-\[48rem\] table-auto border-collapse/);
  assert.match(workspace, /max-h-\[52vh\] w-full overflow-auto/);
  assert.match(workspace, /batch\.lists\.map/);
  assert.match(workspace, /list\.configuration\.rosterType/);
  assert.match(workspace, /list\.configuration\.rosterId/);
  assert.match(workspace, /list\.learners\.map/);
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


test("class-list exports use a school-only compact header across print, PDF and Excel", () => {
  assert.match(route, /loadClassListLogoBytes/);
  assert.match(route, /renderClassListXlsx\(batch\.lists\[0\], header, logoBytes\)/);

  assert.match(html, /class-list-header/);
  assert.match(html, /school-name/);
  assert.match(html, /class-context/);
  assert.doesNotMatch(html, /header\.contactLines|header\.postalLines/);

  assert.match(pdf, /drawClassListHeader/);
  assert.match(pdf, /input\.header\.schoolName/);
  assert.match(pdf, /Register teacher:/);
  assert.doesNotMatch(pdf, /contactLines|postalLines/);

  assert.match(xlsx, /embedLogoAndStyles/);
  assert.match(xlsx, /class-list-logo/);
  assert.match(xlsx, /School crest/);
  assert.match(xlsx, /readImageDimensions/);
  assert.match(xlsx, /xdr:oneCellAnchor/);
  assert.doesNotMatch(xlsx, /xdr:twoCellAnchor/);
  assert.match(xlsx, /rows\[0\]\[1\] = header\.schoolName/);
  assert.match(xlsx, /rows\[1\]\[1\] = "Grade: "/);
  assert.match(xlsx, /rows\[2\]\[1\] = "Block\/Class: "/);
  assert.match(xlsx, /rows\[3\]\[1\] = input\.registerTeacherName/);
  assert.match(xlsx, /"Male: " \+ maleCount \+ "   Female: " \+ femaleCount/);
  assert.match(xlsx, /"Total learners: " \+ input\.learners\.length/);
  assert.match(xlsx, /orientation: "portrait"/);
  assert.match(xlsx, /fitToWidth: 1/);
  assert.doesNotMatch(xlsx, /!autofilter|postalLines|contactLines/);
});


test("all Class List document access points use the shared preview/print/PDF/Excel actions", () => {
  assert.match(workspace, /ClassListDocumentActions baseHref=\{exportBase\}/);
  assert.match(learnerDirectory, /ClassListDocumentActions baseHref=\{classListHref\} compact/);
  assert.match(documentActions, /Preview \/ Print/);
  assert.match(documentActions, /format=pdf&preview=1/);
  assert.match(route, /previewPdf = url\.searchParams\.get\("preview"\) === "1"/);
  assert.match(route, /previewPdf \? "inline" : "attachment"/);
  assert.match(documentActions, /\bPDF\b/);
  assert.match(documentActions, /\bExcel\b/);
  assert.match(documentActions, /format=pdf/);
  assert.match(documentActions, /format=xlsx/);
  assert.doesNotMatch(workspace, /<Printer|<Download|<FileSpreadsheet/);
  assert.doesNotMatch(learnerDirectory, /Print class list|Download PDF/);
});


test("Class List document naming is dynamic and consistent across all Class List outputs", () => {
  assert.match(documentModel, /function classListDocumentName/);
  assert.match(documentModel, /replace\(\/\^Grade\\s\+\/i, ""\)/);
  assert.match(documentModel, /Classlist/);
  assert.match(pdf, /classListDocumentName\(input\.registerClass, input\.rosterTitle\)/);
  assert.match(html, /classListDocumentName\(input\.registerClass, input\.rosterTitle\)/);
  assert.match(xlsx, /classListDocumentName\(input\.className, input\.title\)/);
  assert.match(route, /classListDocumentName\(batch\.lists\[0\]\.className, batch\.lists\[0\]\.title\)/);
  assert.match(workspace, /classListDocumentName\(list\.className, list\.title\)/);
});


test("batch targets remain typed, bounded, server-authorized and independently resolved", () => {
  assert.match(resolver, /getClassListBatchWorkspace/);
  assert.match(resolver, /target\.rosterType/);
  assert.match(resolver, /target\.rosterId/);
  assert.match(resolver, /\.slice\(0, 20\)/);
  assert.match(resolver, /Promise\.all\(uniqueTargets\.map/);
  assert.match(resolver, /getClassListWorkspace/);
  assert.match(route, /parseTargets/);
  assert.match(route, /getClassListBatchWorkspace/);
  assert.match(route, /No valid class-list targets were supplied/);
});

test("parent grade and child register-class selections cannot coexist in the active batch", () => {
  assert.match(workspace, /target\.rosterType === "grade"/);
  assert.match(workspace, /item\.rosterType !== "register_class"/);
  assert.match(workspace, /target\.rosterType === "register_class"/);
  assert.match(workspace, /item\.rosterType !== "grade"/);
});

test("batch exports stay single-request and preserve document boundaries", () => {
  assert.match(route, /renderOfficialClassListBatchPdf/);
  assert.match(route, /renderClassListBatchXlsx/);
  assert.match(xlsx, /renderClassListBatchXlsx/);
  assert.match(xlsx, /safeWorksheetName/);
  assert.match(xlsx, /index \+ 1/);
  assert.match(documentActions, /batch \? "Print all" : "Preview \/ Print"/);
});

test("guardian address is permission-gated and available as one compact optional field", () => {
  const types = source("src/features/learners/class-list-types.ts");
  assert.match(types, /"guardianAddress"/);
  assert.match(types, /guardianAddress: "Guardian address"/);
  assert.match(resolver, /guardianColumns = new Set<ClassListColumnId>\(\["guardianName", "guardianPhone", "guardianAddress", "emergencyContact"\]\)/);
  assert.match(resolver, /from\("guardian_addresses"\)/);
  assert.match(resolver, /guardianAddress: primary \? addressByGuardian/);
  assert.match(workspace, /guardianAddress/);
});

test("compact PDF class-list content is horizontally centered on A4", () => {
  assert.match(pdf, /const documentX = Math\.max\(MARGIN, \(PAGE_WIDTH - tableWidth\) \/ 2\)/);
  assert.match(pdf, /drawClassListHeader\(page, input, resources, tableWidth, documentX\)/);
  assert.match(pdf, /drawTableHeader\([^\n]*documentX\)/);
  assert.match(pdf, /drawRow\([^\n]*documentX, rowHeight\)/);
});
