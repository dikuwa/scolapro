import type {
  RegisterTeacherDocument,
  RegisterTeacherSection,
  RegisterTeacherWeek,
} from "@/features/attendance/server/register-teacher-document";

/**
 * Single authoritative register-teacher layout contract.
 *
 * Why two renderers instead of one HTML -> PDF pipeline:
 * ScolaPro renders documents in Vercel serverless Node functions. Those runtimes
 * have no headless Chromium/Playwright binary and no fragile remote print
 * service is permitted, so a "render the print-ready HTML to PDF" path is not
 * available. PDF generation therefore uses the pure-JS `pdf-lib` renderer.
 *
 * Because the two renderers are physically different, everything that can
 * diverge is centralised here and consumed by both:
 *  - page geometry (A3 landscape points), margin, learners-per-page, weeks-per-panel;
 *  - complete column grid (`identityColumns`/`termColumns` + `registerTeacherColumnPlan`);
 *  - column headers and the attendance legend entries;
 *  - document context/title/summary (`registerTeacherDocumentContext`);
 *  - pagination (`registerTeacherPageJobs`) and totals helpers.
 * The HTML renderer converts the shared point widths to table-column percentages
 * against `REGISTER_TEACHER_CONTENT_WIDTH`; the PDF renderer draws the same
 * widths directly. Rendered-output tests assert the two stay in step.
 */

export type RegisterTeacherColumnAlign = "left" | "center";
export type RegisterTeacherColumnTone = "plain" | "purple" | "red" | "green";

/**
 * CSS px per PDF point at the 96 dpi reference the preview is authored in.
 * The preview is the approved visual target, so its measurements are stored here
 * in physical points and converted back to the exact px values the browser uses.
 */
export const REGISTER_TEACHER_PX_PER_POINT = 96 / 72;

export function registerTeacherCssPx(points: number) {
  return Number((points * REGISTER_TEACHER_PX_PER_POINT).toFixed(4));
}

export const REGISTER_TEACHER_LAYOUT = Object.freeze({
  pageWidth: 1190.55,
  pageHeight: 841.89,
  margin: 32,
  learnersPerPage: 40,
  weeksPerPanel: 3,
  // Vertical rhythm in PDF points, authored from the approved preview (19px,
  // 21pt, 20pt, 18pt at the 96 dpi CSS reference). The HTML renderer converts
  // these back to px and the PDF draws them directly, so row pitch, legend band
  // and metadata band cannot drift between the preview and the downloaded PDF.
  // Without this the PDF used a 13pt row pitch against the preview's 14.25pt,
  // which accumulated to a 50pt (17.6mm) divergence over a full 40-learner page.
  rowHeight: 14.25,
  tableHeaderTop: 18,
  tableHeaderBottom: 18,
  legendHeight: 21,
  metadataHeight: 20,
  // Minimum grid band reserved for the rotated closure label when a section has
  // too few learners to give the label a useful height of its own.
  sparseClosureBandHeight: 28,
  // Complete column geometry in PDF points. HTML converts these to table-column
  // percentages against the same content width, so both renderers draw the same
  // column grid. Widths are physical points, not independently chosen CSS.
  identityColumns: Object.freeze([
    Object.freeze({ key: "admissionNumber", header: "ADMIN NO.", className: "admin", width: 50, align: "center" as RegisterTeacherColumnAlign }),
    Object.freeze({ key: "number", header: "NO.", className: "no", width: 24, align: "center" as RegisterTeacherColumnAlign }),
    Object.freeze({ key: "surname", header: "SURNAME", className: "surname", width: 112, align: "left" as RegisterTeacherColumnAlign }),
    Object.freeze({ key: "givenNames", header: "GIVEN NAMES", className: "given", width: 112, align: "left" as RegisterTeacherColumnAlign }),
    Object.freeze({ key: "dateOfBirth", header: "DATE OF BIRTH", className: "dob", width: 52, align: "center" as RegisterTeacherColumnAlign }),
  ]),
  termColumns: Object.freeze([
    Object.freeze({ key: "attended", header: "ATTEND.", className: "term-actual", width: 42, tone: "purple" as RegisterTeacherColumnTone }),
    Object.freeze({ key: "absent", header: "ABSENT", className: "term-absent", width: 42, tone: "red" as RegisterTeacherColumnTone }),
    Object.freeze({ key: "days", header: "DAYS", className: "term-days", width: 42, tone: "green" as RegisterTeacherColumnTone }),
  ]),
  legend: Object.freeze([
    Object.freeze({ mark: "I", label: "Present", reasoned: false }),
    Object.freeze({ mark: "a", label: "Absent", reasoned: false }),
    Object.freeze({ mark: "a", label: "Absent with reason", reasoned: true }),
    Object.freeze({ mark: null, label: "Grey = non-teaching / inactive; governed holiday or closure name appears in the attendance area", reasoned: false }),
  ]),
});

