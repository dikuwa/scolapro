import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LearnerTransferHistory = { id: string; status: string; destinationName: string | null; destinationSchoolId: string | null; requestedOn: string; effectiveOn: string | null; reason: string | null; decisionNote: string | null; completedAt: string | null };
export type LearnerCompletionCandidate = { id: string; status: string; outcome: string; academicYear: number; lockedAt: string | null };

export async function getLearnerExitOperations(learnerId: string, schoolId: string, enrolmentId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: transfers, error: transferError }, { data: progressions, error: progressionError }] = await Promise.all([
    supabase.from("transfer_events").select("id,status,destination_name,destination_school_id,requested_on,effective_on,reason,decision_note,completed_at").eq("learner_id", learnerId).eq("source_school_id", schoolId).eq("source_enrolment_id", enrolmentId).order("requested_on", { ascending: false }),
    supabase.from("year_end_progressions").select("id,status,outcome,academic_year,locked_at").eq("learner_id", learnerId).eq("school_id", schoolId).eq("enrolment_id", enrolmentId).eq("outcome", "completed").eq("status", "locked").limit(1),
  ]);
  if (transferError || progressionError) throw new Error("Unable to load learner exit history.");
  return {
    transfers: (transfers ?? []).map((row) => ({ id: row.id, status: row.status, destinationName: row.destination_name, destinationSchoolId: row.destination_school_id, requestedOn: row.requested_on, effectiveOn: row.effective_on, reason: row.reason, decisionNote: row.decision_note, completedAt: row.completed_at })),
    completion: progressions?.[0] ? { id: progressions[0].id, status: progressions[0].status, outcome: progressions[0].outcome, academicYear: progressions[0].academic_year, lockedAt: progressions[0].locked_at } : null,
  };
}
