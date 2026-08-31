import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LearnerListItem = {
  id: string;
  name: string;
  preferredName: string | null;
  admissionNumber: string | null;
  grade: string;
  registerClass: string;
  status: string;
  sex?: string;
};

export type LearnerDirectoryFilters = {
  query?: string;
  status?: string;
  grade?: string;
  registerClass?: string;
  sex?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type LearnerDirectoryPage = {
  learners: LearnerListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type LearnerOverview = LearnerListItem & {
  firstNames: string;
  surname: string;
  dateOfBirth: string | null;
  academicYear: number;
  enrolledFrom: string;
  schoolName: string;
  photoPath: string | null;
  photoUrl: string | null;
};

type LearnerDirectoryRpcRow = {
  enrolment_id: string;
  learner_id: string;
  first_names: string;
  surname: string;
  preferred_name: string | null;
  admission_number: string | null;
  grade_name: string;
  class_name: string;
  enrolment_status: string;
  sex: string | null;
  total_count: number | string;
};

export async function listLearnersForSchool(
  schoolId: string,
  academicYear: number,
  filters: LearnerDirectoryFilters = {},
): Promise<LearnerDirectoryPage> {
  const pageSize = Math.min(Math.max(filters.pageSize ?? 50, 1), 100);
  const requestedPage = Math.max(filters.page ?? 1, 1);
  const numericRowQuery = /^\d+$/.test(filters.query?.trim() ?? "") ? Number(filters.query) : null;
  const page = numericRowQuery && numericRowQuery > 0 ? Math.ceil(numericRowQuery / pageSize) : requestedPage;
  const query = numericRowQuery ? null : filters.query?.trim() || null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_learner_directory_page", {
    p_school_id: schoolId,
    p_academic_year: academicYear,
    p_query: query,
    p_status: filters.status && filters.status !== "all" ? filters.status : null,
    p_grade_name: filters.grade && filters.grade !== "all" ? filters.grade : null,
    p_class_name: filters.registerClass && filters.registerClass !== "all" ? filters.registerClass : null,
    p_sex: filters.sex && filters.sex !== "all" ? filters.sex : null,
    p_sort_desc: filters.sortOrder === "desc",
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) throw new Error("Unable to load learners for this school.");
  const rows = (data ?? []) as LearnerDirectoryRpcRow[];
  const total = rows.length ? Number(rows[0].total_count) : 0;

  return {
    learners: rows.map((row) => ({
      id: row.learner_id,
      name: `${row.first_names} ${row.surname}`.trim(),
      preferredName: row.preferred_name,
      admissionNumber: row.admission_number,
      grade: row.grade_name,
      registerClass: row.class_name,
      status: row.enrolment_status,
      sex: row.sex ?? "unspecified",
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getLearnerOverview(learnerId: string, schoolId: string): Promise<LearnerOverview | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("enrolments")
    .select(
      "admission_number, status, academic_year, enrolled_from, learners!inner(id, first_names, surname, preferred_name, date_of_birth, photo_path, sex), grades(display_name), register_classes(display_name), schools!inner(name)",
    )
    .eq("learner_id", learnerId)
    .eq("school_id", schoolId)
    .order("academic_year", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("Unable to load this learner.");
  if (!data) return null;

  const learner = Array.isArray(data.learners) ? data.learners[0] : data.learners;
  const grade = Array.isArray(data.grades) ? data.grades[0] : data.grades;
  const registerClass = Array.isArray(data.register_classes) ? data.register_classes[0] : data.register_classes;
  const school = Array.isArray(data.schools) ? data.schools[0] : data.schools;
  let photoUrl: string | null = null;
  if (learner.photo_path) {
    const { data: signed } = await supabase.storage.from("learner-photos").createSignedUrl(learner.photo_path, 60 * 60);
    photoUrl = signed?.signedUrl ?? null;
  }

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
    sex: learner.sex ?? "unspecified",
    dateOfBirth: learner.date_of_birth,
    academicYear: data.academic_year,
    enrolledFrom: data.enrolled_from,
    schoolName: school.name,
    photoPath: learner.photo_path,
    photoUrl,
  };
}