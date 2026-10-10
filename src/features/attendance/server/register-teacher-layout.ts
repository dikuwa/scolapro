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

export const REGISTER_TEACHER_LAYOUT = Object.freeze({
  pageWidth: 1190.55,
  pageHeight: 841.89,
  margin: 32,
  learnersPerPage: 40,
  weeksPerPanel: 3,
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
