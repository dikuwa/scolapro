import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("src/features/documents/server/render-official-attendance-summary-html.ts", "utf8");
const pdf = readFileSync("src/features/documents/server/render-official-attendance-summary-pdf.ts", "utf8");
const route = readFileSync("src/app/api/official-documents/attendance-summary/route.ts", "utf8");
const model = readFileSync("src/features/attendance/server/official-summary.ts", "utf8");
const footer = readFileSync("src/features/documents/server/official-document-pdf-footer.ts", "utf8");
const component = readFileSync("src/features/attendance/official-summary.tsx", "utf8");

test("weekly official exports use full weekday labels and one compact sex-split cell", () => {
  for (const source of [html, pdf, route]) {
    assert.match(source, /weekday: "long"/);
    assert.match(source, /Total Absent/);
    assert.match(source, /POSSIBLE ATTENDANCES/);
    assert.match(source, /% ABSENCE/);
  }
  assert.match(pdf, /const detail = `\$\{split\.boys\}B \/ \$\{split\.girls\}G`/);
  assert.match(html, /<strong>\$\{split\.total\}<\/strong><small>\$\{split\.boys\}B \/ \$\{split\.girls\}G<\/small>/);
  assert.match(route, /compactSplit/);
  assert.doesNotMatch(html, /colspan="3"/);
});

test("term official exports use week columns, a term-total column and horizontal panels", () => {
  for (const source of [html, pdf]) {
    assert.match(source, /TERM_WEEKS_PER_PANEL = 8/);
    assert.match(source, /Term Absent/);
    assert.match(source, /Panel \$\{panelIndex \+ 1\}\/\$\{panels\.length\}|Panel \$\{panelIndex \+ 1\}\/\$\{columnPanels\.length\}/);
  }
  assert.match(route, /Term Absent/);
  assert.match(route, /summary\.schoolTotals\.weekly\.map/);
});

test("printable absentee summaries are A3 landscape and repeat full official chrome", () => {
  assert.match(html, /size:A3 landscape/);
  assert.match(html, /renderOfficialDocumentHtmlHeader/);
  assert.match(html, /panels\.flatMap/);
  assert.match(pdf, /const PAGE_WIDTH = 1190\.55/);
  assert.match(pdf, /const PAGE_HEIGHT = 841\.89/);
  assert.match(pdf, /drawOfficialDocumentPdfHeader/);
  assert.match(pdf, /for \(let panelIndex/);
  assert.match(pdf, /for \(let chunkIndex/);
  assert.match(pdf, /drawOfficialDocumentPdfFooter/);
});

test("classes are grouped dynamically by configured grade and retain official totals", () => {
  for (const source of [html, pdf, route]) {
    assert.match(source, /summary\.gradeRows\.map/);
    assert.match(source, /summary\.classRows\.filter/);
    assert.match(source, /replace\(\/\^grade\\s\+\/i, ""\)/);
    assert.match(source, /schoolSplit/);
  }
  assert.doesNotMatch(route, /Grade 8|Grade 9|Grade 10|Grade 11|Grade 12/);
});

test("daily possible attendance and absence percentages feed weekly exports", () => {
  assert.match(model, /daily: \{ date: string; possibleAttendances: number; absentLearnerDays: number; percentAbsence: number \| null \}\[\]/);
  assert.match(model, /const dailyTotals = dates\.map/);
  assert.match(model, /daily: dailyTotals/);
  for (const source of [html, pdf, route]) assert.match(source, /schoolTotals\.daily/);
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
