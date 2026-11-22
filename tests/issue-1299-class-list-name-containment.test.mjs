import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/features/documents/server/render-official-class-list-html.ts", import.meta.url), "utf8");

test("learner cell retains the full escaped name in document text and title", () => {
  assert.match(source, /const text = escapeOfficialDocumentHtml\(column\.value\(row, index\)\)/);
  assert.match(source, /column\.key === "learner" \? `<span class="learner-name" title="\$\{text\}">\$\{text\}<\/span>` : text/);
  assert.match(source, /<td class="\$\{column\.key === "number"/);
});

test("only learner cells override general nowrap with bounded safe wrapping", () => {
  assert.match(source, /\.class-list th, \.class-list td \{[^}]*white-space: nowrap/);
  assert.match(source, /\.class-list td\.column-learner \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/);
  const learnerRule = source.match(/\.class-list td\.column-learner \.learner-name \{([^}]+)\}/)?.[1];
  assert.ok(learnerRule, "learner span must have a scoped print-safe rule");
  assert.match(learnerRule, /display: -webkit-box;/);
  assert.match(learnerRule, /-webkit-line-clamp: 3;/);
  assert.match(learnerRule, /overflow: hidden;/);
  assert.match(learnerRule, /overflow-wrap: anywhere;/);
  assert.match(learnerRule, /word-break: break-word;/);
});

test("A4 and custom percentage column widths and repeated table header remain", () => {
  assert.match(source, /OFFICIAL_DOCUMENT_A4_PAGE_RULE/);
  assert.match(source, /classListColumnPercentages\(columns\)/);
  assert.match(source, /columnPercentages\[index\]\}%/);
  assert.match(source, /\.class-list thead \{ display: table-header-group; \}/);
  assert.match(source, /\.class-list tr \{ break-inside: avoid; page-break-inside: avoid; \}/);
});
