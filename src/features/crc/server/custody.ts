import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CrcCustodyRecord = {
  custodyId: string;
  custodyStatus: string;
  learnerName: string;
  admissionNumber: string | null;
  originSchoolName: string;
  receivingSchoolName: string;
  receivingUserName: string;
  custodyNote: string | null;
  preparedAt: string;
  updatedAt: string;
  outgoing: boolean;
  incoming: boolean;
};

export type CrcCustodyDestination = {
  schoolId: string;
  schoolName: string;
  schoolTown: string | null;
};

export type CrcCustodyReceiver = {
  userId: string;
  displayName: string;
  roleKey: string;
};

export type CrcCustodyLearner = {
  learnerId: string;
  learnerName: string;
  admissionNumber: string | null;
  gradeLabel: string | null;
};

type RpcRow = Record<string, unknown>;

function rpcRows<T>(data: unknown): T[] {
  return (data ?? []) as T[];
}

export async function getMyCrcCustodyRecords(): Promise<CrcCustodyRecord[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_my_crc_custody_records");
  if (error) throw new Error("Unable to load CRC custody records.");
  return rpcRows<RpcRow>(data).map((row) => ({
    custodyId: String(row.custody_id),
    custodyStatus: String(row.custody_status),
    learnerName: String(row.learner_name ?? "Learner"),
    admissionNumber: row.admission_number ? String(row.admission_number) : null,
    originSchoolName: String(row.origin_school_name ?? "School"),
    receivingSchoolName: String(row.receiving_school_name ?? "School"),
    receivingUserName: String(row.receiving_user_name ?? "Custodian"),
    custodyNote: row.custody_note ? String(row.custody_note) : null,
    preparedAt: String(row.prepared_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    outgoing: Boolean(row.outgoing),
    incoming: Boolean(row.incoming),
  }));
}

export async function getCrcCustodyDestinations(): Promise<CrcCustodyDestination[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_crc_custody_destination_schools");
  if (error) throw new Error("Unable to load CRC custody destinations.");
  return rpcRows<RpcRow>(data).map((row) => ({
    schoolId: String(row.school_id),
    schoolName: String(row.school_name),
    schoolTown: row.school_town ? String(row.school_town) : null,
  }));
}

export async function searchCrcCustodyLearners(query: string): Promise<CrcCustodyLearner[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_crc_custody_learners", { p_query: query });
  if (error) throw new Error("Unable to search learners for custody.");
  return rpcRows<RpcRow>(data).map((row) => ({
    learnerId: String(row.learner_id),
    learnerName: String(row.learner_name ?? "Learner"),
    admissionNumber: row.admission_number ? String(row.admission_number) : null,
    gradeLabel: row.grade_label ? String(row.grade_label) : null,
  }));
}

export async function searchCrcCustodyReceivers(schoolId: string): Promise<CrcCustodyReceiver[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_crc_custody_receivers", { p_school_id: schoolId });
  if (error) throw new Error("Unable to load receiving custodians.");
  return rpcRows<RpcRow>(data).map((row) => ({
    userId: String(row.user_id),
    displayName: String(row.display_name ?? "Custodian"),
    roleKey: String(row.role_key ?? ""),
  }));
}