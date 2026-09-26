import "server-only";

import { resolveTeachingGroupMembers, resolveTeachingGroups } from "@/features/academics/server/teaching-groups";
import {
  classListColumnIds,
  type ClassListColumnId,
  type ClassListConfiguration,
  type ClassListLearnerRow,
  type ClassListRosterOption,
  type ClassListRosterType,
  type ClassListScope,
  type ClassListWorkspaceData,
} from "@/features/learners/class-list-types";
import type { SchoolMembershipContext } from "@/lib/auth/get-user-context";
import { getNamibiaDateKey } from "@/lib/namibia-date";
import { formatPersonName } from "@/lib/person-name";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const managerRoles = new Set(["school_admin", "principal", "deputy_principal"]);
const guardianRoles = new Set(["school_admin", "principal", "deputy_principal", "class_teacher", "hod", "counsellor"]);
const rosterRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher", "counsellor", "learner_support", "social_worker", "librarian", "ltsm", "exam_officer", "emis_officer"]);
const guardianColumns = new Set<ClassListColumnId>(["guardianName", "guardianPhone", "emergencyContact"]);
const rosterTypes = new Set<ClassListRosterType>(["register_class", "grade", "subject", "teacher_subject", "teaching_group", "field_group"]);
const POSTGREST_IN_BATCH_SIZE = 40;

function chunkIds(ids: string[]) {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += POSTGREST_IN_BATCH_SIZE) {
    chunks.push(ids.slice(index, index + POSTGREST_IN_BATCH_SIZE));
  }
  return chunks;
}

