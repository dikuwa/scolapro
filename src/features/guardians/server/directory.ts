import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatPersonName } from "@/lib/person-name";

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

export type GuardianDirectoryPage = {
  guardians: GuardianDirectoryRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

type ScopedLearner = {
  learner_id?: string;
  learner_name?: string;
  admission_number?: string | null;
  grade_name?: string | null;
  class_name?: string | null;
  relationship_type?: string;
  is_legal_guardian?: boolean;
  is_emergency_contact?: boolean;
  is_pickup_authorized?: boolean;
  priority?: number;
};

type ScopedGuardian = {
  guardian_id: string;
  guardian_name: string;
  primary_mobile: string | null;
  primary_email: string | null;
  linked_learners: ScopedLearner[] | null;
  total_count?: number | string;
};

async function hydrateGuardianRows(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  rows: ScopedGuardian[],
): Promise<GuardianDirectoryRow[]> {
  if (!rows.length) return [];
  const guardianIds = rows.map((row) => row.guardian_id);
  const [{ data: profiles }, { data: contacts }, { data: addresses }] = await Promise.all([
    supabase.from("guardian_profiles").select("id, preferred_name, identity_number, status").in("id", guardianIds),
    supabase.from("guardian_contacts").select("id, guardian_id, contact_type, contact_value, is_primary, label").in("guardian_id", guardianIds).is("effective_to", null),
    supabase.from("guardian_addresses").select("id, guardian_id, address_type, label, address_line_1, address_line_2, suburb_or_locality, town_or_city, region, postal_code, country").in("guardian_id", guardianIds).is("effective_to", null),
  ]);

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const contactMap = new Map<string, GuardianDirectoryContact[]>();
  for (const contact of contacts ?? []) {
    const list = contactMap.get(contact.guardian_id) ?? [];
    list.push({ id: contact.id, type: contact.contact_type, value: contact.contact_value, primary: contact.is_primary, label: contact.label });
    contactMap.set(contact.guardian_id, list);
  }

  const addressMap = new Map<string, GuardianDirectoryAddress[]>();
  for (const address of addresses ?? []) {
    const list = addressMap.get(address.guardian_id) ?? [];
    list.push({
      id: address.id,
      type: address.address_type,
      label: address.label,
      line1: address.address_line_1,
      line2: address.address_line_2,
      locality: address.suburb_or_locality,
      town: address.town_or_city,
      region: address.region,
      postalCode: address.postal_code,
      country: address.country,
    });
    addressMap.set(address.guardian_id, list);
  }

  return rows.map((row) => {
    const profile = profileMap.get(row.guardian_id);
    const fallbackContacts: GuardianDirectoryContact[] = [];
    if (row.primary_mobile) fallbackContacts.push({ id: `${row.guardian_id}-mobile`, type: "mobile", value: row.primary_mobile, primary: true, label: null });
    if (row.primary_email) fallbackContacts.push({ id: `${row.guardian_id}-email`, type: "email", value: row.primary_email, primary: true, label: null });

    return {
      guardianId: row.guardian_id,
      name: formatPersonName(row.guardian_name),
      preferredName: profile?.preferred_name ?? null,
      identityNumber: profile?.identity_number ?? null,
      status: profile?.status ?? "active",
      learners: (row.linked_learners ?? []).map((learner) => ({
        learnerId: learner.learner_id ?? "",
        name: formatPersonName(learner.learner_name ?? "Learner"),
        admissionNumber: learner.admission_number ?? null,
        grade: learner.grade_name ?? "Unassigned",
        registerClass: learner.class_name ?? "Unassigned",
        relationshipType: learner.relationship_type ?? "guardian",
        isLegalGuardian: Boolean(learner.is_legal_guardian),
        isEmergencyContact: Boolean(learner.is_emergency_contact),
        isPickupAuthorized: Boolean(learner.is_pickup_authorized),
        priority: learner.priority ?? 1,
      })).filter((learner) => learner.learnerId),
      contacts: contactMap.get(row.guardian_id) ?? fallbackContacts,
      addresses: addressMap.get(row.guardian_id) ?? [],
    };
  });
}

export async function getGuardianDirectory(schoolId: string): Promise<GuardianDirectoryRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data: scoped, error } = await supabase.rpc("search_guardian_directory", {
    p_school_id: schoolId,
    p_query: null,
    p_limit: 200,
  });
  if (error) throw new Error("Unable to load the guardian directory.");
  return hydrateGuardianRows(supabase, (scoped ?? []) as ScopedGuardian[]);
}

export async function getGuardianDirectoryPage(
  schoolId: string,
  options: { query?: string; page?: number; pageSize?: number } = {},
): Promise<GuardianDirectoryPage> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(options.page ?? 1, 1);
  const pageSize = Math.min(Math.max(options.pageSize ?? 50, 1), 100);
  const { data: scoped, error } = await supabase.rpc("search_guardian_directory_page", {
    p_school_id: schoolId,
    p_query: options.query?.trim() || null,
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) throw new Error("Unable to load the guardian directory.");

  const rows = (scoped ?? []) as ScopedGuardian[];
  const total = rows.length ? Number(rows[0].total_count ?? 0) : 0;
  return {
    guardians: await hydrateGuardianRows(supabase, rows),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}