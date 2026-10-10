import assert from "node:assert/strict";
import test from "node:test";
import {
  HEADER_FIXTURE,
  htmlRenderer,
  learnerRow,
  layout,
  model,
  normalImpactRows,
  pdfRenderer,
  weekdaysBetween,
} from "./helpers/register-teacher-harness.mjs";

const TERM_START = "2026-01-12";
const TERM_END = "2026-03-27";

function buildRangeDocument() {
  // Four school weeks so the shared pagination splits each section into two
  // week panels (weeksPerPanel = 3), proving page-level pagination parity.
  const fromWeek = "2026-01-12";
  const toWeek = "2026-02-02";
  const selectedDate = "2026-02-06";
  const scope = model.resolveRegisterTeacherScope({
    mode: "range",
    selectedDate,
    fromWeek,
    toWeek,
    termStart: TERM_START,
    termEnd: TERM_END,
  });
  return model.buildRegisterTeacherDocument({
    mode: "range",
    academicYear: 2026,
    classId: "class-1",
    className: "Grade 6 A",
    gradeName: "Grade 6",
    registerTeacherName: "Fixture Teacher",
    termId: "term-1",
    termName: "Term 1",
    selectedDate,
    termStart: TERM_START,
    termEnd: TERM_END,
    scope,
    impactRows: normalImpactRows(TERM_START, TERM_END),
    enrolments: [
      learnerRow({ id: "b1", surname: "Amutenya", first_names: "Boys One", sex: "male" }),
      learnerRow({ id: "b2", surname: "Bock", first_names: "Boys Two", sex: "male", enrolled_from: "2026-01-26" }),
      learnerRow({ id: "g1", surname: "Nandjebo", first_names: "Girls One", sex: "female" }),
      learnerRow({ id: "g2", surname: "Oosthuizen", first_names: "Girls Two", sex: "female" }),
    ],
    currentRows: [
      { enrolment_id: "b1", attendance_date: "2026-01-13", status: "absent", reason_id: "reason-1", note: null },
      { enrolment_id: "b1", attendance_date: "2026-01-15", status: "absent", reason_id: null, note: null },
      { enrolment_id: "g1", attendance_date: "2026-01-12", status: "absent", reason_id: null, note: "Sick note" },
      { enrolment_id: "g2", attendance_date: "2026-02-04", status: "absent", reason_id: "reason-2", note: null },
    ],
    overrideRows: [],
    calendarEventRows: [],
    submissionRows: [],
  });
}

