import "server-only";

import { listLearnerDirectoryPage, type LearnerListItem } from "@/features/learners/server/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CLASS_LIST_PAGE_SIZE = 100;
const MAX_CLASS_LIST_PAGES = 20;

export type OfficialClassListRoster = {
  grade: string;
  registerClass: string;
  registerTeacherName: string | null;
  learners: LearnerListItem[];
};

function staffDisplayName(staff: {
  first_name: string | null;
  last_name: string | null;
  initials: string | null;
}): string | null {
  const fullName = [staff.first_name, staff.last_name]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  if (fullName) return fullName;

  const initialsAndSurname = [staff.initials, staff.last_name]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  return initialsAndSurname || null;
}

async function getRegisterTeacherName(
  schoolId: string,
  academicYear: number,
  grade: string,
  registerClass: string,
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();

  const { data: gradeRow, error: gradeError } = await supabase
    .from("grades")
    .select("id")
    .eq("school_id", schoolId)
    .eq("academic_year", academicYear)
    .eq("display_name", grade)
    .maybeSingle();
  if (gradeError) throw new Error("Unable to resolve the class grade for the official class list.");
  if (!gradeRow) return null;

  const { data: classRow, error: classError } = await supabase
    .from("register_classes")
    .select("register_teacher_staff_id")
    .eq("school_id", schoolId)
    .eq("academic_year", academicYear)
    .eq("grade_id", gradeRow.id)
    .eq("display_name", registerClass)
    .maybeSingle();
  if (classError) throw new Error("Unable to resolve the register class for the official class list.");
  if (!classRow?.register_teacher_staff_id) return null;

  const { data: staff, error: staffError } = await supabase
    .from("staff_members")
    .select("first_name,last_name,initials")
    .eq("id", classRow.register_teacher_staff_id)
    .eq("status", "active")
    .maybeSingle();
  if (staffError) throw new Error("Unable to resolve the register teacher for the official class list.");
  return staff ? staffDisplayName(staff) : null;
}

/**
 * Resolves a complete current class roster through the existing paged learner
 * directory boundary. A class is mandatory so an official export can never
 * accidentally turn into an unbounded whole-school learner dump.
 */
export async function getOfficialClassListRoster(
  schoolId: string,
  academicYear: number,
  grade: string,
  registerClass: string,
): Promise<OfficialClassListRoster> {
  const normalizedGrade = grade.trim();
  const normalizedClass = registerClass.trim();
  if (!normalizedGrade || !normalizedClass || normalizedGrade === "all" || normalizedClass === "all") {
    throw new Error("A specific grade and register class are required for an official class list.");
  }

  const learners: LearnerListItem[] = [];
  let page = 1;
  let pageCount = 1;

  const registerTeacherNamePromise = getRegisterTeacherName(
    schoolId,
    academicYear,
    normalizedGrade,
    normalizedClass,
  );

  do {
    const result = await listLearnerDirectoryPage(schoolId, academicYear, {
      status: "current",
      grade: normalizedGrade,
      registerClass: normalizedClass,
      sortOrder: "asc",
      page,
      pageSize: CLASS_LIST_PAGE_SIZE,
    });
    learners.push(...result.learners);
    pageCount = result.pageCount;
    page += 1;

    if (page > MAX_CLASS_LIST_PAGES + 1 && page <= pageCount) {
      throw new Error("This class list exceeds the supported official export size.");
    }
  } while (page <= pageCount);

  return {
    grade: normalizedGrade,
    registerClass: normalizedClass,
    registerTeacherName: await registerTeacherNamePromise,
    learners,
  };
}
