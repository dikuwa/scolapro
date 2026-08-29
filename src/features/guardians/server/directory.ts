import { createSupabaseServerClient } from "@/lib/supabase/server";

export type GuardianDirectoryLearner = {
  learnerId: string;
  name: string;
  admissionNumber: string | null;
  grade: string;
  registerClass: string;
  relationshipType: string;
  isLegalGuardian: boolean;
  isEmergencyContact: boolean;
  isPickupAuthorized: boolean;
  priority: number;
};

export type GuardianDirectoryContact = {
  id: string;
  type: string;
  value: string;
  primary: boolean;
  label: string | null;
};

export type GuardianDirectoryAddress = {
  id: string;
  type: string;
  label: string | null;
  line1: string;
  line2: string | null;
  locality: string | null;
  town: string | null;
  region: string | null;
  postalCode: string | null;
  country: string;
};

export type GuardianDirectoryRow = {
  guardianId: string;
  name: string;
  preferredName: string | null;
  identityNumber: string | null;
  status: string;
  learners: GuardianDirectoryLearner[];
  contacts: GuardianDirectoryContact[];
  addresses: GuardianDirectoryAddress[];
};

function relationValue<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export async function getGuardianDirectory(schoolId: string): Promise<GuardianDirectoryRow[]> {
  const supabase = await createSupabaseServerClient();

  // Get all active learner-guardian links for this school
  const { data: links, error: linksError } = await supabase
    .from("learner_guardians")
    .select(`
      id,
      guardian_id,
      relationship_type,
      is_legal_guardian,
      is_emergency_contact,
      is_pickup_authorized,
      priority,
      learner_id,
      learners!inner(id, first_names, surname, preferred_name),
      enrolments!inner(school_id, status, admission_number, grades(display_name), register_classes(display_name))
    `)
    .eq("enrolments.school_id", schoolId)
    .eq("enrolments.status", "current")
    .is("effective_to", null)
    .order("priority");

  if (linksError || !links?.length) return [];

  // Collect unique guardian IDs
  const guardianIds = [...new Set(links.map((link) => link.guardian_id))];

  // Fetch guardian profiles
  const { data: profiles } = await supabase
    .from("guardian_profiles")
    .select("id, first_names, surname, preferred_name, identity_number, status")
    .in("id", guardianIds);

  // Fetch contacts
  const { data: contacts } = await supabase
    .from("guardian_contacts")
    .select("id, guardian_id, contact_type, contact_value, is_primary, label")
    .in("guardian_id", guardianIds)
    .is("effective_to", null);

  // Fetch addresses
  const { data: addresses } = await supabase
    .from("guardian_addresses")
    .select("id, guardian_id, address_type, label, address_line_1, address_line_2, suburb_or_locality, town_or_city, region, postal_code, country")
    .in("guardian_id", guardianIds)
    .is("effective_to", null);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const contactMap = new Map<string, GuardianDirectoryContact[]>();
  for (const c of contacts ?? []) {
    const list = contactMap.get(c.guardian_id) ?? [];
    list.push({ id: c.id, type: c.contact_type, value: c.contact_value, primary: c.is_primary, label: c.label });
    contactMap.set(c.guardian_id, list);
  }
  const addressMap = new Map<string, GuardianDirectoryAddress[]>();
  for (const a of addresses ?? []) {
    const list = addressMap.get(a.guardian_id) ?? [];
    list.push({
      id: a.id, type: a.address_type, label: a.label,
      line1: a.address_line_1, line2: a.address_line_2,
      locality: a.suburb_or_locality, town: a.town_or_city,
      region: a.region, postalCode: a.postal_code, country: a.country,
    });
    addressMap.set(a.guardian_id, list);
  }

  // Build guardian map
  const guardianMap = new Map<string, GuardianDirectoryRow>();

  for (const link of links) {
    const learner = relationValue(link.learners);
    const enrolment = relationValue(link.enrolments);
    if (!learner || !enrolment) continue;

    const grade = relationValue(enrolment.grades);
    const registerClass = relationValue(enrolment.register_classes);
    const profile = profileMap.get(link.guardian_id);

    let row = guardianMap.get(link.guardian_id);
    if (!row) {
      row = {
        guardianId: link.guardian_id,
        name: profile ? `${profile.first_names} ${profile.surname}` : "Unknown guardian",
        preferredName: profile?.preferred_name ?? null,
        identityNumber: profile?.identity_number ?? null,
        status: profile?.status ?? "active",
        learners: [],
        contacts: contactMap.get(link.guardian_id) ?? [],
        addresses: addressMap.get(link.guardian_id) ?? [],
      };
      guardianMap.set(link.guardian_id, row);
    }

    row.learners.push({
      learnerId: learner.id,
      name: `${learner.first_names} ${learner.surname}`.trim(),
      admissionNumber: enrolment.admission_number,
      grade: grade?.display_name ?? "Unassigned",
      registerClass: registerClass?.display_name ?? "Unassigned",
      relationshipType: link.relationship_type,
      isLegalGuardian: link.is_legal_guardian,
      isEmergencyContact: link.is_emergency_contact,
      isPickupAuthorized: link.is_pickup_authorized,
      priority: link.priority,
    });
  }

  return Array.from(guardianMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}
