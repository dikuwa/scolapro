"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/get-user-context";

export interface ReviewQueueRow {
  id: string;
  scopeKind: string;
  termLabel: string | null;
  weekStart: string | null;
  weekEnd: string | null;
  status: string;
  submittedBy: string;
  submittedAt: string;
  subjectLabel: string;
  teacherName: string;
  itemCount: number;
}

export interface ReviewEvent {
  id: string;
  eventKind: string;
  actorRoleSnapshot: string;
  actorStaffMemberId: string | null;
  comment: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface ReviewSubmissionItem {
  lessonPreparationId: string;
  preparationStatusSnapshot: string;
  subjectLabel: string;
  registerClassLabel: string;
  teacherName: string;
  plannedOn: string | null;
}

export interface ReviewDetail {
  submission: {
    id: string;
    scopeKind: string;
    termLabel: string | null;
    weekStart: string | null;
    weekEnd: string | null;
    status: string;
    submittedBy: string;
    submittedAt: string;
    academicYear: number;
    reviewedBy: string | null;
    reviewedAt: string | null;
    reviewNote: string | null;
  };
  items: ReviewSubmissionItem[];
  events: ReviewEvent[];
}

export interface ReadinessException {
  exceptionKind: string;
  subjectOfferingId: string | null;
  subjectId: string | null;
  registerClassId: string | null;
  teacherAllocationId: string | null;
  detail: string;
  severity: string;
}

export async function getReviewQueue(
  schoolId: string,
  academicYear: number,
  roleKey: string,
  membershipId: string,
): Promise<{ rows: ReviewQueueRow[]; exceptions: ReadinessException[] }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { rows: [], exceptions: [] };

  const isHod = roleKey === "hod";
  const isLeadership = ["school_admin", "principal", "deputy_principal"].includes(roleKey);

  const queueQuery = supabase
    .from("preparation_submissions")
    .select(`
      id, scope_kind, term_label, week_start, week_end, status,
      submitted_by_user_id, submitted_at, academic_year,
      reviewed_by_user_id, reviewed_at, review_note,
      submitted_by:submitted_by_user_id(display_name),
      items:preparation_submission_items(
        id, lesson_preparation_id, preparation_status_snapshot,
        lesson_preparation:lesson_preparations(
          id, status, planned_on,
          teaching_schedule_item:teaching_schedule_items(
            id, register_class:register_classes(display_name),
            teacher_allocation:teacher_allocations(
              id, teacher:teacher_allocations_teacher_id(display_name)
            ),
            subject_offering:subject_offerings(
              id, subject:subjects(display_name)
            )
          )
        )
      )
    `)
    .eq("school_id", schoolId)
    .eq("academic_year", academicYear)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false });

  const { data: submissions, error } = await queueQuery;
  if (error) return { rows: [], exceptions: [] };

  const rows: ReviewQueueRow[] = (submissions ?? []).map((sub: any) => {
    const items = sub.items ?? [];
    const firstItem = items[0];
    const subjectLabel = firstItem?.lesson_preparation?.teaching_schedule_item?.subject_offering?.subject?.display_name ?? "";
    const teacherName = firstItem?.lesson_preparation?.teaching_schedule_item?.teacher_allocation?.teacher?.display_name ?? "";
    return {
      id: sub.id,
      scopeKind: sub.scope_kind,
      termLabel: sub.term_label,
      weekStart: sub.week_start,
      weekEnd: sub.week_end,
      status: sub.status,
      submittedBy: sub.submitted_by?.display_name ?? "",
      submittedAt: sub.submitted_at,
      subjectLabel,
      teacherName,
      itemCount: items.length,
    };
  });

  const exceptions = await getReadinessExceptions(schoolId, academicYear, roleKey);

  return { rows, exceptions };
}

export async function getReviewDetail(submissionId: string): Promise<ReviewDetail | null> {
  const supabase = await createSupabaseServerClient();
  const context = await getUserContext();
  if (!context.user) return null;

  const canReview = await checkCanReadSubmission(submissionId);
  if (!canReview) return null;

  const { data: submission, error } = await supabase
    .from("preparation_submissions")
    .select(`
      id, scope_kind, term_label, week_start, week_end, status,
      submitted_by_user_id, submitted_at, academic_year,
      reviewed_by_user_id, reviewed_at, review_note,
      submitted_by:submitted_by_user_id(display_name),
      items:preparation_submission_items(
        id, lesson_preparation_id, preparation_status_snapshot,
        lesson_preparation:lesson_preparations(
          id, status, planned_on,
          teaching_schedule_item:teaching_schedule_items(
            id, register_class:register_classes(display_name),
            teacher_allocation:teacher_allocations(
              id, teacher:teacher_allocations_teacher_id(display_name)
            )
          )
        )
      ),
      events:preparation_review_events(
        id, event_kind, actor_role_snapshot, actor_staff_member_id,
        comment, occurred_at, metadata
      )
    `)
    .eq("id", submissionId)
    .single();

  if (error || !submission) return null;

  const events: ReviewEvent[] = (submission.events ?? []).map((e: any) => ({
    id: e.id,
    eventKind: e.event_kind,
    actorRoleSnapshot: e.actor_role_snapshot,
    actorStaffMemberId: e.actor_staff_member_id,
    comment: e.comment,
    occurredAt: e.occurred_at,
    metadata: e.metadata ?? {},
  }));

  const items: ReviewSubmissionItem[] = (submission.items ?? []).map((item: any) => {
    const lp = item.lesson_preparation ?? {};
    const tsi = lp.teaching_schedule_item ?? {};
    const ta = tsi.teacher_allocation ?? {};
    const so = tsi.subject_offering ?? {};
    return {
      lessonPreparationId: lp.id,
      preparationStatusSnapshot: item.preparation_status_snapshot,
      subjectLabel: so.subject?.display_name ?? "",
      registerClassLabel: tsi.register_class?.display_name ?? "",
      teacherName: ta.teacher?.display_name ?? "",
      plannedOn: lp.planned_on,
    };
  });

  return {
    submission: {
      id: submission.id,
      scopeKind: submission.scope_kind,
      termLabel: submission.term_label,
      weekStart: submission.week_start,
      weekEnd: submission.week_end,
      status: submission.status,
      submittedBy: submission.submitted_by?.display_name ?? "",
      submittedAt: submission.submitted_at,
      academicYear: submission.academic_year,
      reviewedBy: submission.reviewed_by_user_id,
      reviewedAt: submission.reviewed_at,
      reviewNote: submission.review_note,
    },
    items,
    events,
  };
}

async function checkCanReadSubmission(submissionId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: result } = await supabase.rpc("app_private.can_read_preparation_submission", { p_submission_id: submissionId });
  return result === true;
}

async function getReadinessExceptions(
  schoolId: string,
  academicYear: number,
  roleKey: string,
): Promise<ReadinessException[]> {
  const supabase = await createSupabaseServerClient();
  const isHod = roleKey === "hod";
  const isLeadership = ["school_admin", "principal", "deputy_principal"].includes(roleKey);
  const isPlatform = isLeadership || isHod;

  if (!isPlatform) return [];

  try {
    const { data, error } = await supabase.rpc("resolve_hod_teaching_readiness", {
      p_school_id: schoolId,
      p_academic_year: academicYear,
    });
    if (error || !data) return [];
    return data as ReadinessException[];
  } catch {
    return [];
  }
}
