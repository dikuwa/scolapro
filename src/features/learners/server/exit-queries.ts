import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LearnerTransferHistory = {
  id: string;
  status: string;
  destinationName: string | null;
  destinationSchoolId: string | null;
  destinationAddress: string | null;
  requestedOn: string;
  effectiveOn: string | null;
  reason: string | null;
  decisionNote: string | null;
  completedAt: string | null;
  crcHandoffStatus: string;
};

export type LearnerCompletionCandidate = {
  id: string;
  status: string;
  outcome: string;
  academicYear: number;
  lockedAt: string | null;
};

export type LearnerTransferDestination = {
  schoolId: string;
  schoolName: string;
  emisNumber: string | null;
  town: string | null;
  physicalAddress: string | null;
};

export async function getLearnerExitOperations(learnerId: string, schoolId: string, enrolmentId: string) {
  const supabase = await createSupabaseServerClient();
  const [
    { data: transfers, error: transferError },
    { data: progressions, error: progressionError },
    { data: destinations, error: destinationError },
  ] = await Promise.all([
    supabase
      .from("transfer_events")
      .select("id,status,destination_name,destination_school_id,destination_address,requested_on,effective_on,reason,decision_note,completed_at,crc_handoff_status")
      .eq("learner_id", learnerId)
      .eq("source_school_id", schoolId)
      .eq("source_enrolment_id", enrolmentId)
      .order("requested_on", { ascending: false }),
    supabase
      .from("year_end_progressions")
      .select("id,status,outcome,academic_year,locked_at")
      .eq("learner_id", learnerId)
      .eq("school_id", schoolId)
      .eq("enrolment_id", enrolmentId)
      .eq("outcome", "completed")
      .eq("status", "locked")
      .limit(1),
    supabase.rpc("list_learner_transfer_destination_schools", { p_source_school_id: schoolId }),
  ]);

  if (transferError || progressionError || destinationError) {
    throw new Error("Unable to load learner exit history.");
  }

  return {
    transfers: (transfers ?? []).map((row) => ({
      id: row.id,
      status: row.status,
      destinationName: row.destination_name,
      destinationSchoolId: row.destination_school_id,
      destinationAddress: row.destination_address,
      requestedOn: row.requested_on,
      effectiveOn: row.effective_on,
      reason: row.reason,
      decisionNote: row.decision_note,
      completedAt: row.completed_at,
      crcHandoffStatus: row.crc_handoff_status ?? "not_required",
    })),
    completion: progressions?.[0]
      ? {
          id: progressions[0].id,
          status: progressions[0].status,
          outcome: progressions[0].outcome,
          academicYear: progressions[0].academic_year,
          lockedAt: progressions[0].locked_at,
        }
      : null,
    destinations: ((destinations ?? []) as Array<Record<string, unknown>>).map((row) => ({
      schoolId: String(row.school_id),
      schoolName: String(row.school_name ?? "School"),
      emisNumber: row.emis_number ? String(row.emis_number) : null,
      town: row.town ? String(row.town) : null,
      physicalAddress: row.physical_address ? String(row.physical_address) : null,
    })),
  };
}
