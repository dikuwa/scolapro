import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DneaReadinessScopeRow = {
  schoolId: string;
  schoolName: string;
  cycleId: string;
  cycleKey: string;
  cycleName: string;
  academicYear: number;
  candidateCount: number;
  readyCount: number;
  blockingCount: number;
  warningCount: number;
  accessScope: "school" | "network";
};

export type DneaCandidateReadinessRow = {
  candidateId: string;
  learnerName: string;
  candidateNumber: string | null;
  registrationStatus: string;
  identityVerified: boolean;
  subjectCount: number;
  subjects: Array<{ id: string; code: string; name: string | null; status: string }>;
  issues: Array<{ code: string; severity: string; message: string; subjectRegistrationId: string | null }>;
  isReady: boolean;
};

type ScopeRpcRow = {
  school_id: string; school_name: string; examination_cycle_id: string; cycle_key: string;
  cycle_name: string; academic_year: number; candidate_count: number; ready_count: number;
  blocking_count: number; warning_count: number; access_scope: "school" | "network";
};
type CandidateRpcRow = {
  candidate_id: string; learner_name: string; candidate_number: string | null; registration_status: string;
  identity_verified: boolean; subject_count: number; subjects: DneaCandidateReadinessRow["subjects"];
  unresolved_issues: DneaCandidateReadinessRow["issues"]; is_ready: boolean;
};

export async function getDneaReadinessScope(): Promise<DneaReadinessScopeRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_dnea_readiness_scope");
  if (error) throw new Error("Unable to load DNEA candidate readiness.");
  return ((data ?? []) as ScopeRpcRow[]).map((row) => ({
    schoolId: row.school_id, schoolName: row.school_name, cycleId: row.examination_cycle_id,
    cycleKey: row.cycle_key, cycleName: row.cycle_name, academicYear: row.academic_year,
    candidateCount: Number(row.candidate_count), readyCount: Number(row.ready_count),
    blockingCount: Number(row.blocking_count), warningCount: Number(row.warning_count), accessScope: row.access_scope,
  }));
}

export async function getDneaCandidateReadiness(cycleId: string): Promise<DneaCandidateReadinessRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_dnea_candidate_readiness", { p_cycle_id: cycleId });
  if (error) throw new Error("Unable to load school candidate readiness detail.");
  return ((data ?? []) as CandidateRpcRow[]).map((row) => ({
    candidateId: row.candidate_id, learnerName: row.learner_name, candidateNumber: row.candidate_number,
    registrationStatus: row.registration_status, identityVerified: row.identity_verified,
    subjectCount: Number(row.subject_count), subjects: row.subjects ?? [], issues: row.unresolved_issues ?? [], isReady: row.is_ready,
  }));
}
