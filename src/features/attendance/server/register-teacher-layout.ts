import type {
  RegisterTeacherDocument,
  RegisterTeacherSection,
  RegisterTeacherWeek,
} from "@/features/attendance/server/register-teacher-document";

export const REGISTER_TEACHER_LAYOUT = Object.freeze({
  pageWidth: 1190.55,
  pageHeight: 841.89,
  margin: 32,
  learnersPerPage: 40,
  weeksPerPanel: 3,
});

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
