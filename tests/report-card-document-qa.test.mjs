import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const htmlBase = await read("src/features/reporting/server/render-report-card-html.ts");
const htmlShared = await read("src/features/reporting/server/render-report-card-html-with-school-font.ts");
const pdfBase = await read("src/features/reporting/server/render-report-card-pdf.ts");
const pdfShared = await read("src/features/reporting/server/render-report-card-pdf-with-school-font.ts");
const worker = await read("src/features/reporting/server/process-report-card-render-queue.ts");
const route = await read("src/app/api/report-card-documents/[documentId]/route.ts");
const chrome = await read("src/features/documents/server/official-document-chrome.ts");
const classListHtml = await read("src/features/documents/server/render-official-class-list-html.ts");
const classListPdf = await read("src/features/documents/server/render-official-class-list-pdf.ts");
const classListRoute = await read("src/app/api/official-documents/class-list/route.ts");
const version = await read("src/features/reporting/server/report-card-renderer-version.ts");

test("report-card HTML uses shared browser-print pagination and repeated result headers", () => {
  assert.match(htmlShared, /applyOfficialDocumentHtmlChrome/);
  assert.match(chrome, /thead \{ display: table-header-group; \}/);
  assert.match(chrome, /\.report \{ break-inside: auto; \}/);
  assert.match(htmlBase, /<table class="results-table">/);
  assert.match(htmlBase, /<thead>/);
  assert.match(htmlBase, /html, body \{ margin: 0; padding: 0; background: #fff; color: var\(--ink\); \}/);
});

test("report-card PDF reserves footer space and shared wrapper provides page numbering", () => {
  assert.match(pdfBase, /reservedBottom = 18 \+ 48 \+ 70 \+ 68 \+ 35/);
  assert.match(pdfShared, /drawOfficialDocumentPdfFooter/);
  assert.match(pdfShared, /pageNumber: index \+ 1/);
  assert.match(pdfShared, /pageCount: pages\.length/);
  assert.match(pdfShared, /clearArea: true/);
  assert.match(pdfShared, /drawOfficialDocumentPdfHeader/);
});

test("report-card generated timestamp comes from the frozen snapshot record", () => {
  assert.match(worker, /data_snapshot,generated_at,certified_at/);
  assert.match(worker, /generatedAt: snapshot\.generated_at/);
  assert.match(htmlShared, /Generated \$\{model\.generatedAt\}/);
  assert.match(pdfShared, /Generated \$\{model\.generatedAt\}/);
  assert.match(version, /SCOLAPRO_TERM_REPORT_RENDERER_V10/);
});

test("report-card export remains authorization-bound and does not change publication/finality state", () => {
  assert.match(route, /createSupabaseServerClient/);
  assert.match(route, /\.from\("report_card_documents"\)/);
  assert.match(route, /\.eq\("status", "ready"\)/);
  assert.match(route, /REPORT_CARD_RENDERER_VERSION/);
  assert.doesNotMatch(route, /certify_report_card_snapshot|publish_report_card_snapshot|save_report_card_snapshot_remark/);
  assert.doesNotMatch(worker, /certify_report_card_snapshot|publish_report_card_snapshot|save_report_card_snapshot_remark/);
});

test("official class-list output keeps long-table continuation and provenance", () => {
  assert.match(classListHtml, /OFFICIAL_DOCUMENT_PRINT_RULE/);
  assert.match(classListHtml, /<thead>/);
  assert.match(classListPdf, /rowsPerPage/);
  assert.match(classListPdf, /drawTableHeader\(page, bold, y, columns\)/);
  assert.match(classListPdf, /drawOfficialDocumentPdfFooter/);
  assert.match(classListRoute, /generatedAt/);
  assert.match(classListRoute, /X-ScolaPro-Page-Count/);
});


test("report-card HTML shared chrome validation checks block presence before replacement", () => {
  assert.match(htmlShared, /schoolHeaderPattern = \/<header class="school-header">/);
  assert.match(htmlShared, /if \(!schoolHeaderPattern\.test\(html\)\)/);
  assert.match(htmlShared, /html = html\.replace\(schoolHeaderPattern, sharedHeader\)/);
  assert.match(htmlShared, /documentMetaPattern = \/<footer class="document-meta">/);
  assert.match(htmlShared, /if \(!documentMetaPattern\.test\(html\)\)/);
  assert.match(htmlShared, /return html\.replace\(documentMetaPattern, footer\)/);
  assert.doesNotMatch(htmlShared, /withSharedHeader === html/);
  assert.doesNotMatch(htmlShared, /withSharedFooter === html/);
});
