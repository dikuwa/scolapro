import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PreparationSubmissionSummary = {
  id: string;
  schoolId: string;
  academicYear: number;
  submittedByUserId: string;
  scopeKind: "selected_preparations" | "week" | "term";
  termLabel: string | null;
  weekStart: string | null;
  weekEnd: string | null;
  status: "submitted" | "reviewed" | "returned";
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  itemCount: number;
};

export type PreparationSubmissionItem = {
  id: string;
  lessonPreparationId: string;
  preparationStatusSnapshot: string;
};

export type PreparationReviewEvent = {
  id: string;
  eventKind: "submitted" | "reviewed" | "returned" | "commented";
  actorUserId: string;
  actorRoleSnapshot: string;
  comment: string | null;
  occurredAt: string;
};

export type TeachingReadinessException = {
  exceptionKind: string;
  subjectOfferingId: string | null;
  subjectId: string | null;
  registerClassId: string | null;
  teacherAllocationId: string | null;
  detail: string;
  severity: string;
};

type SubmissionRow = {
  id: string;
  school_id: string;
  academic_year: number;
  submitted_by_user_id: string;
  scope_kind: PreparationSubmissionSummary["scopeKind"];
  term_label: string | null;
  week_start: string | null;
  week_end: string | null;
  status: PreparationSubmissionSummary["status"];
  submitted_at: string;
  reviewed_at: string | null;
  review_note: string | null;
};

type ItemCountRow = { preparation_submission_id: string };
type SubmissionItemRow = {
  id: string;
  lesson_preparation_id: string;
  preparation_status_snapshot: string;
};
type ReviewEventRow = {
  id: string;
  event_kind: PreparationReviewEvent["eventKind"];
  actor_user_id: string;
  actor_role_snapshot: string;
  comment: string | null;
  occurred_at: string;
};
type ReadinessRow = {
  exception_kind: string;
  subject_offering_id: string | null;
  subject_id: string | null;
  register_class_id: string | null;
  teacher_allocation_id: string | null;
  detail: string;
  severity: string;
};

const SUBMISSION_SELECT =
  "id, school_id, academic_year, submitted_by_user_id, scope_kind, term_label, week_start, week_end, status, submitted_at, reviewed_at, review_note";

function toSummary(row: SubmissionRow, itemCount: number): PreparationSubmissionSummary {
  return {
    id: row.id,
    schoolId: row.school_id,
    academicYear: row.academic_year,
    submittedByUserId: row.submitted_by_user_id,
    scopeKind: row.scope_kind,
    termLabel: row.term_label,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    status: row.status,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    itemCount,
  };
}

export async function getHodReviewQueue(schoolId: string, academicYear: number) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("preparation_submissions")
    .select(SUBMISSION_SELECT)
    .eq("school_id", schoolId)
    .eq("academic_year", academicYear)
    .order("submitted_at", { ascending: false });

  if (error) throw new Error(`Unable to load preparation review queue: ${error.message}`);

  const rows = (data ?? []) as unknown as SubmissionRow[];
  const counts = new Map<string, number>();
  if (rows.length) {
    const { data: itemRows, error: itemError } = await supabase
      .from("preparation_submission_items")
      .select("preparation_submission_id")
      .in("preparation_submission_id", rows.map((row) => row.id));
    if (itemError) throw new Error(`Unable to load submission item counts: ${itemError.message}`);
    for (const item of (itemRows ?? []) as unknown as ItemCountRow[]) {
      counts.set(item.preparation_submission_id, (counts.get(item.preparation_submission_id) ?? 0) + 1);
    }
  }

  return rows.map((row) => toSummary(row, counts.get(row.id) ?? 0));
}

export async function getHodTeachingReadiness(schoolId: string, academicYear: number) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resolve_hod_teaching_readiness", {
    p_school_id: schoolId,
    p_academic_year: academicYear,
  });
  if (error) throw new Error(`Unable to resolve teaching readiness: ${error.message}`);

  return ((data ?? []) as unknown as ReadinessRow[]).map<TeachingReadinessException>((row) => ({
    exceptionKind: row.exception_kind,
    subjectOfferingId: row.subject_offering_id,
    subjectId: row.subject_id,
    registerClassId: row.register_class_id,
    teacherAllocationId: row.teacher_allocation_id,
    detail: row.detail,
    severity: row.severity,
  }));
}

export async function getHodReviewDetail(schoolId: string, submissionId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: submissionData, error: submissionError } = await supabase
    .from("preparation_submissions")
    .select(SUBMISSION_SELECT)
    .eq("id", submissionId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (submissionError) throw new Error(`Unable to load preparation submission: ${submissionError.message}`);
  if (!submissionData) return null;

  const [itemsResult, eventsResult] = await Promise.all([
    supabase
      .from("preparation_submission_items")
      .select("id, lesson_preparation_id, preparation_status_snapshot")
      .eq("preparation_submission_id", submissionId)
      .order("created_at", { ascending: true }),
    supabase
      .from("preparation_review_events")
      .select("id, event_kind, actor_user_id, actor_role_snapshot, comment, occurred_at")
      .eq("preparation_submission_id", submissionId)
      .order("occurred_at", { ascending: true }),
  ]);

  if (itemsResult.error) throw new Error(`Unable to load preparation submission items: ${itemsResult.error.message}`);
  if (eventsResult.error) throw new Error(`Unable to load preparation review history: ${eventsResult.error.message}`);

  const items = ((itemsResult.data ?? []) as unknown as SubmissionItemRow[]).map<PreparationSubmissionItem>((row) => ({
    id: row.id,
    lessonPreparationId: row.lesson_preparation_id,
    preparationStatusSnapshot: row.preparation_status_snapshot,
  }));
  const history = ((eventsResult.data ?? []) as unknown as ReviewEventRow[]).map<PreparationReviewEvent>((row) => ({
    id: row.id,
    eventKind: row.event_kind,
    actorUserId: row.actor_user_id,
    actorRoleSnapshot: row.actor_role_snapshot,
    comment: row.comment,
    occurredAt: row.occurred_at,
  }));

  return {
    submission: toSummary(submissionData as unknown as SubmissionRow, items.length),
    items,
    history,
  };
}

export async function reviewPreparationSubmission(
  submissionId: string,
  action: "reviewed" | "returned",
  comment: string | null,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("review_preparation_submission", {
    p_submission_id: submissionId,
    p_action: action,
    p_comment: comment,
  });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("The review action was not accepted.");
}
