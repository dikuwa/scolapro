import { createSupabaseServerClient } from "@/lib/supabase/server";

export type GuardianContact = { id: string; type: string; value: string; primary: boolean; label: string | null };
export type GuardianAddress = {
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
  primary: boolean;
};

export type LearnerGuardian = {
  relationshipId: string;
  guardianId: string;
  name: string;
  relationshipType: string;
  legalGuardian: boolean;
  emergencyContact: boolean;
  pickupAuthorized: boolean;
  priority: number;
  contacts: GuardianContact[];
  addresses: GuardianAddress[];
};

export type ReusableGuardian = { id: string; name: string; contacts: GuardianContact[] };

export async function getLearnerGuardians(learnerId: string): Promise<LearnerGuardian[]> {
  const supabase = await createSupabaseServerClient();
  const { data: links, error } = await supabase
    .from("learner_guardians")
    .select("id,guardian_id,relationship_type,is_legal_guardian,is_emergency_contact,is_pickup_authorized,priority")
    .eq("learner_id", learnerId)
    .is("effective_to", null)
    .order("priority");
  if (error || !links?.length) return [];

  const guardianIds = links.map((item) => item.guardian_id);
  const [{ data: profiles }, { data: contacts }, { data: addresses }] = await Promise.all([
    supabase.from("guardian_profiles").select("id,first_names,surname,preferred_name").in("id", guardianIds),
    supabase.from("guardian_contacts").select("id,guardian_id,contact_type,contact_value,is_primary,label").in("guardian_id", guardianIds).is("effective_to", null),
    supabase.from("guardian_addresses").select("id,guardian_id,address_type,label,address_line_1,address_line_2,suburb_or_locality,town_or_city,region,postal_code,country,is_primary").in("guardian_id", guardianIds).is("effective_to", null),
  ]);

  const profileMap = new Map((profiles ?? []).map((item) => [item.id, item]));
  return links.map((link) => {
    const profile = profileMap.get(link.guardian_id);
    return {
      relationshipId: link.id,
      guardianId: link.guardian_id,
      name: profile ? `${profile.first_names} ${profile.surname}` : "Guardian",
      relationshipType: link.relationship_type,
      legalGuardian: link.is_legal_guardian,
      emergencyContact: link.is_emergency_contact,
      pickupAuthorized: link.is_pickup_authorized,
      priority: link.priority,
      contacts: (contacts ?? []).filter((item) => item.guardian_id === link.guardian_id).map((item) => ({ id: item.id, type: item.contact_type, value: item.contact_value, primary: item.is_primary, label: item.label })),
      addresses: (addresses ?? []).filter((item) => item.guardian_id === link.guardian_id).map((item) => ({
        id: item.id, type: item.address_type, label: item.label, line1: item.address_line_1, line2: item.address_line_2,
        locality: item.suburb_or_locality, town: item.town_or_city, region: item.region, postalCode: item.postal_code,
        country: item.country, primary: item.is_primary,
      })),
    };
  });
}

export async function getReusableGuardians(learnerId: string, schoolId: string): Promise<ReusableGuardian[]> {
  const supabase = await createSupabaseServerClient();
  const [{ data: school }, { data: currentLinks }] = await Promise.all([
    supabase.from("schools").select("tenant_id").eq("id", schoolId).maybeSingle(),
    supabase.from("learner_guardians").select("guardian_id").eq("learner_id", learnerId).is("effective_to", null),
  ]);
  if (!school?.tenant_id) return [];

  const existing = new Set((currentLinks ?? []).map((item) => item.guardian_id));
  const { data: profiles, error } = await supabase
    .from("guardian_profiles")
    .select("id,first_names,surname,preferred_name")
    .eq("tenant_id", school.tenant_id)
    .eq("status", "active")
    .order("surname")
    .order("first_names")
    .limit(250);
  if (error || !profiles?.length) return [];

  const candidates = profiles.filter((profile) => !existing.has(profile.id));
  if (!candidates.length) return [];
  const ids = candidates.map((item) => item.id);
  const { data: contacts } = await supabase
    .from("guardian_contacts")
    .select("id,guardian_id,contact_type,contact_value,is_primary,label")
    .in("guardian_id", ids)
    .is("effective_to", null);

  return candidates.map((profile) => ({
    id: profile.id,
    name: `${profile.first_names} ${profile.surname}`,
    contacts: (contacts ?? []).filter((item) => item.guardian_id === profile.id).map((item) => ({ id: item.id, type: item.contact_type, value: item.contact_value, primary: item.is_primary, label: item.label })),
  }));
}
