import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TeachingWorkspaceOverview = {
  allocations: number;
  pacingPlans: number;
  scheduledLessons: number;
  preparedLessons: number;
};

export type AssessmentWorkspaceOverview = {
  schemes: number;
  assessmentInstances: number;
  openInstances: number;
  submittedInstances: number;
};

export async function getTeachingWorkspaceOverview(schoolId: string, academicYear: number): Promise<TeachingWorkspaceOverview> {
  const supabase = await createSupabaseServerClient();
  const [allocations, pacingPlans, scheduledLessons, preparedLessons] = await Promise.all([
    supabase.from("teacher_allocations").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("academic_year", academicYear),
    supabase.from("pacing_plans").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("academic_year", academicYear).in("status", ["draft", "active"]),
    supabase.from("teaching_schedule_items").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("academic_year", academicYear).in("status", ["planned", "prepared"]),
    supabase.from("lesson_preparations").select("id", { count: "exact", head: true }).eq("school_id", schoolId).in("status", ["prepared", "submitted", "reviewed"]),
  ]);
  if (allocations.error || pacingPlans.error || scheduledLessons.error || preparedLessons.error) throw new Error("Unable to load the teaching workspace.");
  return {
    allocations: allocations.count ?? 0,
    pacingPlans: pacingPlans.count ?? 0,
    scheduledLessons: scheduledLessons.count ?? 0,
    preparedLessons: preparedLessons.count ?? 0,
  };
}

export async function getAssessmentWorkspaceOverview(schoolId: string, academicYear: number): Promise<AssessmentWorkspaceOverview> {
  const supabase = await createSupabaseServerClient();
  const [schemes, instances, openInstances, submittedInstances] = await Promise.all([
    supabase.from("assessment_schemes").select("id", { count: "exact", head: true }).eq("school_id", schoolId).in("status", ["draft", "active"]),
    supabase.from("assessment_instances").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("academic_year", academicYear),
    supabase.from("assessment_instances").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("academic_year", academicYear).eq("status", "open"),
    supabase.from("assessment_instances").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("academic_year", academicYear).in("status", ["submitted", "review", "returned"]),
  ]);
  if (schemes.error || instances.error || openInstances.error || submittedInstances.error) throw new Error("Unable to load the assessment workspace.");
  return {
    schemes: schemes.count ?? 0,
    assessmentInstances: instances.count ?? 0,
    openInstances: openInstances.count ?? 0,
    submittedInstances: submittedInstances.count ?? 0,
  };
}
