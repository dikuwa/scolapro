import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import zlib from "node:zlib";
import {
  HEADER_FIXTURE,
  headerBuilder,
  htmlRenderer,
  layout,
  learnerRow,
  model,
  pdfRenderer,
  profileBuilder,
  weekdaysBetween,
} from "./helpers/register-teacher-harness.mjs";

/**
 * Extracts text-showing operators from a rendered register PDF by inflating
 * its FlateDecode content streams and decoding the hex-encoded strings pdf-lib
 * emits for standard fonts. This validates what a PDF reader (and pdftotext
 * in the E2E guard) can actually see, not just source-code patterns.
 */
async function extractPdfContentText(bytes) {
  const { PDFArray, PDFDocument, PDFRawStream } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes);
  let text = "";
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    if (!contents) continue;
    const streams = contents instanceof PDFArray
      ? contents.asArray().map((reference) => doc.context.lookup(reference))
      : [contents];
    for (const stream of streams) {
      if (!(stream instanceof PDFRawStream)) continue;
      const raw = Buffer.from(stream.getContents());
      let decoded;
      try { decoded = zlib.inflateSync(raw).toString("latin1"); } catch { decoded = raw.toString("latin1"); }
      // pdf-lib draws standard-font text as hex strings (<48656C6C6F> Tj).
      // Only the decoded printable text is kept so a name wrapped across several
      // drawText operators can still be checked as one contiguous string. Glyph
      // IDs from the subset Old English font decode to non-printable bytes and
      // are skipped.
      for (const match of decoded.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
        const value = Buffer.from(match[1], "hex").toString("latin1");
        if (/^[\x20-\x7E]+$/.test(value)) text += `${value} `;
      }
    }
  }
  return text;
}

/**
 * Horizontal text placements (page, x, y, text) read from the rendered PDF
 * content stream. pdf-lib draws horizontal standard-font text as
 * `1 0 0 1 x y Tm` followed by a hex `<...> Tj`, so this deliberately ignores
 * the rotated in-column closure labels and lets the band/summary geometry be
 * compared directly to prove there is no text collision.
 */
async function extractPdfTextPlacements(bytes) {
  const { PDFArray, PDFDocument, PDFRawStream } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes);
  const placements = [];
  const pages = doc.getPages();
  for (const [pageIndex, page] of pages.entries()) {
    const contents = page.node.Contents();
    if (!contents) continue;
    const streams = contents instanceof PDFArray
      ? contents.asArray().map((reference) => doc.context.lookup(reference))
      : [contents];
    for (const stream of streams) {
      if (!(stream instanceof PDFRawStream)) continue;
      const raw = Buffer.from(stream.getContents());
      let decoded;
      try { decoded = zlib.inflateSync(raw).toString("latin1"); } catch { decoded = raw.toString("latin1"); }
      for (const match of decoded.matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm\s*<([0-9A-Fa-f]+)> Tj/g)) {
        const value = Buffer.from(match[3], "hex").toString("latin1");
        if (!/^[\x20-\x7E]+$/.test(value)) continue;
        placements.push({ page: pageIndex, x: Number(match[1]), y: Number(match[2]), text: value });
      }
    }
  }
  return placements;
}

const html = readFileSync("src/features/attendance/server/render-register-teacher-html.ts", "utf8");
const pdf = readFileSync("src/features/attendance/server/render-register-teacher-pdf.ts", "utf8");
const layoutSource = readFileSync("src/features/attendance/server/register-teacher-layout.ts", "utf8");

const TERM_START = "2026-01-12";
const TERM_END = "2026-03-27";

/**
 * A dense, realistic register: 43 boys and 43 girls with long real-world surnames,
 * a governed multi-day closure inside the printed scope, reasoned and unexplained
 * absences, so page density, closure labels and pagination are all exercised.
 */
