import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProfileChangeRequestRow = {
  id: string;
  learnerId: string;
  learnerName: string;
  targetType: string;
  fieldKey: string;
  currentValue: string | null;
  proposedValue: string | null;
  reason: string | null;
  sourceCategory: string;
  evidenceReference: string | null;
  requestedByUserId: string;
  status: string;
  requestedAt: string;
  reviewNote: string | null;
};

export async function getSchoolProfileChangeRequests(schoolId: string): Promise<ProfileChangeRequestRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data: requests, error } = await supabase
    .from("profile_change_requests")
    .select("id,learner_id,target_type,field_key,current_value,proposed_value,reason,source_category,evidence_reference,requested_by_user_id,status,requested_at,review_note")
    .eq("school_id", schoolId)
    .order("requested_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("Unable to load data correction requests.");

  const learnerIds = [...new Set((requests ?? []).map((row) => row.learner_id))];
  const { data: learners, error: learnerError } = learnerIds.length
    ? await supabase.from("learners").select("id,first_names,surname").in("id", learnerIds)
    : { data: [], error: null };
  if (learnerError) throw new Error("Unable to load learners for data correction requests.");

  const names = new Map((learners ?? []).map((learner) => [learner.id, `${learner.first_names} ${learner.surname}`.trim()]));
  return (requests ?? []).map((row) => ({
    id: row.id,
    learnerId: row.learner_id,
    learnerName: names.get(row.learner_id) ?? "Learner",
    targetType: row.target_type,
    fieldKey: row.field_key,
    currentValue: row.current_value,
    proposedValue: row.proposed_value,
    reason: row.reason,
    sourceCategory: row.source_category ?? "teacher_observation",
    evidenceReference: row.evidence_reference,
    requestedByUserId: row.requested_by_user_id,
    status: row.status,
    requestedAt: row.requested_at,
    reviewNote: row.review_note,
  }));
}

export async function getLearnerProfileChangeRequests(learnerId: string): Promise<ProfileChangeRequestRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profile_change_requests")
    .select("id,learner_id,target_type,field_key,current_value,proposed_value,reason,source_category,evidence_reference,requested_by_user_id,status,requested_at,review_note")
    .eq("learner_id", learnerId)
    .order("requested_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Unable to load learner correction requests.");
  return (data ?? []).map((row) => ({
    id: row.id,
    learnerId: row.learner_id,
    learnerName: "Learner",
    targetType: row.target_type,
    fieldKey: row.field_key,
    currentValue: row.current_value,
    proposedValue: row.proposed_value,
    reason: row.reason,
    sourceCategory: row.source_category ?? "teacher_observation",
    evidenceReference: row.evidence_reference,
    requestedByUserId: row.requested_by_user_id,
    status: row.status,
    requestedAt: row.requested_at,
    reviewNote: row.review_note,
  }));
}