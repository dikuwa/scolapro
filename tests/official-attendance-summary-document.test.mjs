import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("src/features/documents/server/render-official-attendance-summary-html.ts", "utf8");
const pdf = readFileSync("src/features/documents/server/render-official-attendance-summary-pdf.ts", "utf8");
const route = readFileSync("src/app/api/official-documents/attendance-summary/route.ts", "utf8");
const footer = readFileSync("src/features/documents/server/official-document-pdf-footer.ts", "utf8");
const component = readFileSync("src/features/attendance/official-summary.tsx", "utf8");

test("official absentee document follows the physical register hierarchy", () => {
  for (const source of [html, pdf, route]) {
    assert.match(source, /SUMMARY OF ABSENTEES/);
    assert.match(source, /DATE OF WEEK ENDING/);
    assert.match(source, /GRADE \/ CLASS/);
    assert.match(source, /POSSIBLE ATTENDANCES/);
    assert.match(source, /% ABSENCE/);
  }
  assert.match(html, /<th class="num narrow">B<\/th>/);
  assert.match(html, /<th class="num narrow">G<\/th>/);
  assert.match(html, /TOTAL<\/th>/);
});

test("printable absentee summary is landscape and preserves shared document chrome", () => {
  assert.match(html, /size:A4 landscape/);
  assert.match(html, /OFFICIAL_DOCUMENT_HTML_HEADER_RULE/);
  assert.match(html, /OFFICIAL_DOCUMENT_LANDSCAPE_SCREEN_RULE/);
  assert.match(pdf, /const PAGE_WIDTH = OFFICIAL_DOCUMENT_PDF_GEOMETRY\.pageHeight/);
  assert.match(pdf, /const PAGE_HEIGHT = OFFICIAL_DOCUMENT_PDF_GEOMETRY\.pageWidth/);
  assert.match(pdf, /drawOfficialDocumentPdfHeader/);
  assert.match(pdf, /drawOfficialDocumentPdfFooter/);
});

test("current-week and term-to-date exports use the same week B-G-total schema", () => {
  assert.match(pdf, /const weeks = summary\.schoolTotals\.weekly/);
  assert.match(pdf, /const subWidth = weekWidth \/ 3/);
  assert.match(route, /weeks\.flatMap\(\(\) => \["B", "G", "TOTAL"\]\)/);
  assert.match(route, /weeks\.flatMap\(\(week\) => \[week\.weekLabel/);
});

test("classes are grouped dynamically by configured grade and concise labels remove Grade duplication", () => {
  for (const source of [html, pdf, route]) {
    assert.match(source, /summary\.gradeRows\.map/);
    assert.match(source, /summary\.classRows\.filter/);
    assert.match(source, /replace\(\/\^grade\\s\+\/i, ""\)/);
  }
  assert.match(component, /conciseClassLabel\(row\.className\)/);
  assert.doesNotMatch(route, /Grade 8|Grade 9|Grade 10|Grade 11|Grade 12/);
});

test("school totals retain boys, girls, total and weekly absence percentage", () => {
  assert.match(html, /schoolSplit/);
  assert.match(pdf, /schoolSplit/);
  assert.match(route, /schoolSplit/);
  assert.match(html, /week\.percentAbsence/);
  assert.match(pdf, /week\.percentAbsence/);
  assert.match(route, /week\.percentAbsence/);
});

test("shared PDF footer aligns to actual page width for landscape documents", () => {
  assert.match(footer, /input\.page\.getWidth\(\)/);
});

test("unfinalized attendance summaries expose a live draft preview without verification identity", () => {
  assert.match(component, /draftPreviewHref/);
  assert.match(component, /preview=1&draft=1/);
  assert.match(component, /Preview \/ Print/);
  assert.match(pdf, /DRAFT - NOT FINALIZED/);
  assert.match(pdf, /isDraft/);
  assert.match(pdf, /Preview only/);
  assert.match(route, /summary: liveSummary/);
  assert.match(route, /X-ScolaPro-Document-State/);
});

test("weekly and term absentee summaries expose specific preview and export names", () => {
  const actions = readFileSync("src/components/documents/official-document-actions.tsx", "utf8");
  assert.match(actions, /previewTitle = "Document preview"/);
  assert.match(component, /Weekly Summary of Absentees/);
  assert.match(component, /Term Summary of Absentees/);
  assert.match(component, /previewTitle=\{documentTitle\}/);
  assert.match(route, /weekly-summary-of-absentees/);
  assert.match(route, /term-summary-of-absentees/);
});
