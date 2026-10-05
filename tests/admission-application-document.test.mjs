import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const page = read("src/app/school/admissions/application-form/page.tsx");
const route = read("src/app/api/official-documents/admission-application/route.ts");
const renderer = read("src/features/admissions/server/render-admission-application-pdf.ts");
const header = read("src/features/documents/server/official-document-header.ts");
const classActions = read("src/features/learners/class-list-document-actions.tsx");
const sharedActions = read("src/components/documents/official-document-actions.tsx");

test("admission application uses the normal AppShell and previews the canonical PDF", () => {
  assert.match(page, /<AppShell>/);
  assert.match(page, /OfficialDocumentActions/);
  assert.match(page, /Learner application form PDF preview/);
  assert.match(page, /src=\{pdfPreviewHref\}/);
  assert.match(page, /previewHref="#application-form-preview"/);
  assert.match(page, /fit="viewport"/);
  assert.match(page, /downloadLabel="PDF"/);
  assert.doesNotMatch(page, /Download PDF/);
  assert.doesNotMatch(page, /window\.print/);
  assert.doesNotMatch(page, /FormSection|Checklist|function Line/);
});

test("admission PDF route matches the class-list preview and download contract", () => {
  assert.match(route, /preview = url\.searchParams\.get\("preview"\) === "1"/);
  assert.match(route, /Content-Type": "application\/pdf"/);
  assert.match(route, /Content-Disposition/);
  assert.match(route, /preview \? "inline" : "attachment"/);
  assert.match(route, /Cache-Control": "private, no-store, max-age=0"/);
  assert.match(route, /X-ScolaPro-Page-Count/);
  assert.match(route, /currentSchoolMembership/);
});

test("admission form resolves through the shared official external header family", () => {
  assert.match(header, /"admission_application"/);
  assert.match(header, /"official_external"/);
  assert.match(header, /"prescribed_statutory"/);
  assert.match(header, /case "admission_application"/);
  assert.match(route, /officialDocumentHeaderModeForType\("admission_application"\)/);
  assert.match(renderer, /drawOfficialDocumentPdfHeader/);
});

test("guardian panels contain the full contact stack before the next section", () => {
  const heightMatch = renderer.match(/const GUARDIAN_PANEL_HEIGHT = (\d+);/);
  assert.ok(heightMatch, "guardian panel height constant is present");

  const panelHeight = Number(heightMatch[1]);
  const contentStartOffset = 31;
  const fieldHeights = [17, 17, 17, 22, 22, 17, 17];
  const requiredHeight = contentStartOffset + fieldHeights.reduce((total, height) => total + height, 0);

  assert.ok(
    panelHeight >= requiredHeight,
    "guardian panel height " + panelHeight + " must contain " + requiredHeight + "pt of header/field geometry",
  );
  assert.match(renderer, /y = Math\.min\(guardianBottom1, guardianBottom2\) - 14;/);
});

test("application PDF contains the requested labelled form sections", () => {
  assert.match(renderer, /LEARNER APPLICATION FORM/);
  assert.match(renderer, /LEARNER PASSPORT PHOTO/);
  assert.match(renderer, /Guardian 1/);
  assert.match(renderer, /Guardian 2/);
  assert.match(renderer, /Residential address/);
  assert.match(renderer, /Postal address/);
  assert.match(renderer, /Occupation/);
  assert.match(renderer, /Work telephone \/ number/);
  assert.match(renderer, /Document Checklist/);
  assert.match(renderer, /Passport \/ learner photo \/ ID/);
  assert.match(renderer, /const box = 10/);
  assert.match(renderer, /Guardian signature/);
  assert.match(renderer, /SCHOOL STAMP \/ OFFICIAL USE/);
  assert.match(renderer, /const SCHOOL_USE_BOX_HEIGHT = 76/);
  assert.match(renderer, /fieldPair\(page, bold, "Date of birth", "Sex"/);
  assert.match(renderer, /fieldPair\(page, bold, "Current \/ last grade", "Intended grade \/ year"/);
});

test("official document actions are shared with Class Lists", () => {
  assert.match(classActions, /OfficialDocumentActions/);
  assert.match(sharedActions, /Preview \/ Print/);
  assert.match(sharedActions, /spreadsheetHref/);
  assert.equal(existsSync("src/features/admissions/print-application-button.tsx"), false);
});


test("admission preview fills the application workspace without opening a second app page", () => {
  const preview = read("src/components/documents/official-document-preview.tsx");
  const actions = read("src/components/documents/official-document-actions.tsx");
  assert.match(preview, /fit\?: "page" \| "viewport"/);
  assert.match(preview, /h-\[clamp\(44rem,78vh,70rem\)\] w-full min-w-0/);
  assert.match(actions, /previewIsPageAnchor/);
  assert.match(actions, /previewIsPageAnchor \? undefined : "_blank"/);
  assert.match(page, /id="application-form-preview"/);
  assert.doesNotMatch(page, /helper="[^"]*separate tab/);
});

test("handwritten application geometry leaves room for writing and school use", () => {
  assert.match(renderer, /return y - 21;/);
  assert.match(renderer, /bold\.widthOfTextAtSize\(labelText, size\) \+ 11/);
  assert.match(renderer, /height: 24, multiline: true/);
  assert.match(renderer, /SCHOOL_USE_BOX_WIDTH = 112/);
  assert.match(renderer, /SCHOOL_USE_BOX_HEIGHT = 76/);
  assert.match(renderer, /disclaimerWidth = CONTENT_WIDTH - SCHOOL_USE_BOX_WIDTH - 18/);
});


test("admission section headings keep clear bottom spacing and guardian borders stay intact", () => {
  assert.match(renderer, /return y - 21;/);
  const guardianPanelSource = renderer.split("function guardianPanel")[1]?.split("function checkbox")[0] ?? "";
  assert.ok(
    guardianPanelSource.indexOf("color: SOFT") < guardianPanelSource.indexOf("borderWidth: 0.55"),
    "guardian header fill must render before the panel outline so it cannot paint over the border",
  );
});
