import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync(
  "src/features/reporting/server/process-report-card-render-queue.ts",
  "utf8",
);

test("Digital report-card artifacts use a Storage-supported HTML media type", () => {
  assert.match(worker, /bytes = new TextEncoder\(\)\.encode\(await renderReportCardHtmlWithSchoolFont\(renderInput\)\)/);
  assert.match(worker, /contentType = "text\/html";/);
  assert.doesNotMatch(worker, /contentType = "text\/html; charset=utf-8";/);
});

test("PDF artifact upload media type remains unchanged", () => {
  assert.match(worker, /contentType = "application\/pdf";/);
});
