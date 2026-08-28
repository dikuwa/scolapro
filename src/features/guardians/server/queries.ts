import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LearnerGuardian = {
  relationshipId: string;
  guardianId: string;
  name: string;
  relationshipType: string;
  legalGuardian: boolean;
  emergencyContact: boolean;
  pickupAuthorized: boolean;
  priority: number;
  contacts: { id: string; type: string; value: string; primary: boolean; label: string | null }[];
};

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
  const [{ data: profiles }, { data: contacts }] = await Promise.all([
    supabase.from("guardian_profiles").select("id,first_names,surname,preferred_name").in("id", guardianIds),
    supabase.from("guardian_contacts").select("id,guardian_id,contact_type,contact_value,is_primary,label").in("guardian_id", guardianIds).is("effective_to", null),
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
      contacts: (contacts ?? []).filter((item) => item.guardian_id === link.guardian_id).map((item) => ({
        id: item.id, type: item.contact_type, value: item.contact_value, primary: item.is_primary, label: item.label,
      })),
    };
  });
}