export const REGISTER_TEACHER_CONTENT_WIDTH = REGISTER_TEACHER_LAYOUT.pageWidth - REGISTER_TEACHER_LAYOUT.margin * 2;

/**
 * Shared print/PDF page rule. The PDF renderer content box is
 * `pageWidth - margin * 2`, so the printed preview must use the same physical
 * margin or the two sheets cannot be compared edge to edge.
 */
export const REGISTER_TEACHER_PRINT_PAGE_RULE = `@page { size: A3 landscape; margin: ${REGISTER_TEACHER_LAYOUT.margin}pt; }`;

/**
 * Single governed compaction for a closed-day reason, consumed by both
 * renderers so the holiday/closure name printed in the attendance area matches
 * the preview exactly.
 */
export function registerTeacherClosureLabel(reason: string | null | undefined) {
  if (!reason) return "Non-teaching day";
  const compacted = reason
    .replace(/^school holiday\s*[-:]\s*/i, "")
    .replace(/^public holiday\s*[-:]\s*/i, "")
    .replace(/^holiday\s*[-:]\s*/i, "")
    .trim();
  return compacted || "Non-teaching day";
}

/**
 * Smallest size at which a rotated closure label is still considered readable
 * inside its own date column. If even a single line at this size cannot fit the
 * band, the full governed name moves to the indexed closure-note continuation
 * band instead of being shrunk to microscopic text.
 */
export const REGISTER_TEACHER_CLOSURE_READABLE_SIZE = 3.4;
/** Smallest size the PDF wrapped fallback will ever shrink a label to. */
export const REGISTER_TEACHER_CLOSURE_MIN_SIZE = 2.6;
const REGISTER_TEACHER_CLOSURE_LINE_PITCH = 1.2;
/**
 * Strict upper bound on a single bold glyph advance at 1pt (Helvetica-Bold 'W'
 * is ~0.944em). Combined with the wrapped-line bound in
 * `registerTeacherClosureNeedsContinuation` it makes the HTML and PDF renderers
 * reach the *same* verdict about whether a governed name still fits readably,
 * without the browser needing PDF font metrics.
 */
const REGISTER_TEACHER_CLOSURE_GLYPH_ADVANCE = 1;

/**
 * Single governed decision, shared by both renderers, for whether a closure name
 * can still be read inside its date column. It is deliberately conservative: it
 * over-estimates the drawn width so a name is never sent to the in-column path
 * when the PDF would actually have to shrink or clip it. When it returns true,
 * the full name is guaranteed to appear in the closure-note continuation band.
 */
export function registerTeacherClosureNeedsContinuation(input: {
  label: string;
  availableHeight: number;
  columnWidth: number;
}): boolean {
  const { label, availableHeight, columnWidth } = input;
  const widthAt = (size: number) => label.length * REGISTER_TEACHER_CLOSURE_GLYPH_ADVANCE * size;
  // A single rotated line at the minimum readable size still fits the band, so
  // the label stays inside its date column exactly as before.
  if (widthAt(REGISTER_TEACHER_CLOSURE_READABLE_SIZE) <= availableHeight) return false;
  const size = REGISTER_TEACHER_CLOSURE_MIN_SIZE;
  const pitch = size * REGISTER_TEACHER_CLOSURE_LINE_PITCH;
  const maxLines = Math.max(1, Math.floor(Math.max(6, columnWidth - 4) / pitch));
  const words = label.split(/\s+/).filter(Boolean);
  const longestWord = words.reduce((max, word) => Math.max(max, word.length), 0);
  const maxWordWidth = longestWord * REGISTER_TEACHER_CLOSURE_GLYPH_ADVANCE * size;
  // Conservative upper bound on the number of wrapped lines the PDF fallback
  // would need: when every word fits on a line the greedy wrapper wastes at most
  // one word per break, otherwise long words are hard-split by character.
  const lines = availableHeight > maxWordWidth
    ? Math.ceil(widthAt(size) / (availableHeight - maxWordWidth)) + 1
    : words.length + Math.ceil(widthAt(size) / Math.max(1, availableHeight));
  return lines > maxLines;
}

