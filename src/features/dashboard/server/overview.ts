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

  const [learnersResult, gradesResult, classesResult] = await Promise.all([
    supabase
      .from("enrolments")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .eq("status", "current"),
    supabase
      .from("grades")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear),
    supabase
      .from("register_classes")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear),
  ]);

  if (learnersResult.error || gradesResult.error || classesResult.error) {
    throw new Error("Unable to load the school overview.");
  }

  return {
    currentLearners: learnersResult.count ?? 0,
    gradeCount: gradesResult.count ?? 0,
    registerClassCount: classesResult.count ?? 0,
  };
}
