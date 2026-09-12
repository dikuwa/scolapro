import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LibraryTitle = {
  id: string;
  resourceType: string;
  title: string;
  author: string | null;
  publisher: string | null;
  isbn: string | null;
  subjectId: string | null;
  subjectCode: string | null;
  gradeId: string | null;
  gradeCode: string | null;
  edition: string | null;
  category: string | null;
  status: string;
};

export type LibraryCopy = {
  id: string;
  titleId: string;
  barcode: string | null;
  assetNumber: string | null;
  condition: string;
  availability: string;
  locationLabel: string | null;
  notes: string | null;
};

export type LibraryBorrower = {
  id: string;
  type: "learner" | "staff";
  name: string;
  helper: string;
  gradeId?: string | null;
  classId?: string | null;
};

export type LibraryLoan = {
  id: string;
  copyId: string;
  borrowerId: string;
  borrowerType: "learner" | "staff";
  borrowerName: string;
  issuedOn: string;
  dueOn: string | null;
  returnedOn: string | null;
  returnedCondition: string | null;
  status: string;
  notes: string | null;
  gradeId: string | null;
  classId: string | null;
};

export type LibrarySubject = { id: string; code: string; name: string; status: string };
export type LibraryGrade = { id: string; code: string; name: string; academicYear: number };
export type LibraryClass = { id: string; gradeId: string; code: string; name: string; academicYear: number };
export type LibraryLearner = {
  id: string;
  name: string;
  admissionNumber: string | null;
  gradeId: string | null;
  classId: string | null;
  gradeName: string;
  className: string;
};

type LearnerRow = {
  learner_id: string;
  admission_number: string | null;
  grade_id: string | null;
  register_class_id: string | null;
  first_names: string;
  surname: string;
};

type StaffBorrowerRow = {
  staff_member_id: string;
  first_name: string;
  last_name: string;
  employee_number: string | null;
};

