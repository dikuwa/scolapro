import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const route = await read("src/app/api/official-documents/teaching-pack/route.ts");
const model = await read("src/features/teaching/server/teaching-print-pack.ts");
const html = await read("src/features/teaching/server/render-teaching-print-pack-html.ts");
const pdf = await read("src/features/teaching/server/render-teaching-print-pack-pdf.ts");
const workspace = await read("src/features/academics/lesson-preparation-workspace.tsx");

test("teaching print pack derives from canonical teaching records without mutations", () => {
  for (const table of [
    "lesson_preparations",
    "teaching_schedule_items",
    "pacing_plan_items",
    "pacing_plans",
    "teacher_allocations",
    "teaching_actuals",
  ]) assert.match(model, new RegExp(`from\\("${table}"\\)`));

  assert.doesNotMatch(model, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("teaching exports reuse shared document chrome and PDF primitives", () => {
  assert.match(html, /OFFICIAL_DOCUMENT_A4_PAGE_RULE/);
  assert.match(html, /renderOfficialDocumentHtmlHeader/);
  assert.match(html, /renderOfficialDocumentHtmlFooter/);
  assert.match(pdf, /createOfficialDocumentPdfResources/);
  assert.match(pdf, /drawOfficialDocumentPdfHeader/);
  assert.match(pdf, /drawOfficialDocumentPdfFooter/);
});

test("export boundary denies platform roles and resolves only current school memberships", () => {
  assert.match(route, /context\.platformMemberships\.length/);
  assert.match(route, /context\.memberships\.filter/);
  assert.doesNotMatch(route, /allSchoolMemberships/);
  assert.match(route, /Teaching preparation not found in your governed scope/);
});

test("print output includes provenance and avoids official Ministry form claims", () => {
  assert.match(html, /Preparation ID/);
  assert.match(html, /Plan ID/);
  assert.match(html, /Generated/);
  assert.match(html, /not presented as an official NIED or Ministry form/);
  assert.match(pdf, /not presented as an official NIED or Ministry form/);
});

test("lesson preparation UI exposes print view and PDF only after a canonical preparation exists", () => {
  assert.match(workspace, /selected\.preparationId \?/);
  assert.match(workspace, /official-documents\/teaching-pack\?preparation=/);
  assert.match(workspace, /format=pdf/);
});


test("browser print keeps teaching headings and bounded provenance blocks with their content", () => {
  assert.match(html, /class="title document-title"/);
  assert.match(html, /section-title[^\n]*break-after:avoid;page-break-after:avoid/);
  assert.match(html, /class="coverage remarks"/);
  assert.match(html, /<section class="remarks"><h2 class="section-title">Review provenance/);
  assert.match(html, /thead/);
  assert.match(html, /OFFICIAL_DOCUMENT_PRINT_RULE/);
});

test("PDF pagination rechecks the shared footer reserve for every wrapped line", () => {
  assert.match(pdf, /ensure\(writer, 22 \+ LINE_HEIGHT \+ 4\)/);
  assert.match(pdf, /lines\.forEach\(\(line\) => \{[\s\S]*ensure\(writer, LINE_HEIGHT \+ 2\)/);
  assert.doesNotMatch(pdf, /ensure\(writer, lines\.length \* LINE_HEIGHT \+ 4\)/);
  assert.match(pdf, /drawOfficialDocumentPdfFooter/);
});
