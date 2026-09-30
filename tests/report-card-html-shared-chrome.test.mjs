import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const renderer = readFileSync("src/features/reporting/server/render-report-card-html.ts", "utf8");
const sharedChrome = readFileSync("src/features/documents/server/official-document-chrome.ts", "utf8");

test("report-card HTML base renderer consumes the shared official-document header rule", () => {
  assert.match(
    renderer,
    /import \{ OFFICIAL_DOCUMENT_HEADER_RULE \} from "@\/features\/documents\/server\/official-document-chrome";/,
  );
  assert.match(renderer, /\$\{OFFICIAL_DOCUMENT_HEADER_RULE\}/);
  assert.doesNotMatch(
    renderer,
    /grid-template-columns: 88px minmax\(0,1fr\) 128px; gap: 10px/,
  );
  assert.match(
    sharedChrome,
    /grid-template-columns: 68px minmax\(0,1fr\) minmax\(150px,36%\)/,
  );
});

test("report-card HTML still exposes the structural blocks replaced by shared chrome", () => {
  assert.match(renderer, /<header class="school-header">/);
  assert.match(renderer, /<section class="report-title">/);
  assert.match(renderer, /<footer class="document-meta">/);
});
