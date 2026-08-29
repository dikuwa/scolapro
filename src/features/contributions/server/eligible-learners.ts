import { listLearnersForSchool, type LearnerListItem } from "@/features/learners/server/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function listContributionEligibleLearners(
  schoolId: string,
  academicYear: number,
  roleKey: string,
): Promise<LearnerListItem[]> {
  if (roleKey !== "class_teacher") return listLearnersForSchool(schoolId, academicYear);

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return [];

  const { data: staff } = await supabase
    .from("staff_members")
    .select("id")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (!staff?.id) return [];

  const { data: classes } = await supabase
    .from("register_classes")
    .select("id")
    .eq("school_id", schoolId)
    .eq("academic_year", academicYear)
    .eq("register_teacher_staff_id", staff.id);
  const classIds = (classes ?? []).map((row) => row.id);
  if (!classIds.length) return [];

  const { data, error } = await supabase
    .from("enrolments")
    .select("admission_number, status, learners!inner(id, first_names, surname, preferred_name), grades(display_name), register_classes(display_name)")
    .eq("school_id", schoolId)
    .eq("academic_year", academicYear)
    .eq("status", "current")
    .in("register_class_id", classIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Unable to load learners assigned to this class teacher.");

  return (data ?? []).map((row) => {
    const learner = Array.isArray(row.learners) ? row.learners[0] : row.learners;
    const grade = Array.isArray(row.grades) ? row.grades[0] : row.grades;
    const registerClass = Array.isArray(row.register_classes) ? row.register_classes[0] : row.register_classes;
    return {
      id: learner.id,
      name: `${learner.first_names} ${learner.surname}`.trim(),
      preferredName: learner.preferred_name,
      admissionNumber: row.admission_number,
      grade: grade?.display_name ?? "Unassigned",
      registerClass: registerClass?.display_name ?? "Unassigned",
      status: row.status,
    };
  });
}