function buildDenseDocument(mode = "week") {
  const closure = { start: "2026-01-14", end: "2026-01-15" };
  const inClosure = (date) => date >= closure.start && date <= closure.end;
  const surnames = ["Amutenya", "Engelbrecht-Vermeulen", "Katjivena-Haingura", "Nghidinwa-Kamatiro", "Tjipangandjara", "Van Der Merwe"];
  const given = ["Johannes Nepomuk", "Elizabeth Johanna Susara", "Ndeshiipala Wilhelmina", "Uapenga Ndapewa"];
  const enrolments = [];
  for (let index = 0; index < 43; index += 1) {
    enrolments.push(learnerRow({
      id: `b${index + 1}`,
      admission_number: `2026-${String(index + 1).padStart(3, "0")}`,
      surname: surnames[index % surnames.length],
      first_names: given[index % given.length],
      sex: "male",
    }));
    enrolments.push(learnerRow({
      id: `g${index + 1}`,
      admission_number: `2026-${String(index + 101).padStart(3, "0")}`,
      surname: surnames[(index + 2) % surnames.length],
      first_names: given[(index + 1) % given.length],
      sex: "female",
    }));
  }
  const selectedDate = mode === "week" ? "2026-01-16" : "2026-02-06";
  const scope = mode === "week"
    ? model.resolveRegisterTeacherScope({ mode: "week", selectedDate, fromWeek: "2026-01-12", termStart: TERM_START, termEnd: TERM_END })
    : model.resolveRegisterTeacherScope({ mode: "term", selectedDate, termStart: TERM_START, termEnd: TERM_END });
  return model.buildRegisterTeacherDocument({
    mode,
    academicYear: 2026,
    classId: "class-1",
    className: "Grade 10 A",
    gradeName: "Grade 10",
    registerTeacherName: "Fixture Teacher",
    termId: "term-1",
    termName: "Term 1",
    selectedDate,
    termStart: TERM_START,
    termEnd: TERM_END,
    scope,
    impactRows: weekdaysBetween(TERM_START, TERM_END).map((target_date) => ({
      target_date,
      teaching_impact: inClosure(target_date) ? "NO_TEACHING" : "NORMAL",
    })),
    enrolments,
    currentRows: [
      { enrolment_id: "b1", attendance_date: "2026-01-13", status: "absent", reason_id: "reason-1", note: null },
      { enrolment_id: "g1", attendance_date: "2026-01-12", status: "absent", reason_id: null, note: null },
      { enrolment_id: "g2", attendance_date: "2026-01-13", status: "absent", reason_id: "reason-2", note: null },
    ],
    overrideRows: [],
    calendarEventRows: [{
      event_scope: "school",
      title: "School holiday",
      starts_on: closure.start,
      ends_on: closure.end,
      created_at: "2026-01-05T08:00:00Z",
    }],
    submissionRows: [],
  });
}