test("rendered HTML and PDF share page count, A3 landscape geometry and repeated chrome", async () => {
  const document = buildRangeDocument();
  const expectedPages = layout.registerTeacherPageJobs(document).length;
  assert.equal(expectedPages, 4, "two boys/girls sections over two week panels must produce four pages");

  const html = htmlRenderer.renderRegisterTeacherHtml({ header: HEADER_FIXTURE, document });
  const pdf = await pdfRenderer.renderRegisterTeacherPdf({ header: HEADER_FIXTURE, document });

  // PDF page count equals the shared pagination contract.
  assert.equal(pdf.pageCount, expectedPages);

  // HTML emits exactly one print section per shared page job.
  const htmlSections = html.match(/register page \d+ of \d+/g) ?? [];
  assert.equal(htmlSections.length, expectedPages, "HTML section count must match the PDF page count");

  // Boys/girls parity: both sections are present in the rendered output.
  assert.match(html, /BOYS\/GIRLS:<\/strong> BOYS/);
  assert.match(html, /BOYS\/GIRLS:<\/strong> GIRLS/);

  // Repeated official header + legend on every page.
  const headerCount = (html.match(/class="school-header/g) ?? []).length;
  const legendCount = (html.match(/class="legend"/g) ?? []).length;
  assert.equal(headerCount, expectedPages, "official header must repeat on every page");
  assert.equal(legendCount, expectedPages, "legend must repeat on every page");

  // Nonzero absences and a reasoned-absence marker must render.
  assert.match(html, /absence-reason-mark/, "reasoned absence marker must render");

  // A3 landscape physical geometry on every page.
  const { PDFDocument } = await import("pdf-lib");
  const parsed = await PDFDocument.load(pdf.bytes);
  assert.equal(parsed.getPageCount(), expectedPages);
  for (const page of parsed.getPages()) {
    const { width, height } = page.getSize();
    assert.ok(Math.abs(width - layout.REGISTER_TEACHER_LAYOUT.pageWidth) < 1, `page width ${width} must be A3 landscape`);
    assert.ok(Math.abs(height - layout.REGISTER_TEACHER_LAYOUT.pageHeight) < 1, `page height ${height} must be A3 landscape`);
    assert.ok(width > height, "register pages must be landscape");
  }
});

test("HTML column grid is derived from the shared layout contract", () => {
  const document = buildRangeDocument();
  const html = htmlRenderer.renderRegisterTeacherHtml({ header: HEADER_FIXTURE, document });
  // Column geometry is resolved per print panel (the weeks actually drawn on a page).
  const firstPanelWeeks = layout.registerTeacherPageJobs(document)[0].weeks;
  const plan = layout.registerTeacherColumnPlan(firstPanelWeeks);
  const pct = (fraction) => `${(fraction * 100).toFixed(3)}%`;

  assert.ok(html.includes(`<col style="width:${pct(plan.identityFractions[0])}">`), "first identity column width must come from the shared plan");
  assert.ok(html.includes(`<col style="width:${pct(plan.dayFraction)}">`), "day column width must come from the shared plan");
  assert.ok(html.includes(`<col style="width:${pct(plan.termFractions[2])}">`), "term column width must come from the shared plan");

  // The physical point grid the PDF draws is the same grid the HTML expresses as percentages.
  const totalFraction = plan.identityFractions.reduce((sum, value) => sum + value, 0)
    + plan.dayFraction * plan.attendanceColumns
    + plan.termFractions.reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(totalFraction - 1) < 1e-9, "shared column plan must fill the full content width");
});

test("reasoned absences render to PDF without throwing (ZapfDingbats regression)", async () => {
  // A reasoned absence draws a checkmark glyph. This previously threw because a
  // non-encodable character was passed to the ZapfDingbats font.
  const document = buildRangeDocument();
  const reasoned = document.sections.flatMap((section) => section.learners).some(
    (learner) => Object.values(learner.reasonedAbsenceDates).some(Boolean),
  );
  assert.ok(reasoned, "fixture must include at least one reasoned absence");
  await assert.doesNotReject(() => pdfRenderer.renderRegisterTeacherPdf({ header: HEADER_FIXTURE, document }));
});

test("shared scope resolver rejects inverted ranges and out-of-term weeks", () => {
  assert.throws(
    () => model.resolveRegisterTeacherScope({ mode: "range", selectedDate: "2026-01-30", fromWeek: "2026-01-26", toWeek: "2026-01-19", termStart: TERM_START, termEnd: TERM_END }),
    /From Week must not be after the To Week/,
  );
  assert.throws(
    () => model.resolveRegisterTeacherScope({ mode: "week", selectedDate: "2026-04-06", fromWeek: "2026-04-06", termStart: TERM_START, termEnd: TERM_END }),
    /outside the learner term/,
  );
});

test("builder term-to-date clipping never counts dates after the selected date", () => {
  const selectedDate = "2026-01-16";
  const scope = model.resolveRegisterTeacherScope({ mode: "term", selectedDate, termStart: TERM_START, termEnd: TERM_END });
  assert.equal(scope.termActualEnd, selectedDate);
  assert.equal(scope.scopeEnd, selectedDate);
  const document = model.buildRegisterTeacherDocument({
    mode: "term",
    academicYear: 2026,
    classId: "class-1",
    className: "Grade 6 A",
    gradeName: "Grade 6",
    registerTeacherName: "Fixture Teacher",
    termId: "term-1",
    termName: "Term 1",
    selectedDate,
    termStart: TERM_START,
    termEnd: TERM_END,
    scope,
    impactRows: normalImpactRows(TERM_START, TERM_END),
    enrolments: [learnerRow({ id: "b1", surname: "Amutenya", first_names: "Boys One", sex: "male" })],
    currentRows: [],
    overrideRows: [],
    calendarEventRows: [],
    submissionRows: [],
  });
  const expectedTermDays = weekdaysBetween(TERM_START, selectedDate).length;
  assert.equal(document.sections[0].termPossibleTotal, expectedTermDays);
  assert.equal(document.sections[0].termPossibleTotal < document.teachingDayCount, true, "term-to-date must be clipped below the full-term day count");
});
