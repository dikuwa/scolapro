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

type GuardianDirectoryDetails = {
  guardian_id: string;
  preferred_name: string | null;
  identity_number: string | null;
  status: string;
  contacts: GuardianDirectoryContact[] | null;
  addresses: GuardianDirectoryAddress[] | null;
};

async function hydrateGuardianRows(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  schoolId: string,
  rows: ScopedGuardian[],
): Promise<GuardianDirectoryRow[]> {
  if (!rows.length) return [];
  const guardianIds = rows.map((row) => row.guardian_id);
  const { data: detailRows, error: hydrationError } = await supabase.rpc("get_guardian_directory_details", {
    p_school_id: schoolId,
    p_guardian_ids: guardianIds,
  });
  if (hydrationError) throw new Error("Unable to load guardian directory details.");

  const details = (detailRows ?? []) as GuardianDirectoryDetails[];
  const detailMap = new Map(details.map((detail) => [detail.guardian_id, detail]));

  return rows.map((row) => {
    const detail = detailMap.get(row.guardian_id);
    const fallbackContacts: GuardianDirectoryContact[] = [];
    if (row.primary_mobile) fallbackContacts.push({ id: `${row.guardian_id}-mobile`, type: "mobile", value: row.primary_mobile, primary: true, label: null });
    if (row.primary_email) fallbackContacts.push({ id: `${row.guardian_id}-email`, type: "email", value: row.primary_email, primary: true, label: null });

    return {
      guardianId: row.guardian_id,
      name: formatPersonName(row.guardian_name),
      preferredName: detail?.preferred_name ?? null,
      identityNumber: detail?.identity_number ?? null,
      status: detail?.status ?? "active",
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
      contacts: detail?.contacts?.length ? detail.contacts : fallbackContacts,
      addresses: detail?.addresses ?? [],
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
  return hydrateGuardianRows(supabase, schoolId, (scoped ?? []) as ScopedGuardian[]);
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
    guardians: await hydrateGuardianRows(supabase, schoolId, rows),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}