import { createSupabaseServerClient } from "@/lib/supabase/server";

export type GradeOption = {
  id: string;
  label: string;
  classes: Array<{ id: string; label: string }>;
};

export async function getRegistrationOptions(schoolId: string, academicYear: number): Promise<GradeOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("grades")
    .select("id, display_name, register_classes(id, display_name)")
    .eq("school_id", schoolId)
    .eq("academic_year", academicYear)
    .order("grade_code", { ascending: true });

  if (error) {
    throw new Error("Unable to load grade and class options.");
  }

  return (data ?? []).map((grade) => ({
    id: grade.id,
    label: grade.display_name,
    classes: (grade.register_classes ?? []).map((registerClass) => ({
      id: registerClass.id,
      label: registerClass.display_name,
    })),
  }));
}