type AcademicRows = {
  grades: Array<{ id: string; display_name: string }>;
  classes: Array<{ id: string; grade_id: string; display_name: string; register_teacher_staff_id: string | null }>;
  offerings: Array<{ id: string; grade_id: string; subject_id: string; subjects: { display_name?: string } | { display_name?: string }[] | null }>;
  allocations: Array<{ id: string; subject_offering_id: string; register_class_id: string; staff_member_id: string; active_from: string; active_to: string | null }>;
  groupAllocations: Array<{ teaching_group_id: string; teacher_allocation_id: string; effective_from: string; effective_to: string | null }>;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function effectiveOn(today: string, from: string, to: string | null) {
  return from <= today && (!to || to >= today);
}

function displayStaffName(staff: { first_name?: string | null; last_name?: string | null; initials?: string | null } | null) {
  if (!staff) return null;
  return formatPersonName([staff.first_name || staff.initials, staff.last_name].filter(Boolean).join(" ")) || null;
}

export function normalizeClassListConfiguration(
  input: Partial<ClassListConfiguration>,
  canViewGuardianFields: boolean,
): ClassListConfiguration {
  const columns = Array.from(new Set((input.columns ?? ["admissionNumber", "sex", "registerClass", "status"])
    .filter((column): column is ClassListColumnId => classListColumnIds.includes(column as ClassListColumnId))
    .filter((column) => canViewGuardianFields || !guardianColumns.has(column))));
  const rosterType = rosterTypes.has(input.rosterType as ClassListRosterType) ? input.rosterType as ClassListRosterType : "register_class";
  return {
    scope: input.scope === "all" ? "all" : "my",
    rosterType,
    rosterId: input.rosterId?.trim() ?? "",
    columns,
    blankColumns: Math.min(6, Math.max(0, Math.trunc(input.blankColumns ?? 0))),
  };
}

export function canAccessClassLists(membership: SchoolMembershipContext) {
  return rosterRoles.has(membership.roleKey);
}

async function loadAcademicRows(schoolId: string, academicYear: number): Promise<AcademicRows> {
  const supabase = await createSupabaseServerClient();
  const [grades, classes, offerings, allocations, groupAllocations] = await Promise.all([
    supabase.from("grades").select("id,display_name").eq("school_id", schoolId).eq("academic_year", academicYear).order("display_name").order("id"),
    supabase.from("register_classes").select("id,grade_id,display_name,register_teacher_staff_id").eq("school_id", schoolId).eq("academic_year", academicYear).order("display_name"),
    supabase.from("subject_offerings").select("id,grade_id,subject_id,subjects(display_name)").eq("school_id", schoolId).eq("academic_year", academicYear).eq("status", "active"),
    supabase.from("teacher_allocations").select("id,subject_offering_id,register_class_id,staff_member_id,active_from,active_to").eq("school_id", schoolId).eq("academic_year", academicYear),
    supabase.from("teaching_group_allocations").select("teaching_group_id,teacher_allocation_id,effective_from,effective_to").eq("school_id", schoolId).eq("academic_year", academicYear),
  ]);
  for (const result of [grades, classes, offerings, allocations]) {
    if (result.error) throw new Error("Unable to load the governed class-list scope.");
  }
  if (groupAllocations.error) {
    console.warn("class-list teaching group allocations unavailable; continuing without allocation links", {
      schoolId,
      academicYear,
      message: groupAllocations.error.message,
    });
  }
  return {
    grades: grades.data ?? [], classes: classes.data ?? [], offerings: offerings.data ?? [],
    allocations: allocations.data ?? [], groupAllocations: groupAllocations.error ? [] : (groupAllocations.data ?? []),
  } as AcademicRows;
}

function buildOptions(
  rows: AcademicRows,
  groups: Awaited<ReturnType<typeof resolveTeachingGroups>>,
  membership: SchoolMembershipContext,
  scope: ClassListScope,
) {
  const today = getNamibiaDateKey();
  const schoolWide = canAccessClassLists(membership) && scope === "all";
  const effectiveAllocations = rows.allocations.filter((item) => effectiveOn(today, item.active_from, item.active_to));
  const ownAllocations = membership.staffMemberId
    ? effectiveAllocations.filter((item) => item.staff_member_id === membership.staffMemberId)
    : [];
  const scopedAllocations = schoolWide ? effectiveAllocations : ownAllocations;
  const classById = new Map(rows.classes.map((item) => [item.id, item]));
  const gradeById = new Map(rows.grades.map((item) => [item.id, item]));
  const offeringById = new Map(rows.offerings.map((item) => [item.id, item]));
  const ownRegisterClassIds = new Set(rows.classes.filter((item) => item.register_teacher_staff_id === membership.staffMemberId).map((item) => item.id));
  const scopedClassIds = new Set(scopedAllocations.map((item) => item.register_class_id));
  if (!schoolWide) for (const id of ownRegisterClassIds) scopedClassIds.add(id);
  if (schoolWide) for (const item of rows.classes) scopedClassIds.add(item.id);
  const scopedOfferingIds = new Set(scopedAllocations.map((item) => item.subject_offering_id));
  if (schoolWide) for (const item of rows.offerings) scopedOfferingIds.add(item.id);
  const scopedGroupIds = new Set(rows.groupAllocations
    .filter((link) => effectiveOn(today, link.effective_from, link.effective_to) && scopedAllocations.some((allocation) => allocation.id === link.teacher_allocation_id))
    .map((link) => link.teaching_group_id));
  if (schoolWide) for (const item of groups) scopedGroupIds.add(item.id);

  const registerClass: ClassListRosterOption[] = rows.classes.filter((item) => scopedClassIds.has(item.id)).map((item) => ({
    id: item.id, label: item.display_name, helper: gradeById.get(item.grade_id)?.display_name ?? "Register class",
  }));
  const gradeIds = new Set(registerClass.map((option) => classById.get(option.id)?.grade_id).filter(Boolean));
  const grade: ClassListRosterOption[] = rows.grades.filter((item) => gradeIds.has(item.id)).map((item) => ({ id: item.id, label: item.display_name, helper: "Current learners in your class scope" }));
  const scopedOfferings = rows.offerings.filter((item) => scopedOfferingIds.has(item.id));
  const subjectMap = new Map<string, ClassListRosterOption>();
  for (const offering of scopedOfferings) {
    const name = one(offering.subjects)?.display_name ?? "Subject";
    subjectMap.set(offering.subject_id, { id: offering.subject_id, label: name, helper: "Active subject registrations in scope" });
  }
  const teacherSubject: ClassListRosterOption[] = scopedAllocations.map((allocation) => {
    const offering = offeringById.get(allocation.subject_offering_id);
    const registerClassRow = classById.get(allocation.register_class_id);
    return {
      id: allocation.id,
      label: `${one(offering?.subjects)?.display_name ?? "Subject"} · ${registerClassRow?.display_name ?? "Class"}`,
      helper: gradeById.get(offering?.grade_id ?? "")?.display_name ?? "Teacher allocation",
    };
  });
  const teachingGroup: ClassListRosterOption[] = groups.filter((item) => scopedGroupIds.has(item.id)).map((item) => {
    const offering = offeringById.get(item.subjectOfferingId);
    return { id: item.id, label: item.name, helper: `${one(offering?.subjects)?.display_name ?? item.code} · ${gradeById.get(offering?.grade_id ?? "")?.display_name ?? "Teaching Group"}` };
  });
  const fieldGroup: ClassListRosterOption[] = scopedOfferings.map((offering) => ({
    id: offering.id,
    label: one(offering.subjects)?.display_name ?? "Academic group",
    helper: `${gradeById.get(offering.grade_id)?.display_name ?? "Grade"} · subject registration group`,
  }));

  return {
    options: { register_class: registerClass, grade, subject: [...subjectMap.values()], teacher_subject: teacherSubject, teaching_group: teachingGroup, field_group: fieldGroup },
    scopedClassIds,
    scopedOfferingIds,
    scopedAllocations,
    classById,
    gradeById,
    offeringById,
  };
}

async function hydrateGuardianColumns(rows: ClassListLearnerRow[], canView: boolean) {
  if (!canView || !rows.length) return rows;
  const supabase = await createSupabaseServerClient();
  const today = getNamibiaDateKey();
  const learnerIds = rows.map((row) => row.learnerId);
  const relationshipRows: Array<{ learner_id: string; guardian_id: string; is_emergency_contact: boolean; priority: number }> = [];
  for (const batch of chunkIds(learnerIds)) {
    const relationships = await supabase.from("learner_guardians")
      .select("learner_id,guardian_id,is_emergency_contact,priority")
      .in("learner_id", batch).lte("effective_from", today).or(`effective_to.is.null,effective_to.gte.${today}`).order("priority");
    if (relationships.error) throw new Error("Unable to load authorized guardian details.");
    relationshipRows.push(...(relationships.data ?? []));
  }
  const guardianIds = Array.from(new Set(relationshipRows.map((item) => item.guardian_id)));
  if (!guardianIds.length) return rows;
  const profileRows: Array<{ id: string; first_names: string; surname: string }> = [];
  const contactRows: Array<{ guardian_id: string; contact_type: string; contact_value: string; is_primary: boolean }> = [];
  for (const batch of chunkIds(guardianIds)) {
    const [profiles, contacts] = await Promise.all([
      supabase.from("guardian_profiles").select("id,first_names,surname").in("id", batch),
      supabase.from("guardian_contacts").select("guardian_id,contact_type,contact_value,is_primary").in("guardian_id", batch).lte("effective_from", today).or(`effective_to.is.null,effective_to.gte.${today}`),
    ]);
    if (profiles.error || contacts.error) throw new Error("Unable to load authorized guardian details.");
    profileRows.push(...(profiles.data ?? []));
    contactRows.push(...(contacts.data ?? []));
  }
  const profileById = new Map(profileRows.map((item) => [item.id, formatPersonName(`${item.first_names} ${item.surname}`)]));
  const phoneByGuardian = new Map<string, string>();
  for (const item of contactRows) {
    if (!["mobile", "phone", "telephone"].includes(item.contact_type)) continue;
    if (!phoneByGuardian.has(item.guardian_id) || item.is_primary) phoneByGuardian.set(item.guardian_id, item.contact_value);
  }
  const relationshipsByLearner = new Map<string, typeof relationshipRows>();
  for (const link of relationshipRows) relationshipsByLearner.set(link.learner_id, [...(relationshipsByLearner.get(link.learner_id) ?? []), link]);
  return rows.map((row) => {
    const links = relationshipsByLearner.get(row.learnerId) ?? [];
    const primary = links[0];
    const emergency = links.find((item) => item.is_emergency_contact);
    const emergencyName = emergency ? profileById.get(emergency.guardian_id) : null;
    const emergencyPhone = emergency ? phoneByGuardian.get(emergency.guardian_id) : null;
    return {
      ...row,
      guardianName: primary ? profileById.get(primary.guardian_id) ?? null : null,
      guardianPhone: primary ? phoneByGuardian.get(primary.guardian_id) ?? null : null,
      emergencyContact: [emergencyName, emergencyPhone].filter(Boolean).join(" · ") || null,
    };
  });
}

export async function getClassListWorkspace(input: {
  membership: SchoolMembershipContext;
  academicYear: number;
  configuration: Partial<ClassListConfiguration>;
}): Promise<ClassListWorkspaceData> {
  if (!canAccessClassLists(input.membership)) throw new Error("Class-list access is not available for this role.");
  const canUseAllScope = true;
  const canViewGuardianFields = guardianRoles.has(input.membership.roleKey);
  const normalized = normalizeClassListConfiguration(input.configuration, canViewGuardianFields);
  // Class Lists are an operational school utility. Any current staff membership
  // may use All to reach the active school roster; My remains the personal
  // allocation/register view. Guardian/contact columns keep separate authority.
  const effectiveScope: ClassListScope = normalized.scope;
  const configuration = { ...normalized, scope: effectiveScope };
  const [academicRows, groups] = await Promise.all([
    loadAcademicRows(input.membership.schoolId, input.academicYear),
    resolveTeachingGroups({ schoolId: input.membership.schoolId, academicYear: input.academicYear }).catch((error) => {
      console.warn("class-list teaching groups unavailable; continuing with register/grade/subject rosters", {
        schoolId: input.membership.schoolId,
        academicYear: input.academicYear,
        message: error instanceof Error ? error.message : String(error),
      });
      return [];
    }),
  ]);
  const scoped = buildOptions(academicRows, groups, input.membership, effectiveScope);
  const selectedOptions = scoped.options[configuration.rosterType];
  const selectedMatch = selectedOptions.find((item) => item.id === configuration.rosterId);
  if (configuration.rosterId && !selectedMatch) throw new Error("The requested roster is outside your active school class-list scope.");
  const selected = selectedMatch ?? selectedOptions[0] ?? null;
  configuration.rosterId = selected?.id ?? "";

  if (!selected) return {
    academicYear: input.academicYear, schoolName: input.membership.schoolName, canUseAllScope, canViewGuardianFields,
    effectiveScope, options: scoped.options, configuration, title: "Class list", grade: "—", className: "—", registerTeacherName: null, learners: [],
  };

  const supabase = await createSupabaseServerClient();
  let enrolmentIds: string[] | null = null;
  let allowedClassIds = scoped.scopedClassIds;
  let grade = "Multiple grades";
  let className = "Multiple classes";

  if (configuration.rosterType === "register_class") {
    allowedClassIds = new Set([selected.id]);
    const classRow = scoped.classById.get(selected.id);
    grade = scoped.gradeById.get(classRow?.grade_id ?? "")?.display_name ?? "—";
    className = classRow?.display_name ?? selected.label;
  } else if (configuration.rosterType === "grade") {
    allowedClassIds = new Set([...scoped.scopedClassIds].filter((id) => scoped.classById.get(id)?.grade_id === selected.id));
    grade = scoped.gradeById.get(selected.id)?.display_name ?? selected.label;
  } else {
    let offeringIds: string[] = [];
    if (configuration.rosterType === "subject") offeringIds = [...scoped.scopedOfferingIds].filter((id) => scoped.offeringById.get(id)?.subject_id === selected.id);
    if (configuration.rosterType === "field_group") offeringIds = [selected.id];
    if (configuration.rosterType === "teacher_subject") {
      const allocation = scoped.scopedAllocations.find((item) => item.id === selected.id);
      if (allocation) { offeringIds = [allocation.subject_offering_id]; allowedClassIds = new Set([allocation.register_class_id]); }
    }
    if (configuration.rosterType === "teaching_group") {
      const members = await resolveTeachingGroupMembers(selected.id, getNamibiaDateKey());
      enrolmentIds = members.map((item) => item.enrolmentId);
      const group = groups.find((item) => item.id === selected.id);
      if (group) offeringIds = [group.subjectOfferingId];
    }
    if (enrolmentIds === null) {
      const registrations = offeringIds.length
        ? await supabase.from("learner_subject_registrations").select("enrolment_id").eq("school_id", input.membership.schoolId).eq("academic_year", input.academicYear).eq("status", "active").in("subject_offering_id", offeringIds)
        : { data: [], error: null };
      if (registrations.error) throw new Error("Unable to resolve the selected academic roster.");
      enrolmentIds = (registrations.data ?? []).map((item) => item.enrolment_id);
    }
    const offering = scoped.offeringById.get(offeringIds[0] ?? "");
    grade = offering ? scoped.gradeById.get(offering.grade_id)?.display_name ?? "Multiple grades" : "Multiple grades";
    if (configuration.rosterType === "teacher_subject") className = scoped.classById.get([...allowedClassIds][0] ?? "")?.display_name ?? "Multiple classes";
  }

  let query = supabase.from("enrolments")
    .select("id,learner_id,admission_number,status,register_class_id,learners!inner(first_names,surname,sex),register_classes(display_name)")
    .eq("school_id", input.membership.schoolId).eq("academic_year", input.academicYear).eq("status", "current")
    .in("register_class_id", [...allowedClassIds]);
  if (enrolmentIds) query = enrolmentIds.length ? query.in("id", enrolmentIds) : query.in("id", ["00000000-0000-0000-0000-000000000000"]);
  const enrolments = await query.order("admission_number");
  if (enrolments.error) throw new Error("Unable to load the selected class list.");
  let learners: ClassListLearnerRow[] = (enrolments.data ?? []).map((item) => {
    const learner = one(item.learners);
    const registerClass = one(item.register_classes);
    return {
      learnerId: item.learner_id,
      learnerName: formatPersonName(`${learner?.first_names ?? ""} ${learner?.surname ?? ""}`),
      admissionNumber: item.admission_number,
      sex: learner?.sex ?? null,
      registerClass: registerClass?.display_name ?? "Unassigned",
      status: item.status,
      guardianName: null, guardianPhone: null, emergencyContact: null,
    };
  }).sort((a, b) => a.learnerName.localeCompare(b.learnerName, undefined, { sensitivity: "base" }));
  learners = await hydrateGuardianColumns(learners, canViewGuardianFields && configuration.columns.some((column) => guardianColumns.has(column)));

  let registerTeacherName: string | null = null;
  const singleClassId = allowedClassIds.size === 1 ? [...allowedClassIds][0] : null;
  const teacherId = singleClassId ? scoped.classById.get(singleClassId)?.register_teacher_staff_id : null;
  if (teacherId) {
    const staff = await supabase.from("staff_members").select("first_name,last_name,initials").eq("id", teacherId).maybeSingle();
    if (!staff.error) registerTeacherName = displayStaffName(staff.data);
  }

  return {
    academicYear: input.academicYear, schoolName: input.membership.schoolName, canUseAllScope, canViewGuardianFields,
    effectiveScope, options: scoped.options, configuration, title: selected.label, grade, className, registerTeacherName, learners,
  };
}
