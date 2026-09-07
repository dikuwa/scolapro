import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getNamibiaDateKey } from "@/lib/namibia-date";

export type BellScheduleSummary = {
  id: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  weekdays: number[];
};

export type TodayTimetableContext = {
  date: string;
  teachingImpact: "NORMAL" | "NO_TEACHING" | "PARTIAL_DAY" | "ALTERED_TIMETABLE" | "EXAM_TIMETABLE";
  timetableDay: number | null;
  bellScheduleId: string | null;
  bellScheduleName: string | null;
  periods: { id: string; number: number; name: string; startsAt: string | null; endsAt: string | null }[];
};

export async function getBellSchedules(schoolId: string, academicYear: number): Promise<BellScheduleSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("timetable_bell_schedules")
    .select("id,display_name,effective_from,effective_to,applies_to_weekdays")
    .eq("school_id", schoolId)
    .eq("academic_year", academicYear)
    .order("effective_from", { ascending: false });
  if (error) throw new Error("Unable to load bell schedules.");
  return (data ?? []).map((item) => ({
    id: item.id,
    name: item.display_name,
    effectiveFrom: item.effective_from,
    effectiveTo: item.effective_to,
    weekdays: item.applies_to_weekdays ?? [],
  }));
}

export async function getTodayTimetableContext(schoolId: string, academicYear: number): Promise<TodayTimetableContext> {
  const supabase = await createSupabaseServerClient();
  const date = getNamibiaDateKey();
  const [impactResult, dayResult, periodResult] = await Promise.all([
    supabase.rpc("resolve_school_teaching_impact", { p_school_id: schoolId, p_target_date: date }),
    supabase.rpc("resolve_timetable_day", { p_school_id: schoolId, p_academic_year: academicYear, p_target_date: date }),
    supabase.rpc("resolve_timetable_bell_periods", { p_school_id: schoolId, p_academic_year: academicYear, p_target_date: date }),
  ]);
  if (impactResult.error || dayResult.error || periodResult.error) throw new Error("Unable to resolve today's timetable context.");
  const rows = periodResult.data ?? [];
  const first = rows[0] ?? null;
  return {
    date,
    teachingImpact: (impactResult.data ?? "NORMAL") as TodayTimetableContext["teachingImpact"],
    timetableDay: dayResult.data ?? null,
    bellScheduleId: first?.bell_schedule_id ?? null,
    bellScheduleName: first?.bell_schedule_name ?? null,
    periods: rows.map((item) => ({ id: item.period_id, number: item.period_number, name: item.display_name, startsAt: item.starts_at, endsAt: item.ends_at })),
  };
}
