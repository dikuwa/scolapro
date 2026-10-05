import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("shared document actions use the class-list action vocabulary", () => {
  const actions = read("src/components/documents/official-document-actions.tsx");
  const analysis = read("src/app/academics/analysis/page.tsx");
  const classList = read("src/features/learners/class-list-document-actions.tsx");
  const lessonPrep = read("src/features/academics/lesson-preparation-workspace.tsx");
  assert.match(actions, /previewLabel = "Preview \/ Print"/);
  assert.match(actions, /downloadLabel = "PDF"/);
  assert.match(actions, /spreadsheetLabel = "Excel"/);
  assert.match(analysis, /OfficialDocumentActions/);
  assert.doesNotMatch(analysis, />Print \/ PDF</);
  assert.doesNotMatch(analysis, />Export Excel</);
  assert.doesNotMatch(classList, /Print all/);
  assert.match(lessonPrep, /OfficialDocumentActions/);
  assert.doesNotMatch(lessonPrep, />Print view</);
  assert.doesNotMatch(lessonPrep, />Download PDF</);
});

test("document previews preserve governed A4 orientation", () => {
  const preview = read("src/components/documents/official-document-preview.tsx");
  const schedules = read("src/app/reports/academic-schedules/page.tsx");
  const admission = read("src/app/school/admissions/application-form/page.tsx");
  assert.match(preview, /h-\[210mm\] w-\[297mm\]/);
  assert.match(preview, /h-\[297mm\] w-\[210mm\]/);
  assert.match(schedules, /OfficialDocumentPreview/);
  assert.match(schedules, /orientation="landscape"/);
  const analysis = read("src/app/academics/analysis/page.tsx");
  assert.match(analysis, /Document preview/);
  assert.match(analysis, /orientation="landscape"/);
  assert.match(analysis, /embedded=1/);
  assert.match(admission, /OfficialDocumentPreview/);
  assert.match(admission, /orientation="portrait"/);
});

test("school identity remains left while contextual metadata is right", () => {
  const xlsx = read("src/features/documents/server/official-document-xlsx-chrome.ts");
  const sports = read("src/features/documents/server/sports-house-roster-document.ts");
  const roomPdf = read("src/features/room-inventory/server/render-verified-sheet-pdf.ts");
  const roomHtml = read("src/features/room-inventory/server/render-verified-sheet-html.ts");
  assert.match(xlsx, /rows\[5\]\[1\] = ""/);
  assert.match(xlsx, /rows\[3\]\[metaStartColumn\] = context\.secondaryContext/);
  assert.match(xlsx, /rows\[4\]\[metaStartColumn\] = input\.operationalLine/);
  assert.match(sports, /rows\[3\]\[metaStartColumn\] = `Leader:/);
  assert.match(sports, /secondaryContext:`House leader:/);
  assert.doesNotMatch(sports, /rows\[5\]\[1\] = `Leader:/);
  assert.match(roomPdf, /secondaryContext: `Responsible custodian:/);
  assert.match(roomHtml, /secondaryContext: `Responsible custodian:/);
  const htmlSummary = roomHtml.split('<section class="summary">')[1] ?? "";
  assert.doesNotMatch(htmlSummary, /<strong>Responsible custodian:/);
});
