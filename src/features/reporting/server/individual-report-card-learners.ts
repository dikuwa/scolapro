import { createSupabaseServerClient } from "@/lib/supabase/server";

export type IndividualReportCardLearnerOption = {
  enrolmentId: string;
  label: string;
  helper: string;
};

export async function getIndividualReportCardLearnerOptions(schoolId: string, academicYear: number): Promise<IndividualReportCardLearnerOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("enrolments")
    .select("id,admission_number,learners!inner(first_names,surname),grades(display_name),register_classes(display_name)")
    .eq("school_id", schoolId)
    .eq("academic_year", academicYear)
    .eq("status", "current")
    .order("admission_number", { ascending: true })
    .limit(5000);

  if (error) throw new Error("Unable to load individual report-card learners.");

  return (data ?? [])
    .map((item) => {
      const learner = Array.isArray(item.learners) ? item.learners[0] : item.learners;
      const grade = Array.isArray(item.grades) ? item.grades[0] : item.grades;
      const registerClass = Array.isArray(item.register_classes) ? item.register_classes[0] : item.register_classes;
      const label = `${learner?.surname ?? ""}, ${learner?.first_names ?? ""}`.replace(/^,\s*/, "").trim();
      return {
        enrolmentId: item.id,
        label: label || "Learner",
        helper: `${item.admission_number ?? "No admission number"} · ${grade?.display_name ?? "No grade"} · ${registerClass?.display_name ?? "No class"}`,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "en"));
}