export type RegisterTeacherClosureNote = {
  date: string;
  /** Complete governed closure name (shared compaction, never truncated). */
  label: string;
  /** True when the full name only fits in the continuation band, not in-column. */
  continuation: boolean;
  /** 1-based band index linking the note to its marked date column, else null. */
  index: number | null;
};

/**
 * Single closure-note plan for one page panel, consumed by both renderers. One
 * entry is returned per closed day, in date order, so the HTML and PDF
 * continuation bands always carry the same indexed full governed names.
 */
export function registerTeacherClosureNotes(
  weeks: readonly RegisterTeacherWeek[],
  rowCount: number,
): RegisterTeacherClosureNote[] {
  const plan = registerTeacherColumnPlan(weeks);
  const bandHeight = Math.max(rowCount * REGISTER_TEACHER_LAYOUT.rowHeight, REGISTER_TEACHER_LAYOUT.sparseClosureBandHeight);
  const availableHeight = Math.max(4, bandHeight - 4);
  let nextIndex = 0;
  return weeks.flatMap((week) => week.dates
    .filter((day) => !day.teaching)
    .map((day) => {
      const label = registerTeacherClosureLabel(day.reason);
      const continuation = registerTeacherClosureNeedsContinuation({ label, availableHeight, columnWidth: plan.dayWidth });
      return { date: day.date, label, continuation, index: continuation ? (nextIndex += 1) : null };
    }));
}

/**
 * Shared column plan consumed by both the HTML and PDF renderers. Day columns
 * absorb the width left after the fixed identity and term columns. Returning
 * both point widths (PDF) and fractions (HTML) keeps the physical grid
 * identical without duplicating geometry rules per renderer.
 */
export function registerTeacherColumnPlan(weeks: readonly RegisterTeacherWeek[]) {
  const attendanceColumns = weeks.reduce((count, week) => count + week.dates.length + 1, 0);
  const identityWidths = REGISTER_TEACHER_LAYOUT.identityColumns.map((column) => column.width);
  const termWidths = REGISTER_TEACHER_LAYOUT.termColumns.map((column) => column.width);
  const identityWidth = identityWidths.reduce((sum, width) => sum + width, 0);
  const termWidth = termWidths.reduce((sum, width) => sum + width, 0);
  const dayWidth = (REGISTER_TEACHER_CONTENT_WIDTH - identityWidth - termWidth) / Math.max(1, attendanceColumns);
  const toFraction = (width: number) => width / REGISTER_TEACHER_CONTENT_WIDTH;
  return {
    contentWidth: REGISTER_TEACHER_CONTENT_WIDTH,
    attendanceColumns,
    dayWidth,
    identityWidths,
    termWidths,
    identityFractions: identityWidths.map(toFraction),
    dayFraction: toFraction(dayWidth),
    termFractions: termWidths.map(toFraction),
  };
}

export type RegisterTeacherSummaryKind = "attendance" | "absence" | "possible";

