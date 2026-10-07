import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

const actions = read("src/components/documents/official-document-actions.tsx");
const admission = read("src/app/school/admissions/application-form/page.tsx");
const schedules = read("src/app/reports/academic-schedules/page.tsx");
const analysis = read("src/app/academics/analysis/page.tsx");
const roomInventory = read("src/features/room-inventory/room-inventory-workspace.tsx");
const classListActions = read("src/features/learners/class-list-document-actions.tsx");
const teachingFiles = read("src/features/teaching/components/teaching-files.tsx");
const lessonPreparation = read("src/features/academics/lesson-preparation-workspace.tsx");
const correspondence = read("src/features/correspondence/correspondence-editor.tsx");

test("shared governed preview actions never open a second dashboard tab", () => {
  assert.doesNotMatch(actions, /target="_blank"/);
  assert.doesNotMatch(actions, /window\.open/);
  assert.match(actions, /setPreviewOpen\(true\)/);
  assert.match(actions, /role="dialog"/);
  assert.match(actions, /Preview remains inside ScolaPro/);
  assert.match(actions, /<iframe/);
  assert.match(actions, /Close/);
});

test("admission keeps its existing embedded preview anchor", () => {
  assert.match(admission, /previewHref="#application-form-preview"/);
  assert.match(admission, /id="application-form-preview"/);
});

test("academic analysis and schedules use the shared popup instead of embedded PDF previews", () => {
  assert.match(analysis, /previewHref=\{\`\/academics\/analysis\/export\.pdf\?\$\{exportParams\.toString\(\)\}&preview=1\`\}/);
  assert.ok(schedules.includes('previewHref={"/reports/academic-schedules/export.pdf?"+query.toString()+"&preview=1"}'));
  assert.doesNotMatch(analysis, /OfficialDocumentPreview|#academic-analysis-preview|id="academic-analysis-preview"/);
  assert.doesNotMatch(schedules, /OfficialDocumentPreview|#academic-schedule-preview|id="academic-schedule-preview"/);
});

test("document surfaces without an inline preview use the shared in-app overlay contract", () => {
  assert.match(roomInventory, /OfficialDocumentActions/);
  assert.match(roomInventory, /format=pdf&preview=1/);
  assert.match(classListActions, /format=pdf&preview=1/);
  assert.match(teachingFiles, /OfficialDocumentActions/);
  assert.match(teachingFiles, /previewHref=\{document\.printHref\}/);
  assert.match(lessonPreparation, /OfficialDocumentActions compact previewHref=/);
});

test("correspondence saves before same-page preview and no longer uses window.open", () => {
  assert.match(correspondence, /const preparePreview = async/);
  assert.match(correspondence, /onPreview=\{preparePreview\}/);
  assert.match(correspondence, /previewHref=\{\`\/api\/official-documents\/correspondence\/\$\{document\.id\}\`\}/);
  assert.doesNotMatch(correspondence, /previewHref=.*format=pdf/);
  assert.doesNotMatch(correspondence, /window\.open/);
});
