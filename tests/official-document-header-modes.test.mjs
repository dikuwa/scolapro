import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const model = read("src/features/documents/server/official-document-header.ts");
const html = read("src/features/documents/server/official-document-html-header.ts");
const chrome = read("src/features/documents/server/official-document-chrome.ts");
const pdf = read("src/features/documents/server/official-document-pdf-header.ts");
const live = read("src/features/documents/server/live-school-document-profile.ts");
const classRoute = read("src/app/api/official-documents/class-list/route.ts");
const teachingRoute = read("src/app/api/official-documents/teaching-pack/route.ts");
const reportHtml = read("src/features/reporting/server/render-report-card-html-with-school-font.ts");
const reportPdf = read("src/features/reporting/server/render-report-card-pdf-with-school-font.ts");

test("header modes are governed and document-type selected", () => {
  assert.match(model, /OfficialDocumentHeaderMode = "internal_school" \| "external_correspondence"/);
  assert.match(model, /officialDocumentHeaderModeForType/);
  assert.match(model, /external_correspondence/);
  assert.match(model, /governedAssetVersion/);
  assert.match(model, /Schools cannot replace this asset|PLATFORM_GOVERNED_NAMIBIA_COAT_OF_ARMS/);
  assert.match(live, /getLiveSchoolDocumentHeader/);
});

test("external HTML header is Coat of Arms / identity / school logo", () => {
  assert.match(html, /header\.mode === "external_correspondence"/);
  assert.match(html, /governed-coat-of-arms/);
  assert.match(html, /school-logo-right/);
  assert.match(chrome, /external-correspondence/);
  assert.match(chrome, /@media \(max-width: 640px\)/);
});

test("PDF header keeps parity and uses the governed PDF asset", () => {
  assert.match(pdf, /header\.mode === "external_correspondence"/);
  assert.match(pdf, /coatOfArms/);
  assert.match(pdf, /namibia-coat-of-arms\.png/);
  assert.match(pdf, /schoolNameFont/);
});

test("internal operational document families remain explicitly internal", () => {
  assert.match(classRoute, /officialDocumentHeaderModeForType\("class_list"\)/);
  assert.match(teachingRoute, /officialDocumentHeaderModeForType\("teaching_print_pack"\)/);
  assert.match(reportHtml, /officialDocumentHeaderModeForType\("report_card"\)/);
  assert.match(reportPdf, /officialDocumentHeaderModeForType\("report_card"\)/);
});

test("governed asset is bundled and not school-configurable", () => {
  assert.equal(existsSync("public/brand/governed/namibia-coat-of-arms.svg"), true);
  assert.equal(existsSync("public/brand/governed/namibia-coat-of-arms.png"), true);
  assert.match(read("public/brand/governed/namibia-coat-of-arms.svg"), /Platform-governed asset/);
  assert.doesNotMatch(model, /profile\.coatOfArms|profile\.coat_of_arms/);
});
