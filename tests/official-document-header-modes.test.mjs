import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const model = read("src/features/documents/server/official-document-header.ts");
const html = read("src/features/documents/server/official-document-html-header.ts");
const chrome = read("src/features/documents/server/official-document-chrome.ts");
const pdf = read("src/features/documents/server/official-document-pdf-header.ts");
const live = read("src/features/documents/server/live-school-document-profile.ts");
const profile = read("src/features/documents/server/school-document-profile.ts");
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


test("known Namib High branding is local, blackletter and resilient to stale remote URLs", () => {
  assert.match(profile, /bundledLogoUrl \|\| explicitLogoUrl/);
  assert.match(profile, /isNamibHigh/);
  assert.match(profile, /schoolNameFont: isNamibHigh/);
  assert.match(html, /localPublicAssetDataUrl/);
  assert.match(html, /readFileSync/);
});

test("shared official chrome uses the governed A4 backdrop and universal internal header", () => {
  assert.match(model, /InternalSchoolDocumentHeaderContext/);
  assert.match(model, /normalizeInternalSchoolDocumentHeaderContext/);
  assert.match(html, /internal-document-context/);
  assert.match(html, /school-contact/);
  assert.match(chrome, /OFFICIAL_DOCUMENT_BACKDROP_URL/);
  assert.match(chrome, /scolapro-document-backdrop\.png/);
  assert.match(chrome, /report::before/);
  assert.match(chrome, /background:url/);
  assert.match(chrome, /opacity:1/);
  assert.doesNotMatch(chrome, /content: "ScolaPro"/);
  assert.match(pdf, /drawInternalHeader/);
  assert.match(pdf, /INTERNAL_SCHOOL_DOCUMENT_PDF_HEADER_HEIGHT = 72/);
  assert.match(pdf, /resources\.backdrop/);
  assert.match(pdf, /opacity: 1/);
  assert.doesNotMatch(pdf, /const backdrop = "ScolaPro"/);
  assert.match(pdf, /loadPublicBrandBytes/);
});


test("internal header restores the full frame and top-aligns crest with school identity", () => {
  assert.match(chrome, /school-header\.internal-school \{ align-items:start; border-top:1px solid var\(--line\);/);
  assert.match(chrome, /internal-school > \.logo-wrap \{ align-self:start; padding-top:1px;/);
  assert.match(chrome, /internal-school > \.school-identity \{ align-self:start; padding-top:1px;/);
  assert.match(chrome, /max-width:62px; max-height:64px/);
  assert.match(chrome, /internal-document-context \{[^}]*line-height:1\.05/);
  assert.match(chrome, /document-context-title \{ margin-bottom:1px/);
  assert.match(chrome, /document-context-summary \{ margin-top:0/);
  assert.match(pdf, /page\.drawRectangle\(\{[\s\S]*borderWidth: 0\.75/);
  assert.doesNotMatch(pdf, /top rule begins only where school identity starts/);
  assert.match(pdf, /y: topY - 4 - imageHeight/);
  assert.match(pdf, /y: topY - 16/);
  assert.match(pdf, /let lineY = topY - 27/);
  assert.match(pdf, /let contextY = topY - 29/);
});


test("governed document art is bundled and the Namib High crest matches the supplied replacement", () => {
  const crestPath = "public/brand/schools/namib-high/crest.png";
  const backdropPath = "public/brand/governed/scolapro-document-backdrop.png";
  assert.equal(existsSync(crestPath), true);
  assert.equal(existsSync(backdropPath), true);
  assert.equal(createHash("sha256").update(readFileSync(crestPath)).digest("hex"), "b5c608fb23f728546d70e4846c182e7fc1414e2b3e0b78b0c2c5d68cf434d7c8");
  assert.equal(createHash("sha256").update(readFileSync(backdropPath)).digest("hex"), "f3b18566997fdb00e4393cfad78e47cfcc9c1aa50b01a55c353fcd564ff557a6");
  assert.match(profile, /\/brand\/schools\/namib-high\/crest\.png/);
});


test("internal PDF header repaints the full top rule after the opaque crest", () => {
  assert.match(pdf, /repaint the top edge/);
  assert.match(pdf, /start: \{ x, y: topY \}/);
  assert.match(pdf, /end: \{ x: x \+ width, y: topY \}/);
  assert.match(pdf, /thickness: 0\.75/);
});
