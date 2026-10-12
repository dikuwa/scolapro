import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
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
  const seed = readFileSync("scripts/seed-e2e-fixtures.mjs", "utf8");
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
