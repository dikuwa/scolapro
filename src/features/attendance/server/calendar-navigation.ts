import { createSupabaseServerClient } from "@/lib/supabase/server";
import { attendanceWeekday, shiftAttendanceDate } from "@/features/attendance/attendance-navigation";
import {
  learnerCalendarRestriction,
  resolveAttendanceDayDecision,
  type AttendanceDayKind,
  type LearnerTermWindow,
} from "@/features/attendance/server/learner-calendar-bounds";

export type AttendanceCalendarDayState = {
  kind: AttendanceDayKind;
  reason: string | null;
  eligible: boolean;
};

export type AttendanceCalendarNavigation = {
  minDate: string;
  maxDate: string;
  dayStates: Record<string, AttendanceCalendarDayState>;
};

type ImpactRow = { target_date: unknown; teaching_impact: unknown };
type OverrideRow = {
  school_date: string;
  is_school_day: boolean;
  teaching_impact: string | null;
  reason: string | null;
};

export async function getAttendanceCalendarNavigation(
  schoolId: string,
  academicYear: number,
): Promise<AttendanceCalendarNavigation> {
  const minDate = `${academicYear}-01-01`;
  const maxDate = `${academicYear}-12-31`;
  const supabase = await createSupabaseServerClient();
  const [impactResult, termResult, overrideResult] = await Promise.all([
    supabase.rpc("resolve_school_teaching_impact_range", {
      p_school_id: schoolId,
      p_from: minDate,
      p_to: maxDate,
    }),
    supabase.rpc("list_academic_term_calendar_summary", {
      p_school_id: schoolId,
      p_academic_year: academicYear,
    }),
    supabase
      .from("school_day_overrides")
      .select("school_date,is_school_day,teaching_impact,reason")
      .eq("school_id", schoolId)
      .gte("school_date", minDate)
      .lte("school_date", maxDate),
  ]);

  const terms = termResult.error ? [] : (termResult.data ?? []) as LearnerTermWindow[];
  const termCalendarVerified = !termResult.error;
  const impactByDate = new Map(
    ((impactResult.data ?? []) as ImpactRow[]).flatMap((row) => {
      const date = typeof row.target_date === "string" ? row.target_date.slice(0, 10) : "";
      const impact = typeof row.teaching_impact === "string" ? row.teaching_impact : "";
      return date && impact ? [[date, impact] as const] : [];
    }),
  );
  const overrideByDate = new Map(
    ((overrideResult.data ?? []) as OverrideRow[]).map((row) => [String(row.school_date).slice(0, 10), row] as const),
  );
  const dayStates: Record<string, AttendanceCalendarDayState> = {};

  for (let date = minDate; date <= maxDate; date = shiftAttendanceDate(date, 1)) {
    const override = overrideByDate.get(date);
    const restriction = termCalendarVerified ? learnerCalendarRestriction(date, terms) : null;
    if (!override && restriction) {
      dayStates[date] = { kind: "out_of_term", reason: restriction, eligible: false };
      continue;
    }
    if (!override && (attendanceWeekday(date) === 0 || attendanceWeekday(date) === 6)) {
      dayStates[date] = { kind: "in_term_non_teaching", reason: "Weekend", eligible: false };
      continue;
    }
    dayStates[date] = resolveAttendanceDayDecision({
      date,
      terms,
      termCalendarVerified,
      resolvedImpact: impactResult.error ? null : impactByDate.get(date) ?? null,
      resolverAvailable: !impactResult.error,
      override: overrideResult.error || !override ? null : {
        isSchoolDay: override.is_school_day,
        teachingImpact: override.teaching_impact,
        reason: override.reason,
      },
    });
  }

  return { minDate, maxDate, dayStates };
}
