import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("src/features/attendance/server/render-register-teacher-html.ts", "utf8");
const pdf = readFileSync("src/features/attendance/server/render-register-teacher-pdf.ts", "utf8");

test("register preview sheet fits and centers within the viewport", () => {
  assert.match(html, /\.sheet \{ width:100%; max-width:none; margin-inline:auto/);
  assert.match(html, /@media print/);
  assert.match(html, /size:A3 landscape/);
});

test("balance uses borderless inline titles instead of boxed uppercase cells", () => {
  assert.match(html, /class="balance-strip" aria-label="Register attendance balance"/);
  assert.match(html, /\.balance-strip \{ display:flex/);
  assert.doesNotMatch(html, /\.balance-item \{/);
  assert.doesNotMatch(html, /text-transform:uppercase/);
  for (const label of ["Attendance", "Absence", "Possible", "Balance:"]) {
    assert.ok(html.includes(label));
    assert.ok(pdf.includes(label));
  }
});

test("PDF mirrors HTML legend and metadata ordering", () => {
  assert.match(html, /<sup class="absence-reason-mark">✓<\/sup>/);
  assert.match(pdf, /const legendY = y - 7/);
  assert.match(pdf, /REGISTER CLASS:/);
  assert.match(pdf, /REGISTER TEACHER:/);
  assert.match(pdf, /"Tot\."/);
  assert.doesNotMatch(pdf, /drawCell\(page, resources\.bold, "WEEK"/);
});


test("reasoned absence PDF check sits next to the centered a, not at the cell edge", () => {
  assert.match(pdf, /x: x \+ dayWidth \/ 2 \+ 2\.3/);
  assert.doesNotMatch(pdf, /x: x \+ dayWidth - 5/);
  assert.match(pdf, /pdf\.setSubject\("Issue 1234 revised register PDF layout"\)/);
});

test("register letterhead uses the official old-English family in both renderers", () => {
  const route = readFileSync("src/app/api/attendance/register-teacher/route.ts", "utf8");
  const header = readFileSync("src/features/documents/server/official-document-html-header.ts", "utf8");
  assert.match(route, /schoolNameFont: "old_english" as const/);
  assert.match(header, /renderOfficialDocumentSchoolNameFontStyle/);
  assert.match(pdf, /createOfficialDocumentPdfResources/);
});

test("preview PDF download retains the descriptive register file name", () => {
  const actions = readFileSync("src/components/documents/official-document-actions.tsx", "utf8");
  const panel = readFileSync("src/features/attendance/inline-register-document-panel.tsx", "utf8");
  assert.match(actions, /download=\{previewDownloadName \|\| true\}/);
  assert.match(panel, /previewDownloadName=\{documentUrls\?\.fileName\}/);
});

test("internal letterhead preserves governed contact and school identity in HTML and PDF", () => {
  const htmlHeader = readFileSync("src/features/documents/server/official-document-html-header.ts", "utf8");
  const pdfHeader = readFileSync("src/features/documents/server/official-document-pdf-header.ts", "utf8");
  assert.match(htmlHeader, /internalIdentityDetails/);
  assert.match(htmlHeader, /header\.schoolEmisNumber/);
  assert.match(htmlHeader, /header\.postalLines/);
  assert.match(pdfHeader, /internalDetails/);
  assert.match(pdfHeader, /header\.schoolEmisNumber/);
  assert.match(pdfHeader, /header\.contactLines/);
});

test("PDF has the same grouped NAME identity heading as the accepted HTML preview", () => {
  assert.match(html, /class="identity name-head">NAME/);
  assert.match(pdf, /drawCell\(page, resources\.bold, "NAME", x, y, nameWidth, headerTop/);
  assert.match(pdf, /"Surname", x, y - headerTop/);
  assert.match(pdf, /"Given Names", x \+ identityWidths\[2\], y - headerTop/);
});

test("HTML reasoned absence superscript is anchored directly to its lowercase a", () => {
  assert.match(html, /\.legend \.mark-sample:has\(\.absence-reason-mark\) \{ position:relative/);
  assert.match(html, /\.legend \.absence-reason-mark \{ position:absolute; top:-\.38em; right:0/);
});
