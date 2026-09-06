import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ClassListColumn, ClassListRow } from "@/features/reporting/class-list-types";

type Relation<T> = T | T[] | null;
type GuardianLinkRow = {
  learner_id: string;
  guardian_id: string;
  priority: number;
  is_emergency_contact: boolean;
  guardian_profiles: Relation<{ first_names: string; surname: string }>;
};
type GuardianContactRow = { guardian_id: string; contact_type: string; contact_value: string; is_primary: boolean };

const baseColumns: ClassListColumn[] = [
  { key: "learner", label: "Learner", group: "Learner" },
  { key: "admissionNumber", label: "Admission number", group: "Learner" },
  { key: "grade", label: "Grade", group: "Academic" },
  { key: "registerClass", label: "Class", group: "Academic" },
  { key: "status", label: "Status", group: "Academic" },
];

const demographicRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "class_teacher", "counsellor"]);
const guardianRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "class_teacher", "counsellor"]);
const addressRoles = new Set(["school_admin", "principal", "deputy_principal", "class_teacher"]);
const examinationRoles = new Set(["school_admin", "principal", "deputy_principal", "exam_officer"]);

function one<T>(value: Relation<T>): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function addressText(value: {
  address_line_1: string;
  address_line_2: string | null;
  suburb_or_locality: string | null;
  town_or_city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string;
}) {
  return [value.address_line_1, value.address_line_2, value.suburb_or_locality, value.town_or_city, value.region, value.postal_code, value.country]
    .filter(Boolean)
    .join(", ");
}

