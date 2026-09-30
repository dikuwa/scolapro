import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const renderer = readFileSync("src/features/reporting/server/render-report-card-html.ts", "utf8");
const wrapper = readFileSync("src/features/reporting/server/render-report-card-html-with-school-font.ts", "utf8");

test("report-card HTML renderer consumes the shared school-header chrome contract", () => {
  assert.match(renderer, /OFFICIAL_DOCUMENT_HEADER_RULE/);
  assert.match(renderer, /\$\{OFFICIAL_DOCUMENT_HEADER_RULE\}/);
  assert.doesNotMatch(renderer, /grid-template-columns: 88px minmax\(0,1fr\) 128px/);
  assert.match(wrapper, /applyOfficialDocumentHtmlChrome\(renderReportCardHtml\(input\)\)/);
});