export function formatRegisterTeacherDate(value: string) {
  return new Intl.DateTimeFormat("en-NA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export function registerTeacherDocumentContext(document: RegisterTeacherDocument) {
  const title = document.mode === "week"
    ? "WEEKLY REGISTER"
    : document.mode === "range"
      ? "WEEK RANGE REGISTER"
      : "TERM REGISTER";
  const summary = document.mode === "week"
    ? `Week ending ${formatRegisterTeacherDate(document.scopeEnd)}`
    : `${formatRegisterTeacherDate(document.scopeStart)} - ${formatRegisterTeacherDate(document.scopeEnd)}`;
  return {
    title,
    primaryContext: `${document.gradeName} · ${document.className} · ${document.academicYear}`,
    secondaryContext: document.termName,
    summary,
  };
}

export function registerTeacherPageJobs(document: RegisterTeacherDocument) {
  return document.sections.flatMap((section) => {
    const weekPanels = document.weeks.length > REGISTER_TEACHER_LAYOUT.weeksPerPanel
      ? Array.from(
        { length: Math.ceil(document.weeks.length / REGISTER_TEACHER_LAYOUT.weeksPerPanel) },
        (_, index) => document.weeks.slice(
          index * REGISTER_TEACHER_LAYOUT.weeksPerPanel,
          (index + 1) * REGISTER_TEACHER_LAYOUT.weeksPerPanel,
        ),
      )
      : [document.weeks];
    const learnerChunks = section.learners.length
      ? Array.from(
        { length: Math.ceil(section.learners.length / REGISTER_TEACHER_LAYOUT.learnersPerPage) },
        (_, index) => section.learners.slice(
          index * REGISTER_TEACHER_LAYOUT.learnersPerPage,
          (index + 1) * REGISTER_TEACHER_LAYOUT.learnersPerPage,
        ),
      )
      : [[]];
    const sectionJobs = weekPanels.flatMap((weeks) => learnerChunks.map((learners) => ({ weeks, learners })));
    return sectionJobs.map((job, index) => ({
      section,
      weeks: job.weeks,
      learners: job.learners,
      pageNumber: index + 1,
      pageCount: sectionJobs.length,
    }));
  });
}

export function registerTeacherValuesFor(
  section: RegisterTeacherSection,
  week: RegisterTeacherWeek,
  kind: RegisterTeacherSummaryKind,
) {
  const byDate = kind === "attendance"
    ? section.attendanceByDate
    : kind === "absence"
      ? section.absenceByDate
      : section.possibleByDate;
  return week.dates.map((day) => day.teaching ? byDate[day.date] ?? 0 : null);
}

export function registerTeacherTermValue(
  section: RegisterTeacherSection,
  kind: RegisterTeacherSummaryKind,
) {
  return kind === "attendance"
    ? section.termAttendanceTotal
    : kind === "absence"
      ? section.termAbsenceTotal
      : section.termPossibleTotal;
}

export function registerTeacherBalance(section: RegisterTeacherSection) {
  const accounted = section.termAttendanceTotal + section.termAbsenceTotal;
  return {
    attendance: section.termAttendanceTotal,
    absence: section.termAbsenceTotal,
    possible: section.termPossibleTotal,
    accounted,
    balanced: accounted === section.termPossibleTotal,
  };
}

export function registerTeacherGovernanceAlert(document: RegisterTeacherDocument) {
  const { invalidSubmissionCount, invalidSubmissionDates } = document.governanceAlerts;
  if (!invalidSubmissionCount) return null;
  return `${invalidSubmissionCount} non-teaching submission${invalidSubmissionCount === 1 ? "" : "s"} excluded from official totals (${invalidSubmissionDates.join(", ")})`;
}

export function assertRegisterTeacherDocumentTotals(document: RegisterTeacherDocument) {
  for (const section of document.sections) {
    for (const week of document.weeks) {
      for (const day of week.dates) {
        const expectedAttendance = section.learners.filter((learner) => learner.marks[day.date] === "I").length;
        const expectedAbsence = section.learners.filter((learner) => learner.marks[day.date] === "a").length;
        const expectedPossible = expectedAttendance + expectedAbsence;
        if (
          section.attendanceByDate[day.date] !== expectedAttendance
          || section.absenceByDate[day.date] !== expectedAbsence
          || section.possibleByDate[day.date] !== expectedPossible
        ) {
          throw new Error("Register teacher daily totals failed source-evidence verification.");
        }
      }
    }
    const expectedTermAttendance = section.learners.reduce((sum, learner) => sum + learner.termAttended, 0);
    const expectedTermAbsence = section.learners.reduce((sum, learner) => sum + learner.termAbsent, 0);
    const expectedTermPossible = section.learners.reduce((sum, learner) => sum + learner.termDays, 0);
    if (
      section.termAttendanceTotal !== expectedTermAttendance
      || section.termAbsenceTotal !== expectedTermAbsence
      || section.termPossibleTotal !== expectedTermPossible
      || expectedTermAttendance + expectedTermAbsence !== expectedTermPossible
    ) {
      throw new Error("Register teacher term totals failed source-evidence verification.");
    }
  }
}