export async function getClassListWorkspace(schoolId: string, academicYear: number, roleKey: string) {
  const supabase = await createSupabaseServerClient();
  const canReadGuardians = guardianRoles.has(roleKey);
  const canReadAddresses = addressRoles.has(roleKey);
  const canReadExaminations = examinationRoles.has(roleKey);

  const [yearsResult, gradesResult, classesResult, enrolmentsResult, cyclesResult] = await Promise.all([
    supabase.from("academic_years").select("year").eq("school_id", schoolId).order("year", { ascending: false }),
    supabase.from("grades").select("id,display_name").eq("school_id", schoolId).eq("academic_year", academicYear).order("grade_code"),
    supabase.from("register_classes").select("id,display_name,grade_id").eq("school_id", schoolId).eq("academic_year", academicYear).order("class_code"),
    supabase
      .from("enrolments")
      .select("id,learner_id,admission_number,grade_id,register_class_id,status,learners!inner(first_names,surname,date_of_birth,sex),grades(display_name),register_classes(display_name)")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .order("admission_number"),
    canReadExaminations
      ? supabase.from("examination_cycles").select("id,display_name,status").eq("school_id", schoolId).eq("academic_year", academicYear).order("display_name")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const firstError = yearsResult.error || gradesResult.error || classesResult.error || enrolmentsResult.error || cyclesResult.error;
  if (firstError) throw new Error("Unable to load the class-list workspace.");

  const enrolments = enrolmentsResult.data ?? [];
  const learnerIds = enrolments.map((row) => row.learner_id);
  const enrolmentIds = enrolments.map((row) => row.id);
  const cycles = cyclesResult.data ?? [];

  const guardianLinksResult = canReadGuardians && learnerIds.length
    ? await supabase
      .from("learner_guardians")
      .select("learner_id,guardian_id,priority,is_emergency_contact,guardian_profiles(first_names,surname)")
      .in("learner_id", learnerIds)
      .is("effective_to", null)
      .order("priority")
    : { data: [], error: null };
  if (guardianLinksResult.error) throw new Error("Unable to load authorized guardian details.");

  const guardianLinks = (guardianLinksResult.data ?? []) as GuardianLinkRow[];
  const guardianIds = Array.from(new Set(guardianLinks.map((row) => row.guardian_id)));
  const [contactsResult, addressesResult, candidatesResult] = await Promise.all([
    canReadGuardians && guardianIds.length
      ? supabase.from("guardian_contacts").select("guardian_id,contact_type,contact_value,is_primary").in("guardian_id", guardianIds).is("effective_to", null).order("is_primary", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    canReadAddresses && guardianIds.length
      ? supabase.from("guardian_addresses").select("guardian_id,address_line_1,address_line_2,suburb_or_locality,town_or_city,region,postal_code,country,is_primary").in("guardian_id", guardianIds).is("effective_to", null).order("is_primary", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    canReadExaminations && enrolmentIds.length && cycles.length
      ? supabase.from("examination_candidates").select("enrolment_id,examination_cycle_id,candidate_number").in("enrolment_id", enrolmentIds).in("examination_cycle_id", cycles.map((cycle) => cycle.id))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (contactsResult.error || addressesResult.error || candidatesResult.error) throw new Error("Unable to load optional class-list details.");

  const linksByLearner = new Map<string, GuardianLinkRow[]>();
  for (const link of guardianLinks) {
    const links = linksByLearner.get(link.learner_id) ?? [];
    links.push(link);
    linksByLearner.set(link.learner_id, links);
  }
  const contactsByGuardian = new Map<string, GuardianContactRow[]>();
  for (const contact of (contactsResult.data ?? []) as GuardianContactRow[]) {
    const contacts = contactsByGuardian.get(contact.guardian_id) ?? [];
    contacts.push(contact);
    contactsByGuardian.set(contact.guardian_id, contacts);
  }
  const addressByGuardian = new Map<string, (NonNullable<typeof addressesResult.data>)[number]>();
  for (const address of addressesResult.data ?? []) {
    if (!addressByGuardian.has(address.guardian_id)) addressByGuardian.set(address.guardian_id, address);
  }
  const candidatesByEnrolment = new Map<string, Record<string, string>>();
  for (const candidate of candidatesResult.data ?? []) {
    if (!candidate.candidate_number) continue;
    const values = candidatesByEnrolment.get(candidate.enrolment_id) ?? {};
    values[candidate.examination_cycle_id] = candidate.candidate_number;
    candidatesByEnrolment.set(candidate.enrolment_id, values);
  }

  const rows: ClassListRow[] = enrolments.map((row) => {
    const learner = one(row.learners);
    const links = linksByLearner.get(row.learner_id) ?? [];
    const primaryLink = links[0];
    const emergencyLink = links.find((link) => link.is_emergency_contact);
    const guardian = one(primaryLink?.guardian_profiles ?? null);
    const emergencyGuardian = one(emergencyLink?.guardian_profiles ?? null);
    const primaryContacts = primaryLink ? contactsByGuardian.get(primaryLink.guardian_id) ?? [] : [];
    const phone = primaryContacts.find((contact) => ["mobile", "phone", "whatsapp"].includes(contact.contact_type));
    const address = primaryLink ? addressByGuardian.get(primaryLink.guardian_id) : null;
    return {
      enrolmentId: row.id,
      learnerId: row.learner_id,
      learner: learner ? `${learner.first_names} ${learner.surname}`.trim() : "Learner",
      admissionNumber: row.admission_number ?? "—",
      gradeId: row.grade_id,
      grade: one(row.grades)?.display_name ?? "Unassigned",
      registerClassId: row.register_class_id,
      registerClass: one(row.register_classes)?.display_name ?? "Unassigned",
      status: row.status,
      sex: learner?.sex ?? "—",
      dateOfBirth: learner?.date_of_birth ?? "—",
      guardian: guardian ? `${guardian.first_names} ${guardian.surname}`.trim() : "—",
      guardianPhone: phone?.contact_value ?? "—",
      emergencyContact: emergencyGuardian ? `${emergencyGuardian.first_names} ${emergencyGuardian.surname}`.trim() : "—",
      guardianAddress: address ? addressText(address) : "—",
      candidateNumbers: candidatesByEnrolment.get(row.id) ?? {},
    };
  });

  const availableColumns = [...baseColumns];
  if (demographicRoles.has(roleKey)) availableColumns.splice(2, 0,
    { key: "sex", label: "Sex", group: "Learner" },
    { key: "dateOfBirth", label: "Date of birth", group: "Learner" },
  );
  if (canReadGuardians) availableColumns.push(
    { key: "guardian", label: "Primary guardian", group: "Guardian" },
    { key: "guardianPhone", label: "Guardian phone", group: "Guardian" },
    { key: "emergencyContact", label: "Emergency contact", group: "Guardian" },
  );
  if (canReadAddresses) availableColumns.push({ key: "guardianAddress", label: "Guardian address", group: "Guardian" });
  if (canReadExaminations) availableColumns.push({ key: "candidateNumber", label: "Candidate number", group: "Examination" });

  return {
    years: Array.from(new Set((yearsResult.data ?? []).map((year) => year.year))),
    grades: gradesResult.data ?? [],
    classes: classesResult.data ?? [],
    cycles,
    rows,
    availableColumns,
  };
}