test("register preview sheet fits and centers within the viewport", () => {
  assert.match(html, /\.sheet \{ width:100%; max-width:none; margin-inline:auto/);
  assert.match(html, /@media print/);
  // The A3 print box lives in the shared layout contract so the printed preview
  // and the PDF use the same physical margin.
  assert.match(layoutSource, /size: A3 landscape; margin: \$\{REGISTER_TEACHER_LAYOUT\.margin\}pt/);
  assert.match(html, /\$\{REGISTER_TEACHER_PRINT_PAGE_RULE\}/);
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
  assert.match(pdf, /const markX = x \+ \(dayWidth - markWidth\) \/ 2/);
  assert.match(pdf, /x: markX \+ markWidth - 0\.35/);
  assert.doesNotMatch(pdf, /x: x \+ dayWidth - 5/);
  assert.match(pdf, /pdf\.setSubject\("Issue 1234 revised register PDF layout"\)/);
});

test("register letterhead honors the configured old-English family in both renderers", () => {
  const route = readFileSync("src/app/api/attendance/register-teacher/route.ts", "utf8");
  const header = readFileSync("src/features/documents/server/official-document-html-header.ts", "utf8");
  const seed = readFileSync("e2e/support/seed-world.mjs", "utf8");
  assert.doesNotMatch(route, /schoolNameFont: "old_english" as const/);
  assert.match(route, /buildOfficialDocumentHeaderModel\(profile/);
  assert.match(seed, /school_name_font: "old_english"/);
  assert.match(header, /renderOfficialDocumentSchoolNameFontStyle/);
  assert.match(pdf, /createOfficialDocumentPdfResources/);
  assert.match(pdf, /resources\.italic/);
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
  const headerModel = readFileSync("src/features/documents/server/official-document-header.ts", "utf8");
  assert.match(htmlHeader, /internalIdentityDetails/);
  assert.match(htmlHeader, /officialDocumentInternalIdentityLines\(header\)/);
  assert.match(pdfHeader, /officialDocumentInternalIdentityLines\(header\)/);
  assert.match(headerModel, /label: "Postal \/ town"/);
  assert.match(headerModel, /contacts\.get\("telephone"\)/);
  assert.match(headerModel, /contacts\.get\("fax"\)/);
  assert.match(headerModel, /contacts\.get\("email"\)/);
  assert.match(headerModel, /header\.schoolEmisNumber/);
});

test("PDF has the same grouped NAME identity heading as the accepted HTML preview", () => {
  assert.match(html, /class="identity name-head">NAME/);
  assert.match(pdf, /drawCell\(page, resources\.bold, "NAME", x, y, nameWidth, headerTop/);
  assert.match(pdf, /"Surname", x, y - headerTop/);
  assert.match(pdf, /"Given Names", x \+ identityWidths\[2\], y - headerTop/);
});

test("HTML reasoned absence superscript is anchored directly to its lowercase a", () => {
  assert.match(html, /margin-left:0/);
  assert.match(html, /\.legend \.mark-sample:has\(\.absence-reason-mark\) \{ position:relative/);
  assert.match(html, /\.legend \.absence-reason-mark \{ position:absolute; top:-\.38em; right:0/);
});

test("preview and PDF share one vertical rhythm instead of per-renderer row heights", () => {
  // The PDF used a 13pt row pitch against the preview's 19px (14.25pt), which
  // accumulated to a 50pt divergence across a full 40-learner page.
  assert.match(layoutSource, /rowHeight: 14\.25/);
  assert.match(layoutSource, /export function registerTeacherCssPx/);
  assert.match(html, /height:\$\{registerTeacherCssPx\(REGISTER_TEACHER_LAYOUT\.rowHeight\)\}px/);
  assert.match(pdf, /const ROW_HEIGHT = REGISTER_TEACHER_LAYOUT\.rowHeight/);
  assert.doesNotMatch(pdf, /const ROW_HEIGHT = 13/);
  assert.equal(layout.registerTeacherCssPx(layout.REGISTER_TEACHER_LAYOUT.rowHeight), 19);
});

test("a full 40-learner page still fits the A3 content box at the shared row pitch", () => {
  const { pageHeight, margin, rowHeight, learnersPerPage, tableHeaderTop, tableHeaderBottom, legendHeight, metadataHeight } = layout.REGISTER_TEACHER_LAYOUT;
  const headerHeight = 72; // INTERNAL_SCHOOL_DOCUMENT_PDF_HEADER_HEIGHT (shared chrome)
  const footerHeight = 12; // borderless balance/attendance strip
  const used = headerHeight + legendHeight + metadataHeight + tableHeaderTop + tableHeaderBottom
    + learnersPerPage * rowHeight + 3 * rowHeight + footerHeight;
  assert.ok(
    used <= pageHeight - margin * 2,
    `register page content (${used}pt) must fit the A3 content box (${pageHeight - margin * 2}pt)`,
  );
});

test("governed closures render in the PDF attendance area as well as the preview", () => {
  // The holiday/closure name belongs inside the attendance area (the legend
  // promises it) and both renderers must use one governed compaction rule.
  assert.match(layoutSource, /export function registerTeacherClosureLabel/);
  assert.match(html, /registerTeacherClosureLabel\(day\.reason\)/);
  assert.match(pdf, /registerTeacherClosureLabel\(day\.reason\)/);
  assert.match(pdf, /rotate: degrees\(90\)/);
  assert.match(pdf, /const closureColumns: Array<\{ x: number; width: number; label: string \}> = \[\]/);
  // The day header keeps the preview's weekday/day-number pair on both teaching
  // and closed days instead of replacing it with a truncated reason label.
  assert.match(pdf, /page\.drawText\(day\.weekday/);
  assert.match(pdf, /page\.drawText\(day\.dayNumber/);
  assert.doesNotMatch(pdf, /Non-teaching \$\{day\.weekday\}/);
});

test("governance flag and balance strip cannot overlap in the PDF", () => {
  assert.match(pdf, /const balanceY = Math\.max\(20, y - 10\)/);
  assert.match(pdf, /y: balanceY \+ 9/);
  const governanceIndex = pdf.indexOf("Governance flag:");
  const balanceIndex = pdf.indexOf("page.drawText(balanceLabel");
  assert.ok(governanceIndex !== -1 && balanceIndex !== -1);
});

test("PDF metadata band leaves a gap between label and value", () => {
  assert.match(pdf, /const valueX = x \+ 4 \+ labelWidth \+ 3/);
  assert.doesNotMatch(pdf, /x: x \+ 4 \+ resources\.bold\.widthOfTextAtSize\(label, labelSize\)/);
});

test("dense synthetic register renders matching HTML and PDF pages in both modes", async () => {
  const profile = profileBuilder.buildSchoolDocumentProfile({
    fallbackSchoolName: "Fallback School",
    fallbackSchoolEmisNumber: "FALLBACK-EMIS",
    schoolIdentity: { name: "Namib High School", emis_number: "DEMO001", town: "Swakopmund" },
    schoolDocumentProfile: {
      former_name: "Synthetic Former Name",
      physical_address: "123 Synthetic School Road",
      telephone: "+264 64 555 0100",
      fax: "+264 64 555 0101",
      email: "office@synthetic-school.test",
      postal_address: "P.O. Box 12345",
      town: "Swakopmund",
      school_name_font: "old_english",
    },
  });
  const header = headerBuilder.buildOfficialDocumentHeaderModel(profile, {
    mode: "internal_school",
    provenanceSource: "live_school_profile",
  });
  for (const mode of ["week", "term"]) {
    const document = buildDenseDocument(mode);
    const expectedPages = layout.registerTeacherPageJobs(document).length;
    const renderedHtml = htmlRenderer.renderRegisterTeacherHtml({ header, document });
    const renderedPdf = await pdfRenderer.renderRegisterTeacherPdf({ header, document });
    assert.equal(renderedPdf.pageCount, expectedPages);
    assert.equal((renderedHtml.match(/register page \d+ of \d+/g) ?? []).length, expectedPages);
    // Both sections paginate at the shared 40 learners per page and keep the
    // governed closure label in the HTML attendance area.
    assert.match(renderedHtml, /class="mark non-teaching closure-column"/);
    assert.match(renderedHtml, />School holiday</);
    for (const section of document.sections) {
      assert.equal(section.learners.length, 43);
      assert.ok(section.learners.some((learner) => Object.values(learner.reasonedAbsenceDates).some(Boolean)));
    }
  }
  // The fixture header stays usable for the shared chrome path as well.
  await pdfRenderer.renderRegisterTeacherPdf({ header: HEADER_FIXTURE, document: buildDenseDocument("week") });
});

/**
 * A sparse register section (0-2 learners) with a long governed closure name
 * spanning consecutive closed days. The band above the summary rows is then
 * shorter than the minimum rotated line, which used to make the PDF silently
 * drop the label the preview still shows.
 */
function buildSparseDocument(learnerCount, closureTitle) {
  const closure = { start: "2026-01-14", end: "2026-01-15" };
  const inClosure = (date) => date >= closure.start && date <= closure.end;
  const enrolments = Array.from({ length: learnerCount }, (_, index) => learnerRow({
    id: `s${index + 1}`,
    admission_number: `2026-${String(index + 1).padStart(3, "0")}`,
    surname: "Van Der Merwe",
    first_names: "Johannes Nepomuk",
    sex: index % 2 ? "female" : "male",
  }));
  const selectedDate = "2026-01-16";
  const scope = model.resolveRegisterTeacherScope({ mode: "week", selectedDate, fromWeek: "2026-01-12", termStart: TERM_START, termEnd: TERM_END });
  return model.buildRegisterTeacherDocument({
    mode: "week",
    academicYear: 2026,
    classId: "class-1",
    className: "Grade 10 A",
    gradeName: "Grade 10",
    registerTeacherName: "Fixture Teacher",
    termId: "term-1",
    termName: "Term 1",
    selectedDate,
    termStart: TERM_START,
    termEnd: TERM_END,
    scope,
    impactRows: weekdaysBetween(TERM_START, TERM_END).map((target_date) => ({
      target_date,
      teaching_impact: inClosure(target_date) ? "NO_TEACHING" : "NORMAL",
    })),
    enrolments,
    currentRows: [],
    overrideRows: [],
    calendarEventRows: [{
      event_scope: "school",
      title: closureTitle,
      starts_on: closure.start,
      ends_on: closure.end,
      created_at: "2026-01-05T08:00:00Z",
    }],
    submissionRows: [],
  });
}

test("sparse register sections never drop the governed closure label from the PDF", async () => {
  const closureTitle = "School holiday - Coastal Storm Closure And Community Evacuation Observance";
  const closureLabel = layout.registerTeacherClosureLabel(closureTitle);
  const labelWords = closureLabel.split(" ");
  // The source renderer must not contain a silent omission path for labels.
  assert.doesNotMatch(pdf, /if \(fitted > available\) continue/);
  assert.match(pdf, /wrapClosureLabelLines/);
  const wordsInOrder = (text, words) => {
    const flattened = text.replace(/\s+/g, "");
    let cursor = 0;
    for (const word of words) {
      const index = flattened.indexOf(word, cursor);
      if (index === -1) return false;
      cursor = index + word.length;
    }
    return true;
  };
  for (const learnerCount of [0, 1, 2, 43]) {
    const document = buildSparseDocument(learnerCount, closureTitle);
    const rendered = await pdfRenderer.renderRegisterTeacherPdf({ header: HEADER_FIXTURE, document });
    assert.equal(rendered.pageCount, 2, `learnerCount=${learnerCount} renders BOYS + GIRLS pages`);
    const text = await extractPdfContentText(rendered.bytes);
    assert.ok(text.length > 0, `learnerCount=${learnerCount} exposes inflated content streams`);
    // Wrapped labels are drawn as one text operator per line, so the full name
    // is validated word-by-word in order rather than as one contiguous string.
    assert.ok(
      wordsInOrder(text, labelWords),
      `learnerCount=${learnerCount} must keep the full closure label in the PDF content stream`,
    );
    // Consecutive closed days mean one label per closed column across both
    // sections (BOYS + GIRLS): the label's leading word must be drawn at least
    // once per closed day per section, never omitted for sparse bands.
    const leadingWordOccurrences = text.split(labelWords[0]).length - 1;
    assert.ok(
      leadingWordOccurrences >= 4,
      `learnerCount=${learnerCount} must draw the closure label for both closed days in both sections (found ${leadingWordOccurrences})`,
    );
  }
});

/**
 * Two consecutive closed days carrying different, overlong governed names. Each
 * compacted name is far longer than 500 characters and longer than any date
 * column can hold readably, so the renderer must fall back to the indexed
 * closure-note continuation band instead of clipping the name.
 */
const LONG_CLOSURE_A = `School holiday - ${"Coastal Storm Closure And Community Evacuation Observance ".repeat(10).trim()}`;
const LONG_CLOSURE_B = `Public holiday - ${"Regional Flooding Response And Shelter Coordination Directive ".repeat(10).trim()}`;
const OVERLONG_CLOSURES = { "2026-01-14": LONG_CLOSURE_A, "2026-01-15": LONG_CLOSURE_B };

function buildOverlongClosureDocument(learnerCount, mode, closures = OVERLONG_CLOSURES, selectedDateOverride) {
  const enrolments = Array.from({ length: learnerCount }, (_, index) => learnerRow({
    id: `o${index + 1}`,
    admission_number: `2026-${String(index + 1).padStart(3, "0")}`,
    surname: "Van Der Merwe",
    first_names: "Johannes Nepomuk",
    sex: index % 2 ? "female" : "male",
  }));
  const selectedDate = selectedDateOverride ?? (mode === "week" ? "2026-01-16" : "2026-02-06");
  const scope = mode === "week"
    ? model.resolveRegisterTeacherScope({ mode: "week", selectedDate, fromWeek: "2026-01-12", termStart: TERM_START, termEnd: TERM_END })
    : model.resolveRegisterTeacherScope({ mode: "term", selectedDate, termStart: TERM_START, termEnd: TERM_END });
  return model.buildRegisterTeacherDocument({
    mode,
    academicYear: 2026,
    classId: "class-1",
    className: "Grade 10 A",
    gradeName: "Grade 10",
    registerTeacherName: "Fixture Teacher",
    termId: "term-1",
    termName: "Term 1",
    selectedDate,
    termStart: TERM_START,
    termEnd: TERM_END,
    scope,
    impactRows: weekdaysBetween(TERM_START, TERM_END).map((target_date) => ({
      target_date,
      teaching_impact: closures[target_date] ? "NO_TEACHING" : "NORMAL",
    })),
    enrolments,
    currentRows: [],
    overrideRows: Object.entries(closures).map(([school_date, reason]) => ({ school_date, reason })),
    calendarEventRows: [],
    submissionRows: [],
  });
}

test("one shared decision governs when a governed closure name moves to the continuation band", () => {
  const longLabel = layout.registerTeacherClosureLabel(LONG_CLOSURE_A);
  assert.ok(longLabel.length > 500, "fixture name exceeds 500 characters");
  // A tall dense band keeps the name in-column however long it is.
  assert.equal(layout.registerTeacherClosureNeedsContinuation({ label: longLabel, availableHeight: 600, columnWidth: 108 }), false);
  // A short sparse band cannot hold an overlong name readably, so it continues.
  assert.equal(layout.registerTeacherClosureNeedsContinuation({ label: longLabel, availableHeight: 24, columnWidth: 108 }), true);
  // Ordinary governed labels keep the existing in-column rendering.
  assert.equal(layout.registerTeacherClosureNeedsContinuation({ label: "School holiday", availableHeight: 24, columnWidth: 108 }), false);
  // Both renderers consume the one shared plan, so HTML and PDF cannot diverge.
  assert.match(html, /registerTeacherClosureNotes\(weeks, section\.learners\.length\)/);
  assert.match(pdf, /registerTeacherClosureNotes\(weeks, learners\.length\)/);
});

test("the PDF renderer never truncates a governed closure name", () => {
  // The old fallback sliced the wrapped lines and appended an ellipsis, which
  // silently dropped governed document content.
  assert.doesNotMatch(pdf, /…/);
  assert.doesNotMatch(pdf, /lines\.slice\(0, maxLines\)/);
  assert.doesNotMatch(pdf, /endsWith\("…"\)/);
  assert.match(pdf, /drawClosureNoteBand/);
});

test("consecutive overlong closures keep their complete governed names in HTML and PDF", async () => {
  const labelA = layout.registerTeacherClosureLabel(LONG_CLOSURE_A);
  const labelB = layout.registerTeacherClosureLabel(LONG_CLOSURE_B);
  assert.ok(labelA.length > 500 && labelB.length > 500);
  assert.notEqual(labelA, labelB);
  const flatA = labelA.replace(/\s+/g, "");
  const flatB = labelB.replace(/\s+/g, "");
  for (const learnerCount of [0, 1, 2, 43]) {
    const document = buildOverlongClosureDocument(learnerCount, "week");
    const rendered = await pdfRenderer.renderRegisterTeacherPdf({ header: HEADER_FIXTURE, document });
    assert.equal(rendered.pageCount, 2, `learnerCount=${learnerCount} renders BOYS + GIRLS pages`);
    const text = (await extractPdfContentText(rendered.bytes)).replace(/\s+/g, "");
    assert.ok(text.includes(flatA), `learnerCount=${learnerCount} keeps the complete first closure name in the PDF`);
    assert.ok(text.includes(flatB), `learnerCount=${learnerCount} keeps the complete second closure name in the PDF`);
    const html = htmlRenderer.renderRegisterTeacherHtml({ header: HEADER_FIXTURE, document });
    assert.ok(html.includes(labelA), `learnerCount=${learnerCount} keeps the complete first closure name in the preview`);
    assert.ok(html.includes(labelB), `learnerCount=${learnerCount} keeps the complete second closure name in the preview`);
    // Sparse panels continue into the indexed band; a dense 43-learner panel has
    // enough vertical room and keeps the names inside their date columns.
    const expectsBand = learnerCount !== 43;
    assert.equal(/<tr class="closure-notes-row">/.test(html), expectsBand, `learnerCount=${learnerCount} HTML band`);
    assert.equal(/<span class="closure-index"/.test(html), learnerCount === 1 || learnerCount === 2, `learnerCount=${learnerCount} HTML column index`);
  }
});

test("overlong closures render in an indexed band above the summary with no text collision", async () => {
  const document = buildOverlongClosureDocument(1, "week");
  const rendered = await pdfRenderer.renderRegisterTeacherPdf({ header: HEADER_FIXTURE, document });
  const placements = await extractPdfTextPlacements(rendered.bytes);
  const bandHeadings = placements.filter((placement) => placement.text.startsWith("Governed closures"));
  const summaryLabels = placements.filter((placement) => placement.text === "Total number of attendances");
  assert.ok(bandHeadings.length >= 2, "the continuation band is drawn on both sections");
  assert.ok(summaryLabels.length >= 2, "the summary rows are still drawn on both sections");
  for (const page of new Set(placements.map((placement) => placement.page))) {
    const onPage = placements.filter((placement) => placement.page === page);
    const band = onPage.filter((placement) => placement.text.startsWith("Governed closures"));
    const summary = onPage.filter((placement) => placement.text === "Total number of attendances");
    if (!band.length || !summary.length) continue;
    // The whole band sits strictly above the summary row, so no governed name
    // can collide with a column, learner or summary boundary.
    assert.ok(
      Math.min(...band.map((placement) => placement.y)) > Math.max(...summary.map((placement) => placement.y)),
      `page ${page}: the continuation band must sit above the summary rows`,
    );
  }
  // Both consecutive closed date columns carry their band index marker.
  const markers = placements.filter((placement) => placement.text === "1" || placement.text === "2");
  assert.ok(markers.length >= 4, "each closed date column is indexed on both sections");
});

test("multi-week term registers carry consecutive overlong closures without truncation", async () => {
  const document = buildOverlongClosureDocument(5, "term");
  const jobs = layout.registerTeacherPageJobs(document);
  assert.ok(jobs.length >= 4, "the term register splits into multiple week panels per section");
  const rendered = await pdfRenderer.renderRegisterTeacherPdf({ header: HEADER_FIXTURE, document });
  assert.equal(rendered.pageCount, jobs.length);
  const text = (await extractPdfContentText(rendered.bytes)).replace(/\s+/g, "");
  assert.ok(text.includes(layout.registerTeacherClosureLabel(LONG_CLOSURE_A).replace(/\s+/g, "")));
  assert.ok(text.includes(layout.registerTeacherClosureLabel(LONG_CLOSURE_B).replace(/\s+/g, "")));
  const html = htmlRenderer.renderRegisterTeacherHtml({ header: HEADER_FIXTURE, document });
  assert.ok(html.includes(layout.registerTeacherClosureLabel(LONG_CLOSURE_A)));
  assert.ok(html.includes(layout.registerTeacherClosureLabel(LONG_CLOSURE_B)));
  assert.equal((html.match(/register page \d+ of \d+/g) ?? []).length, jobs.length);
  // The band and its index markers survive the multi-week panel split.
  assert.match(html, /<tr class="closure-notes-row">/);
  assert.match(html, /<span class="closure-index"/);
});

test("extreme-length governed closure names stay fully extractable and on-page", async () => {
  const extremeA = `School holiday - ${"Coastal Storm Closure And Community Evacuation Observance ".repeat(80).trim()}`;
  const extremeB = `Public holiday - ${"Regional Flooding Response And Shelter Coordination Directive ".repeat(80).trim()}`;
  const labelA = layout.registerTeacherClosureLabel(extremeA);
  assert.ok(labelA.length > 4000, "fixture is far beyond the 500-character contract case");
  const document = buildOverlongClosureDocument(1, "week", { "2026-01-14": extremeA, "2026-01-15": extremeB });
  const rendered = await pdfRenderer.renderRegisterTeacherPdf({ header: HEADER_FIXTURE, document });
  const text = (await extractPdfContentText(rendered.bytes)).replace(/\s+/g, "");
  assert.ok(text.includes(labelA.replace(/\s+/g, "")));
  assert.ok(text.includes(layout.registerTeacherClosureLabel(extremeB).replace(/\s+/g, "")));
  const placements = await extractPdfTextPlacements(rendered.bytes);
  for (const summary of placements.filter((p) => p.text === "Total number of attendances")) {
    assert.ok(summary.y > 32, "the summary rows stay inside the printable page for extreme names");
  }
});

test("a panel carrying more governed closure text than one band holds spills without truncation", async () => {
  const days = weekdaysBetween("2026-01-12", "2026-01-30");
  const body = "Coastal Storm Closure And Community Evacuation Observance ".repeat(108).slice(0, 6000).trim();
  const closures = Object.fromEntries(days.map((date, index) => [date, `School holiday - Closure ${index + 1} ${body}`]));
  const document = buildOverlongClosureDocument(1, "term", closures, "2026-01-30");
  const jobs = layout.registerTeacherPageJobs(document);
  const rendered = await pdfRenderer.renderRegisterTeacherPdf({ header: HEADER_FIXTURE, document });
  assert.ok(rendered.pageCount >= jobs.length);
  const text = (await extractPdfContentText(rendered.bytes)).replace(/\s+/g, "");
  // The overflow is carried to continuation pages, never truncated or dropped.
  assert.ok(text.includes("Registerclosurenotes(continued)"), "the overflow spills to a continuation page");
  for (const reason of Object.values(closures)) {
    assert.ok(text.includes(layout.registerTeacherClosureLabel(reason).replace(/\s+/g, "")), "every governed closure name survives the spill");
  }
  const placements = await extractPdfTextPlacements(rendered.bytes);
  const summaries = placements.filter((p) => p.text === "Total number of attendances");
  assert.ok(summaries.length >= 2);
  for (const summary of summaries) {
    assert.ok(summary.y > 32, "the summary rows stay inside the printable page after a spill");
  }
});

test("zero-learner sections mark closure columns consistently in HTML and PDF", async () => {
  const document = buildOverlongClosureDocument(0, "week");
  const rendered = await pdfRenderer.renderRegisterTeacherPdf({ header: HEADER_FIXTURE, document });
  const placements = await extractPdfTextPlacements(rendered.bytes);
  // With no learner row there is no date-column body, so neither renderer draws
  // an in-column index marker; the band's own date keeps the name unambiguous.
  assert.equal(placements.filter((placement) => placement.text === "1" || placement.text === "2").length, 0);
  const html = htmlRenderer.renderRegisterTeacherHtml({ header: HEADER_FIXTURE, document });
  assert.doesNotMatch(html, /<span class="closure-index"/);
  assert.match(html, /<tr class="closure-notes-row">/);
  const text = (await extractPdfContentText(rendered.bytes)).replace(/\s+/g, "");
  assert.ok(text.includes(layout.registerTeacherClosureLabel(LONG_CLOSURE_A).replace(/\s+/g, "")));
  assert.ok(text.includes(layout.registerTeacherClosureLabel(LONG_CLOSURE_B).replace(/\s+/g, "")));
});
