import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BellScheduleSummary } from "@/features/timetable/server/bell-calendar";

export type TeachingImpactRow = {
  id: string;
  date: string;
  impact: string;
  reason: string | null;
  bellScheduleName: string | null;
};

export type LearnerCalendarEventRow = {
  id: string;
  scope: "national" | "school";
  title: string;
  category: string;
  startsOn: string;
  endsOn: string;
  startsAt: string | null;
  endsAt: string | null;
  audienceScope: string;
  audienceReferenceId: string | null;
  description: string | null;
  teachingImpact: string;
  bellScheduleName: string | null;
};

export type CalendarAudienceOption = {
  value: string;
  label: string;
  helper: string;
};

export async function getNationalLearnerCalendarEvents(academicYear: number) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("effective_learner_calendar_events")
    .select("id,event_scope,title,category,starts_on,ends_on,starts_at,ends_at,audience_scope,audience_reference_id,description,teaching_impact")
    .eq("event_scope", "national")
    .eq("academic_year", academicYear)
    .order("starts_on");
  if (error) throw new Error("Unable to load the national learner calendar.");
  return (data ?? []).map((item) => ({
    id: item.id,
    scope: "national" as const,
    title: item.title,
    category: item.category,
    startsOn: item.starts_on,
    endsOn: item.ends_on,
    startsAt: item.starts_at,
    endsAt: item.ends_at,
    audienceScope: item.audience_scope,
    audienceReferenceId: item.audience_reference_id,
    description: item.description,
    teachingImpact: item.teaching_impact,
    bellScheduleName: null,
  })) satisfies LearnerCalendarEventRow[];
}

export async function getTeachingImpactWorkspace(schoolId: string, academicYear: number) {
  const supabase = await createSupabaseServerClient();
  const [overrideResult, scheduleResult, eventResult, gradeResult, classResult, groupResult] = await Promise.all([
    supabase
      .from("school_day_overrides")
      .select("id,school_date,teaching_impact,reason,bell_schedule_id,timetable_bell_schedules(display_name)")
      .eq("school_id", schoolId)
      .gte("school_date", `${academicYear}-01-01`)
      .lte("school_date", `${academicYear}-12-31`)
      .order("school_date", { ascending: false })
      .limit(20),
    supabase
      .from("timetable_bell_schedules")
      .select("id,display_name,effective_from,effective_to,applies_to_weekdays")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .order("effective_from", { ascending: false }),
    supabase
      .from("effective_learner_calendar_events")
      .select("id,event_scope,title,category,starts_on,ends_on,starts_at,ends_at,audience_scope,audience_reference_id,description,teaching_impact,bell_schedule_id")
      .eq("academic_year", academicYear)
      .or(`event_scope.eq.national,school_id.eq.${schoolId}`)
      .order("starts_on", { ascending: true }),
    supabase.from("grades").select("id,display_name").eq("school_id", schoolId).eq("academic_year", academicYear).order("display_name"),
    supabase.from("register_classes").select("id,display_name").eq("school_id", schoolId).eq("academic_year", academicYear).order("display_name"),
    supabase.from("teaching_groups").select("id,name,code").eq("school_id", schoolId).eq("academic_year", academicYear).eq("status", "active").order("name"),
  ]);

  if (overrideResult.error || scheduleResult.error || eventResult.error || gradeResult.error || classResult.error || groupResult.error) {
    throw new Error("Unable to load learner-calendar data.");
  }

  const scheduleNameById = new Map((scheduleResult.data ?? []).map((item) => [item.id, item.display_name]));
  const audienceOptions: CalendarAudienceOption[] = [
    { value: "all_learners", label: "All learners", helper: "Whole-school learner calendar" },
    ...(gradeResult.data ?? []).map((item) => ({ value: `grade:${item.id}`, label: item.display_name, helper: "Grade" })),
    ...(classResult.data ?? []).map((item) => ({ value: `register_class:${item.id}`, label: item.display_name, helper: "Register class" })),
    ...(groupResult.data ?? []).map((item) => ({ value: `teaching_group:${item.id}`, label: item.name, helper: `Teaching Group · ${item.code}` })),
  ];

  return {
    overrides: (overrideResult.data ?? []).map((item) => ({
      id: item.id,
      date: item.school_date,
      impact: item.teaching_impact,
      reason: item.reason,
      bellScheduleName: (item.timetable_bell_schedules as { display_name?: string } | null)?.display_name ?? null,
    })) as TeachingImpactRow[],
    events: (eventResult.data ?? []).map((item) => ({
      id: item.id,
      scope: item.event_scope,
      title: item.title,
      category: item.category,
      startsOn: item.starts_on,
      endsOn: item.ends_on,
      startsAt: item.starts_at,
      endsAt: item.ends_at,
      audienceScope: item.audience_scope,
      audienceReferenceId: item.audience_reference_id,
      description: item.description,
      teachingImpact: item.teaching_impact,
      bellScheduleName: item.bell_schedule_id ? scheduleNameById.get(item.bell_schedule_id) ?? null : null,
    })) as LearnerCalendarEventRow[],
    schedules: (scheduleResult.data ?? []).map((item) => ({
      id: item.id,
      name: item.display_name,
      effectiveFrom: item.effective_from,
      effectiveTo: item.effective_to,
      weekdays: item.applies_to_weekdays ?? [],
    })) as BellScheduleSummary[],
    audienceOptions,
  };
}
