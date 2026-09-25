import "server-only";

import type { SchoolMembershipContext } from "@/lib/auth/get-user-context";
import { formatPersonName } from "@/lib/person-name";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  LearnerSubjectWorkspaceData,
  SubjectAssignmentOffering,
  SubjectAssignmentWorkspaceData,
} from "@/features/learners/subject-assignment-types";

const managerRoles = new Set(["school_admin", "principal", "deputy_principal", "hod"]);

type NamedRelation = { display_name?: string; subject_code?: string } | Array<{ display_name?: string; subject_code?: string }> | null;

function one<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export function canManageLearnerSubjects(membership: SchoolMembershipContext) {
  return managerRoles.has(membership.roleKey);
}

export async function getSubjectAssignmentWorkspace(
  membership: SchoolMembershipContext,
  academicYear: number,
): Promise<SubjectAssignmentWorkspaceData> {
  if (!canManageLearnerSubjects(membership)) throw new Error("Subject assignment is not available for this role.");
  const db = await createSupabaseServerClient();
  const [gradesResult, classesResult, offeringsResult, registrationsResult] = await Promise.all([
    db.from("grades").select("id,display_name").eq("school_id", membership.schoolId).eq("academic_year", academicYear).order("sort_order"),
    db.from("register_classes").select("id,grade_id,display_name").eq("school_id", membership.schoolId).eq("academic_year", academicYear).order("display_name"),
    db.from("subject_offerings").select("id,grade_id,status,subjects(subject_code,display_name),grades(display_name)").eq("school_id", membership.schoolId).eq("academic_year", academicYear).order("grade_id"),
    db.from("learner_subject_registrations").select("subject_offering_id").eq("school_id", membership.schoolId).eq("academic_year", academicYear).eq("status", "active").limit(10000),
  ]);
  if (gradesResult.error || classesResult.error || offeringsResult.error || registrationsResult.error) {
    throw new Error("Unable to load the subject assignment workspace.");
  }
  const grades = gradesResult.data ?? [];
  const gradeById = new Map(grades.map((grade) => [grade.id, grade.display_name]));
  const registrationCounts = new Map<string, number>();
  for (const row of registrationsResult.data ?? []) registrationCounts.set(row.subject_offering_id, (registrationCounts.get(row.subject_offering_id) ?? 0) + 1);
  const offerings: SubjectAssignmentOffering[] = (offeringsResult.data ?? []).map((row) => {
    const subject = one(row.subjects as NamedRelation);
    return {
      id: row.id,
      gradeId: row.grade_id,
      subjectCode: subject?.subject_code ?? "Subject",
      subjectName: subject?.display_name ?? "Subject",
      status: row.status,
    };
  });
  return {
    academicYear,
    schoolName: membership.schoolName,
    offerings,
    scopes: {
      grade: grades.map((grade) => ({ id: grade.id, label: grade.display_name, helper: "All current learners in this grade", gradeId: grade.id })),
      register_class: (classesResult.data ?? []).map((item) => ({ id: item.id, label: item.display_name, helper: gradeById.get(item.grade_id) ?? "Register class", gradeId: item.grade_id })),
      field_group: offerings.filter((item) => item.status === "active").map((item) => ({
        id: item.id,
        label: item.subjectName,
        helper: `${gradeById.get(item.gradeId) ?? "Grade"} · ${registrationCounts.get(item.id) ?? 0} currently registered`,
        gradeId: item.gradeId,
      })),
    },
  };
}

export async function getLearnerSubjectWorkspace(
  membership: SchoolMembershipContext,
  learnerId: string,
): Promise<LearnerSubjectWorkspaceData | null> {
  if (!canManageLearnerSubjects(membership)) throw new Error("Subject assignment is not available for this role.");
  const db = await createSupabaseServerClient();
  const enrolmentResult = await db.from("enrolments")
    .select("id,learner_id,academic_year,grade_id,register_class_id,learners!inner(first_names,surname),grades(display_name),register_classes(display_name)")
    .eq("school_id", membership.schoolId).eq("learner_id", learnerId).eq("status", "current")
    .order("academic_year", { ascending: false }).limit(1).maybeSingle();
  if (enrolmentResult.error) throw new Error("Unable to load the learner academic record.");
  const enrolment = enrolmentResult.data;
  if (!enrolment?.grade_id) return null;
  const [offeringsResult, registrationsResult] = await Promise.all([
    db.from("subject_offerings").select("id,grade_id,status,subjects(subject_code,display_name)")
      .eq("school_id", membership.schoolId).eq("academic_year", enrolment.academic_year).eq("grade_id", enrolment.grade_id).order("id"),
    db.from("learner_subject_registrations").select("id,subject_offering_id,status,registered_at,withdrawn_at,withdrawal_reason")
      .eq("school_id", membership.schoolId).eq("enrolment_id", enrolment.id),
  ]);
  if (offeringsResult.error || registrationsResult.error) throw new Error("Unable to load learner subjects.");
  const registrationByOffering = new Map((registrationsResult.data ?? []).map((row) => [row.subject_offering_id, row]));
  const learner = one(enrolment.learners as { first_names?: string; surname?: string } | Array<{ first_names?: string; surname?: string }> | null);
  const grade = one(enrolment.grades as NamedRelation);
  const registerClass = one(enrolment.register_classes as NamedRelation);
  return {
    learnerId,
    learnerName: formatPersonName(`${learner?.first_names ?? ""} ${learner?.surname ?? ""}`),
    enrolmentId: enrolment.id,
    academicYear: enrolment.academic_year,
    gradeLabel: grade?.display_name ?? "Unassigned grade",
    registerClassLabel: registerClass?.display_name ?? "Unassigned class",
    subjects: (offeringsResult.data ?? []).map((row) => {
      const subject = one(row.subjects as NamedRelation);
      const registration = registrationByOffering.get(row.id);
      return {
        id: row.id,
        gradeId: row.grade_id,
        subjectCode: subject?.subject_code ?? "Subject",
        subjectName: subject?.display_name ?? "Subject",
        status: row.status,
        registrationId: registration?.id ?? null,
        registrationStatus: registration?.status as "active" | "withdrawn" | null ?? null,
        registeredAt: registration?.registered_at ?? null,
        withdrawnAt: registration?.withdrawn_at ?? null,
        withdrawalReason: registration?.withdrawal_reason ?? null,
      };
    }).sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
  };
}
