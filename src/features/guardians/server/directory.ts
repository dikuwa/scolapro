import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type GuardianDirectoryLearner = {
  id: string;
  name: string;
  admissionNumber: string | null;
  grade: string;
  registerClass: string;
  relationship: string;
  legalGuardian: boolean;
  emergencyContact: boolean;
  primary: boolean;
};

export type GuardianDirectoryRow = {
  id: string;
  name: string;
  contacts: { id: string; type: string; value: string; primary: boolean }[];
  address: string | null;
  learners: GuardianDirectoryLearner[];
};

export async function getGuardianDirectory(schoolId: string): Promise<GuardianDirectoryRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data: enrolments, error: enrolmentError } = await supabase
    .from("enrolments")
    .select("learner_id,admission_number,grade_id,register_class_id")
    .eq("school_id", schoolId)
    .eq("status", "current");
  if (enrolmentError) throw new Error("Unable to load guardian-linked learners.");

  const learnerIds = Array.from(new Set((enrolments ?? []).map((item) => item.learner_id)));
  if (!learnerIds.length) return [];

  const { data: relationships, error: relationshipError } = await supabase
    .from("learner_guardians")
    .select("guardian_id,learner_id,relationship_type,is_legal_guardian,is_emergency_contact,priority")
    .in("learner_id", learnerIds)
    .lte("effective_from", new Date().toISOString().slice(0, 10))
    .or(`effective_to.is.null,effective_to.gte.${new Date().toISOString().slice(0, 10)}`)
    .order("priority");
  if (relationshipError) throw new Error("Unable to load guardian relationships.");

  const guardianIds = Array.from(new Set((relationships ?? []).map((item) => item.guardian_id)));
  if (!guardianIds.length) return [];
  const gradeIds = Array.from(new Set((enrolments ?? []).map((item) => item.grade_id).filter(Boolean)));
  const classIds = Array.from(new Set((enrolments ?? []).map((item) => item.register_class_id).filter(Boolean)));

  const [profilesResult, contactsResult, addressesResult, learnersResult, gradesResult, classesResult] = await Promise.all([
    supabase.from("guardian_profiles").select("id,first_names,surname,preferred_name").in("id", guardianIds).eq("status", "active").order("surname"),
    supabase.from("guardian_contacts").select("id,guardian_id,contact_type,contact_value,is_primary").in("guardian_id", guardianIds).is("effective_to", null),
    supabase.from("guardian_addresses").select("guardian_id,address_line_1,address_line_2,suburb_or_locality,town_or_city,region,postal_code,country,is_primary").in("guardian_id", guardianIds).is("effective_to", null),
    supabase.from("learners").select("id,first_names,surname,preferred_name").in("id", learnerIds),
    gradeIds.length ? supabase.from("grades").select("id,display_name").in("id", gradeIds) : Promise.resolve({ data: [], error: null }),
    classIds.length ? supabase.from("register_classes").select("id,display_name").in("id", classIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesResult.error || contactsResult.error || learnersResult.error || gradesResult.error || classesResult.error) {
    throw new Error("Unable to load the guardian directory.");
  }

  const enrolmentMap = new Map((enrolments ?? []).map((item) => [item.learner_id, item]));
  const learnerMap = new Map((learnersResult.data ?? []).map((item) => [item.id, item]));
  const gradeMap = new Map((gradesResult.data ?? []).map((item) => [item.id, item.display_name]));
  const classMap = new Map((classesResult.data ?? []).map((item) => [item.id, item.display_name]));

  return (profilesResult.data ?? []).map((profile) => {
    const guardianRelationships = (relationships ?? []).filter((item) => item.guardian_id === profile.id);
    const addresses = (addressesResult.data ?? []).filter((item) => item.guardian_id === profile.id);
    const primaryAddress = addresses.find((item) => item.is_primary) ?? addresses[0];
    return {
      id: profile.id,
      name: [profile.preferred_name || profile.first_names, profile.surname].filter(Boolean).join(" "),
      contacts: (contactsResult.data ?? []).filter((item) => item.guardian_id === profile.id).map((item) => ({ id: item.id, type: item.contact_type, value: item.contact_value, primary: item.is_primary })),
      address: primaryAddress ? [primaryAddress.address_line_1, primaryAddress.address_line_2, primaryAddress.suburb_or_locality, primaryAddress.town_or_city, primaryAddress.region, primaryAddress.postal_code, primaryAddress.country].filter(Boolean).join(", ") : null,
      learners: guardianRelationships.map((relationship) => {
        const learner = learnerMap.get(relationship.learner_id);
        const enrolment = enrolmentMap.get(relationship.learner_id);
        return {
          id: relationship.learner_id,
          name: learner ? [learner.preferred_name || learner.first_names, learner.surname].filter(Boolean).join(" ") : "Learner",
          admissionNumber: enrolment?.admission_number ?? null,
          grade: gradeMap.get(enrolment?.grade_id ?? "") ?? "Grade not set",
          registerClass: classMap.get(enrolment?.register_class_id ?? "") ?? "Class not set",
          relationship: relationship.relationship_type,
          legalGuardian: relationship.is_legal_guardian,
          emergencyContact: relationship.is_emergency_contact,
          primary: relationship.priority === 1,
        };
      }),
    };
  });
}
