import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ExaminationCycle = {
  id: string;
  year: number;
  name: string;
  authority: string;
  status: string;
};

export type ExaminationCandidate = {
  id: string;
  learnerName: string;
  admissionNumber: string | null;
  grade: string;
  registerClass: string;
  candidateNumber: string | null;
  centreNumber: string | null;
  registrationStatus: string;
  identityVerified: boolean;
  assignedAt: string | null;
  source: string | null;
  note: string | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export async function getExaminationCandidateWorkspace(schoolId: string, selectedCycleId?: string) {
  const supabase = await createSupabaseServerClient();
  const { data: cycleRows, error: cycleError } = await supabase
    .from("examination_cycles")
    .select("id,academic_year,display_name,authority,status")
    .eq("school_id", schoolId)
    .order("academic_year", { ascending: false })
    .order("display_name");
  if (cycleError) throw new Error("Unable to load examination cycles.");

  const cycles: ExaminationCycle[] = (cycleRows ?? []).map((cycle) => ({
    id: cycle.id,
    year: cycle.academic_year,
    name: cycle.display_name,
    authority: cycle.authority,
    status: cycle.status,
  }));
  const cycleId = selectedCycleId && cycles.some((cycle) => cycle.id === selectedCycleId) ? selectedCycleId : cycles[0]?.id ?? null;
  if (!cycleId) return { cycles, selectedCycleId: null, candidates: [] as ExaminationCandidate[] };

  const { data, error } = await supabase
    .from("examination_candidates")
    .select("id,candidate_number,centre_number,registration_status,identity_verified,candidate_number_assigned_at,candidate_number_source,candidate_number_note,learners!inner(first_names,surname),enrolments!inner(admission_number,grades(display_name),register_classes(display_name))")
    .eq("school_id", schoolId)
    .eq("examination_cycle_id", cycleId)
    .order("created_at");
  if (error) throw new Error("Unable to load examination candidates.");

  const candidates: ExaminationCandidate[] = (data ?? []).map((candidate) => {
    const learner = one(candidate.learners);
    const enrolment = one(candidate.enrolments);
    return {
      id: candidate.id,
      learnerName: learner ? `${learner.first_names} ${learner.surname}`.trim() : "Learner",
      admissionNumber: enrolment?.admission_number ?? null,
      grade: one(enrolment?.grades)?.display_name ?? "Unassigned",
      registerClass: one(enrolment?.register_classes)?.display_name ?? "Unassigned",
      candidateNumber: candidate.candidate_number,
      centreNumber: candidate.centre_number,
      registrationStatus: candidate.registration_status,
      identityVerified: candidate.identity_verified,
      assignedAt: candidate.candidate_number_assigned_at,
      source: candidate.candidate_number_source,
      note: candidate.candidate_number_note,
    };
  });
  candidates.sort((a, b) => a.learnerName.localeCompare(b.learnerName));
  return { cycles, selectedCycleId: cycleId, candidates };
}

