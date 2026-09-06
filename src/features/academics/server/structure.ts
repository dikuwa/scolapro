import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getSchoolStructure(schoolId: string, academicYear: number) {
  const supabase = await createSupabaseServerClient();
  const [
    { data: school, error: schoolError },
    { data: anchor, error: anchorError },
    { data: grades, error: gradeError },
    { data: classes, error: classError },
  ] = await Promise.all([
    supabase
      .from("schools")
      .select("timetable_cycle_mode,timetable_cycle_length")
      .eq("id", schoolId)
      .single(),
    supabase
      .from("timetable_cycle_anchors")
      .select("anchor_date,anchor_day")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .maybeSingle(),
    supabase
      .from("grades")
      .select("id,grade_code,display_name")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .order("grade_code"),
    supabase
      .from("register_classes")
      .select("id,class_code,display_name,grade_id")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .order("class_code"),
  ]);

  if (schoolError || anchorError || gradeError || classError) throw new Error("Unable to load school academic structure.");

  return {
    timetableCycleMode: school?.timetable_cycle_mode === "rotating" ? "rotating" as const : "weekday" as const,
    timetableCycleLength: school?.timetable_cycle_length ?? 5,
    timetableCycleAnchorDate: anchor?.anchor_date ?? null,
    timetableCycleAnchorDay: anchor?.anchor_day ?? null,
    grades: (grades ?? []).map((grade) => ({
      id: grade.id,
      code: grade.grade_code,
      name: grade.display_name,
    })),
    classes: (classes ?? []).map((item) => ({
      id: item.id,
      code: item.class_code,
      name: item.display_name,
      gradeId: item.grade_id,
    })),
  };
}
