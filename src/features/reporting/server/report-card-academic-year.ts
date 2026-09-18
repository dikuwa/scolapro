// Single source of truth for resolving a school's academic year.
//
// The resolver used to be implemented here. Teaching planning needs the same
// governed year, and copying the lookup would have created a second
// implementation of the same rule — the exact duplication the repository
// forbids. The canonical implementation now lives with the school calendar,
// which owns academic_years, and this module keeps its historical export so the
// report-card route is unchanged.
//
// Precedence (see the canonical implementation): the single activated year wins,
// otherwise the most recent configured year, otherwise the calendar year.
export { getGovernedAcademicYear as getReportCardAcademicYear } from "@/features/calendar/server/calendar";
