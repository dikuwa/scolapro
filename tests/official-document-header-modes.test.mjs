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
  assert.match(model, /url: "\/brand\/governed\/namibia-coat-of-arms\.png"/);
  assert.match(model, /version: "2026-10-05"/);
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
  const governedCoatPng = readFileSync("public/brand/governed/namibia-coat-of-arms.png");
  assert.equal(governedCoatPng[24], 8, "governed Coat of Arms raster must remain 8-bit for pdf-lib colour fidelity");
  assert.equal(createHash("sha256").update(governedCoatPng).digest("hex"), "2d4921dd52fed0a8564a4a145e3f0e1e8d5894a6a6ddaace97666d9065c73958");
  assert.doesNotMatch(model, /profile\.coatOfArms|profile\.coat_of_arms/);
});


test("known Namib High branding is local and honors its configured document font", () => {
  assert.match(profile, /bundledLogoUrl \|\| explicitLogoUrl/);
  assert.match(profile, /schoolNameFont: text\(profile\.school_name_font\)\.toLowerCase\(\) === "old_english"/);
  assert.match(html, /localPublicAssetDataUrl/);
  assert.match(html, /readFileSync/);
});

test("configured Old English remains school-profile driven for every school", () => {
  assert.doesNotMatch(profile, /schoolNameFont:\s*isNamibHigh/);
  assert.match(profile, /schoolNameFont: text\(profile\.school_name_font\)\.toLowerCase\(\) === "old_english"/);
});

test("class-list renderers default to three blank columns without overriding explicit zero", () => {
  const classHtml = read("src/features/documents/server/render-official-class-list-html.ts");
  const classPdf = read("src/features/documents/server/render-official-class-list-pdf.ts");
  assert.match(classHtml, /input\.blankColumns \?\? 3/);
  assert.match(classPdf, /input\.blankColumns \?\? 3/);
  assert.doesNotMatch(classHtml, /input\.blankColumns \|\| 3/);
  assert.doesNotMatch(classPdf, /input\.blankColumns \|\| 3/);
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
  assert.match(chrome, /OFFICIAL_DOCUMENT_BACKDROP_OPACITY = 0\.68/);
  assert.match(chrome, /opacity:\$\{OFFICIAL_DOCUMENT_BACKDROP_OPACITY\}/);
  assert.doesNotMatch(chrome, /content: "ScolaPro"/);
  assert.match(pdf, /drawInternalHeader/);
  assert.match(pdf, /INTERNAL_SCHOOL_DOCUMENT_PDF_HEADER_HEIGHT = 72/);
  assert.match(pdf, /resources\.backdrop/);
  assert.match(pdf, /opacity: OFFICIAL_DOCUMENT_BACKDROP_OPACITY/);
  assert.doesNotMatch(pdf, /const backdrop = "ScolaPro"/);
  assert.match(pdf, /loadPublicBrandBytes/);
});


test("internal header keeps a thin shared bottom rule and top-aligns crest with school identity", () => {
  assert.match(chrome, /school-header \{[^}]*border: 0; border-bottom: 1px solid var\(--line\)/);
  assert.doesNotMatch(chrome, /school-header\.internal-school \{[^}]*border-top/);
  assert.match(chrome, /internal-school > \.logo-wrap \{ align-self:start; padding-top:1px;/);
  assert.match(chrome, /internal-school > \.school-identity \{ align-self:start; padding-top:1px;/);
  assert.match(chrome, /max-width:62px; max-height:64px/);
  assert.match(chrome, /internal-document-context \{[^}]*line-height:1\.05/);
  assert.match(chrome, /document-context-title \{ margin-bottom:1px/);
  assert.match(chrome, /document-context-summary \{ margin-top:0/);
  assert.match(pdf, /start: \{ x, y: bottomY \}/);
  assert.match(pdf, /end: \{ x: x \+ width, y: bottomY \}/);
  assert.match(pdf, /thickness: 0\.75/);
  assert.doesNotMatch(pdf, /top rule begins only where school identity starts/);
  assert.match(pdf, /y: topY - 4 - imageHeight/);
  assert.match(pdf, /y: topY - 16/);
  assert.match(pdf, /let lineY = topY - 27/);
  assert.match(pdf, /let contextY = topY - 29/);
});


test("governed document art is bundled and matches the supplied replacements", () => {
  const crestPath = "public/brand/schools/namib-high/crest.png";
  const backdropPath = "public/brand/governed/scolapro-document-backdrop.png";
  assert.equal(existsSync(crestPath), true);
  assert.equal(existsSync(backdropPath), true);
  // #863 regenerated the Namib High crest raster from the intact committed
  // crest.svg (358x432 viewBox); the #844 raster was a truncated file whose
  // deflate payload stalled the bundled PNG decoder on every official-document
  // PDF export.
  assert.equal(createHash("sha256").update(readFileSync(crestPath)).digest("hex"), "69fe007cb344a712a7e6723e6b6aaa83c05c464be248e12331e26a9273cadc49");
  // The governed app-wide backdrop is the supplied A4 PNG. The same raster is
  // used by browser-print HTML and direct PDF generation to keep output aligned.
  assert.equal(createHash("sha256").update(readFileSync(backdropPath)).digest("hex"), "a7e07d4bdb32b981f58c1d2f8589bbb72845dfa7b777d6cc28789a50be1ec3ef");
  assert.match(profile, /\/brand\/schools\/namib-high\/crest\.png/);
});


test("internal PDF header uses only the shared thin bottom rule", () => {
  assert.doesNotMatch(pdf, /repaint the top edge/);
  assert.match(pdf, /start: \{ x, y: bottomY \}/);
  assert.match(pdf, /end: \{ x: x \+ width, y: bottomY \}/);
  assert.match(pdf, /thickness: 0\.75/);
});


test("shared school-name font runtime is reusable by custom document layouts", () => {
  assert.match(html, /export function renderOfficialDocumentSchoolNameFontStyle/);
  assert.match(html, /export function officialDocumentSchoolNameClass/);
  assert.match(html, /header\.schoolNameFont === "old_english"/);
  assert.match(html, /ScolaPro Old English/);
  const register = read("src/features/attendance/server/render-register-teacher-html.ts");
  assert.match(register, /renderOfficialDocumentSchoolNameFontStyle\(header\)/);
  assert.match(register, /officialDocumentSchoolNameClass\(header\)/);
});
