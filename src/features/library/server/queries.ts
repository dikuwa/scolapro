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
};

export type LibraryBorrower = {
  id: string;
  type: "learner" | "staff";
  name: string;
  helper: string;
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
};

type LearnerRow = {
  learner_id: string;
  admission_number: string | null;
  learners: { first_names: string; surname: string } | { first_names: string; surname: string }[];
};

type StaffLinkRow = {
  staff_member_id: string | null;
  staff_members: { first_name: string; last_name: string; employee_number: string | null } | { first_name: string; last_name: string; employee_number: string | null }[] | null;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function getLibraryWorkspace(schoolId: string, today: string) {
  const supabase = await createSupabaseServerClient();
  const [titlesResult, copiesResult, loansResult, learnersResult, membershipStaffResult, placementStaffResult] = await Promise.all([
    supabase
      .from("learning_resource_titles")
      .select("id,resource_type,title,author,publisher,isbn,subject_id,subject_code,grade_code,edition,category,status")
      .eq("school_id", schoolId)
      .order("title"),
    supabase
      .from("learning_resource_copies")
      .select("id,title_id,barcode,asset_number,condition,availability,location_label")
      .eq("school_id", schoolId)
      .order("created_at"),
    supabase
      .from("learning_resource_loans")
      .select("id,copy_id,learner_id,staff_member_id,issued_on,due_on,returned_on,returned_condition,status,notes")
      .eq("school_id", schoolId)
      .order("issued_on", { ascending: false }),
    supabase
      .from("enrolments")
      .select("learner_id,admission_number,learners!inner(first_names,surname)")
      .eq("school_id", schoolId)
      .eq("status", "current")
      .lte("enrolled_from", today)
      .or(`enrolled_to.is.null,enrolled_to.gte.${today}`),
    supabase
      .from("school_memberships")
      .select("staff_member_id,staff_members!inner(first_name,last_name,employee_number,status)")
      .eq("school_id", schoolId)
      .not("staff_member_id", "is", null)
      .eq("staff_members.status", "active")
      .lte("active_from", today)
      .or(`active_to.is.null,active_to.gte.${today}`),
    supabase
      .from("staff_school_assignments")
      .select("staff_member_id,staff_members!inner(first_name,last_name,employee_number,status)")
      .eq("school_id", schoolId)
      .eq("staff_members.status", "active")
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`),
  ]);

  const error = titlesResult.error
    ?? copiesResult.error
    ?? loansResult.error
    ?? learnersResult.error
    ?? membershipStaffResult.error
    ?? placementStaffResult.error;
  if (error) throw new Error(`Unable to load Library / Textbooks: ${error.message}`);

  const titles: LibraryTitle[] = (titlesResult.data ?? []).map((row) => ({
    id: row.id,
    resourceType: row.resource_type,
    title: row.title,
    author: row.author,
    publisher: row.publisher,
    isbn: row.isbn,
    subjectId: row.subject_id,
    subjectCode: row.subject_code,
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
  }));

  const learnerMap = new Map<string, string>();
  const learnerBorrowers: LibraryBorrower[] = ((learnersResult.data ?? []) as unknown as LearnerRow[]).map((row) => {
    const learner = first(row.learners)!;
    const name = `${learner.first_names} ${learner.surname}`.trim();
    learnerMap.set(row.learner_id, name);
    return { id: row.learner_id, type: "learner", name, helper: row.admission_number ? `Learner · ${row.admission_number}` : "Learner" };
  });

  const staffMap = new Map<string, string>();
  const staffBorrowers: LibraryBorrower[] = [];
  const seenStaff = new Set<string>();
  const staffRows = [
    ...((membershipStaffResult.data ?? []) as unknown as StaffLinkRow[]),
    ...((placementStaffResult.data ?? []) as unknown as StaffLinkRow[]),
  ];
  for (const row of staffRows) {
    if (!row.staff_member_id || seenStaff.has(row.staff_member_id)) continue;
    const staff = first(row.staff_members);
    if (!staff) continue;
    seenStaff.add(row.staff_member_id);
    const name = `${staff.first_name} ${staff.last_name}`.trim();
    staffMap.set(row.staff_member_id, name);
    staffBorrowers.push({ id: row.staff_member_id, type: "staff", name, helper: staff.employee_number ? `Staff · ${staff.employee_number}` : "Staff" });
  }

  const loans: LibraryLoan[] = (loansResult.data ?? []).map((row) => {
    const borrowerType = row.learner_id ? "learner" as const : "staff" as const;
    const borrowerId = row.learner_id ?? row.staff_member_id ?? "";
    return {
      id: row.id,
      copyId: row.copy_id,
      borrowerId,
      borrowerType,
      borrowerName: borrowerType === "learner" ? learnerMap.get(borrowerId) ?? "Learner" : staffMap.get(borrowerId) ?? "Staff member",
      issuedOn: row.issued_on,
      dueOn: row.due_on,
      returnedOn: row.returned_on,
      returnedCondition: row.returned_condition,
      status: row.status,
      notes: row.notes,
    };
  });

  return {
    titles,
    copies,
    loans,
    borrowers: [...learnerBorrowers, ...staffBorrowers].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
