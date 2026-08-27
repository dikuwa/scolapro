import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LearnerListItem = {
  id: string;
  name: string;
  preferredName: string | null;
  admissionNumber: string | null;
  grade: string;
  registerClass: string;
  status: string;
};

export type LearnerOverview = LearnerListItem & {
  firstNames: string;
  surname: string;
  dateOfBirth: string | null;
  academicYear: number;
  enrolledFrom: string;
  schoolName: string;
};

export async function listLearnersForSchool(schoolId: string, academicYear: number): Promise<LearnerListItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("enrolments")
    .select(
      "id, admission_number, status, learners!inner(id, first_names, surname, preferred_name), grades(display_name), register_classes(display_name)",
    )
    .eq("school_id", schoolId)
    .eq("academic_year", academicYear)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Unable to load learners for this school.");
  }

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

export async function getLearnerOverview(learnerId: string, schoolId: string): Promise<LearnerOverview | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("enrolments")
    .select(
      "admission_number, status, academic_year, enrolled_from, learners!inner(id, first_names, surname, preferred_name, date_of_birth), grades(display_name), register_classes(display_name), schools!inner(name)",
    )
    .eq("learner_id", learnerId)
    .eq("school_id", schoolId)
    .order("academic_year", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to load this learner.");
  }

  if (!data) return null;

  const learner = Array.isArray(data.learners) ? data.learners[0] : data.learners;
  const grade = Array.isArray(data.grades) ? data.grades[0] : data.grades;
  const registerClass = Array.isArray(data.register_classes) ? data.register_classes[0] : data.register_classes;
  const school = Array.isArray(data.schools) ? data.schools[0] : data.schools;

  return {
    id: learner.id,
    name: `${learner.first_names} ${learner.surname}`.trim(),
    preferredName: learner.preferred_name,
    firstNames: learner.first_names,
    surname: learner.surname,
    admissionNumber: data.admission_number,
    grade: grade?.display_name ?? "Unassigned",
    registerClass: registerClass?.display_name ?? "Unassigned",
    status: data.status,
    dateOfBirth: learner.date_of_birth,
    academicYear: data.academic_year,
    enrolledFrom: data.enrolled_from,
    schoolName: school.name,
  };
}
