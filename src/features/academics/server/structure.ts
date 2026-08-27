import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getSchoolStructure(schoolId: string, academicYear: number) {
  const supabase = await createSupabaseServerClient();
  const [{ data: grades, error: gradeError }, { data: classes, error: classError }] = await Promise.all([
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

  if (gradeError || classError) throw new Error("Unable to load school academic structure.");

  return {
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