export async function getLibraryWorkspace(schoolId: string, today: string) {
  const supabase = await createSupabaseServerClient();
  const [titlesResult, copiesResult, loansResult, learnersResult, staffResult, subjectsResult, gradesResult, classesResult] = await Promise.all([
    supabase
      .from("learning_resource_titles")
      .select("id,resource_type,title,author,publisher,isbn,subject_id,subject_code,grade_id,grade_code,edition,category,status")
      .eq("school_id", schoolId)
      .order("title"),
    supabase
      .from("learning_resource_copies")
      .select("id,title_id,barcode,asset_number,condition,availability,location_label,notes")
      .eq("school_id", schoolId)
      .order("created_at"),
    supabase
      .from("learning_resource_loans")
      .select("id,copy_id,learner_id,staff_member_id,issued_on,due_on,returned_on,returned_condition,status,notes")
      .eq("school_id", schoolId)
      .order("issued_on", { ascending: false }),
    supabase.rpc("list_learning_resource_learner_borrowers", { p_school_id: schoolId }),
    supabase.rpc("list_learning_resource_staff_borrowers", { p_school_id: schoolId }),
    supabase
      .from("subjects")
      .select("id,subject_code,display_name,status")
      .eq("school_id", schoolId)
      .order("display_name"),
    supabase
      .from("grades")
      .select("id,grade_code,display_name,academic_year")
      .eq("school_id", schoolId)
      .order("academic_year", { ascending: false })
      .order("display_name"),
    supabase
      .from("register_classes")
      .select("id,grade_id,class_code,display_name,academic_year")
      .eq("school_id", schoolId)
      .order("academic_year", { ascending: false })
      .order("display_name"),
  ]);

  const error = titlesResult.error
    ?? copiesResult.error
    ?? loansResult.error
    ?? learnersResult.error
    ?? staffResult.error
    ?? subjectsResult.error
    ?? gradesResult.error
    ?? classesResult.error;
  if (error) throw new Error("Unable to load Library / Textbooks.");

  const subjects: LibrarySubject[] = (subjectsResult.data ?? []).map((row) => ({
    id: row.id,
    code: row.subject_code,
    name: row.display_name,
    status: row.status,
  }));
  const grades: LibraryGrade[] = (gradesResult.data ?? []).map((row) => ({
    id: row.id,
    code: row.grade_code,
    name: row.display_name,
    academicYear: row.academic_year,
  }));
  const classes: LibraryClass[] = (classesResult.data ?? []).map((row) => ({
    id: row.id,
    gradeId: row.grade_id,
    code: row.class_code,
    name: row.display_name,
    academicYear: row.academic_year,
  }));
  const gradeMap = new Map(grades.map((grade) => [grade.id, grade]));
  const classMap = new Map(classes.map((item) => [item.id, item]));

  const titles: LibraryTitle[] = (titlesResult.data ?? []).map((row) => ({
    id: row.id,
    resourceType: row.resource_type,
    title: row.title,
    author: row.author,
    publisher: row.publisher,
    isbn: row.isbn,
    subjectId: row.subject_id,
    subjectCode: row.subject_code,
    gradeId: row.grade_id,
    gradeCode: row.grade_code,
    edition: row.edition,
    category: row.category,
    status: row.status,
  }));

  const copies: LibraryCopy[] = (copiesResult.data ?? []).map((row) => ({
    id: row.id,
    titleId: row.title_id,
    barcode: row.barcode,
    assetNumber: row.asset_number,
    condition: row.condition,
    availability: row.availability,
    locationLabel: row.location_label,
    notes: row.notes,
  }));

  const learnerMap = new Map<string, LibraryLearner>();
  const learners: LibraryLearner[] = [];
  for (const row of (learnersResult.data ?? []) as LearnerRow[]) {
    if (learnerMap.has(row.learner_id)) continue;
    const name = `${row.first_names} ${row.surname}`.trim();
    const grade = row.grade_id ? gradeMap.get(row.grade_id) : null;
    const registerClass = row.register_class_id ? classMap.get(row.register_class_id) : null;
    const item: LibraryLearner = {
      id: row.learner_id,
      name,
      admissionNumber: row.admission_number,
      gradeId: row.grade_id,
      classId: row.register_class_id,
      gradeName: grade?.name ?? "Unassigned",
      className: registerClass?.name ?? "Unassigned",
    };
    learnerMap.set(row.learner_id, item);
    learners.push(item);
  }

  const learnerBorrowers: LibraryBorrower[] = learners.map((learner) => ({
    id: learner.id,
    type: "learner",
    name: learner.name,
    helper: [learner.gradeName, learner.className, learner.admissionNumber].filter(Boolean).join(" · "),
    gradeId: learner.gradeId,
    classId: learner.classId,
  }));

  const staffMap = new Map<string, string>();
  const staffBorrowers: LibraryBorrower[] = ((staffResult.data ?? []) as StaffBorrowerRow[]).map((staff) => {
    const name = `${staff.first_name} ${staff.last_name}`.trim();
    staffMap.set(staff.staff_member_id, name);
    return { id: staff.staff_member_id, type: "staff" as const, name, helper: staff.employee_number ? `Staff · ${staff.employee_number}` : "Staff" };
  });

  const loans: LibraryLoan[] = (loansResult.data ?? []).map((row) => {
    const borrowerType = row.learner_id ? "learner" as const : "staff" as const;
    const borrowerId = row.learner_id ?? row.staff_member_id ?? "";
    const learner = borrowerType === "learner" ? learnerMap.get(borrowerId) : null;
    return {
      id: row.id,
      copyId: row.copy_id,
      borrowerId,
      borrowerType,
      borrowerName: borrowerType === "learner" ? learner?.name ?? "Learner" : staffMap.get(borrowerId) ?? "Staff member",
      issuedOn: row.issued_on,
      dueOn: row.due_on,
      returnedOn: row.returned_on,
      returnedCondition: row.returned_condition,
      status: row.status,
      notes: row.notes,
      gradeId: learner?.gradeId ?? null,
      classId: learner?.classId ?? null,
    };
  });

  return {
    schoolId,
    titles,
    copies,
    loans,
    subjects,
    grades,
    classes,
    learners: learners.sort((a, b) => a.name.localeCompare(b.name)),
    borrowers: [...learnerBorrowers, ...staffBorrowers].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
