import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DashboardOverview = {
  currentLearners: number;
  gradeCount: number;
  registerClassCount: number;
};

export async function getDashboardOverview(
  schoolId: string,
  academicYear: number,
): Promise<DashboardOverview> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_school_dashboard_overview", {
    p_school_id: schoolId,
    p_academic_year: academicYear,
  });

  if (error) throw new Error("Unable to load the school overview.");

  const row = ((data ?? [])[0] ?? null) as {
    current_learners: number | string | null;
    grade_count: number | string | null;
    register_class_count: number | string | null;
  } | null;

  return {
    currentLearners: Number(row?.current_learners ?? 0),
    gradeCount: Number(row?.grade_count ?? 0),
    registerClassCount: Number(row?.register_class_count ?? 0),
  };
}
