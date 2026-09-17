"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const REVIEWER_ROLES = new Set(["school_admin", "principal", "deputy_principal", "hod"]);

export type ReviewSubmissionSummary = {
  id: string;
  academicYear: number;
  scopeKind: string;
  status: "submitted" | "reviewed" | "returned";
  termLabel: string | null;
  weekStart: string | null;
  weekEnd: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  preparationCount: number;
  subjectNames: string[];
  subjectIds: string[];
};

export type ReviewHistoryEvent = {
  id: string;
  eventKind: "submitted" | "reviewed" | "returned" | "commented";
  actorRole: string;
  comment: string | null;
  occurredAt: string;
};

export type ReviewSubmissionDetail = ReviewSubmissionSummary & {
  items: Array<{
    id: string;
    lessonPreparationId: string;
    preparationStatusSnapshot: string;
    plannedOn: string | null;
    preparationStatus: string | null;
    registerClassId: string | null;
    subjectName: string | null;
    subjectId: string | null;
  }>;
  history: ReviewHistoryEvent[];
};

export type TeachingReadinessException = {
  exceptionKind: string;
  subjectOfferingId: string | null;
  subjectId: string | null;
  registerClassId: string | null;
  teacherAllocationId: string | null;
  detail: string | null;
  severity: string | null;
};

type SubjectRelation = { display_name?: string | null } | Array<{ display_name?: string | null }> | null;
type OfferingRelation = {
  subject_id?: string | null;
  subjects?: SubjectRelation;
} | Array<{
  subject_id?: string | null;
  subjects?: SubjectRelation;
}> | null;
type AllocationRelation = { subject_offerings?: OfferingRelation } | Array<{ subject_offerings?: OfferingRelation }> | null;
type ScheduleRelation = {
  register_class_id?: string | null;
  teacher_allocations?: AllocationRelation;
} | Array<{
  register_class_id?: string | null;
  teacher_allocations?: AllocationRelation;
}> | null;
type PreparationRelation = {
  id?: string;
  planned_on?: string | null;
  status?: string | null;
  teaching_schedule_items?: ScheduleRelation;
} | Array<{
  id?: string;
  planned_on?: string | null;
  status?: string | null;
  teaching_schedule_items?: ScheduleRelation;
}> | null;
type SubmissionItemRow = {
  id: string;
  lesson_preparation_id: string;
  preparation_status_snapshot: string;
  lesson_preparations?: PreparationRelation;
};
type SubmissionRow = {
  id: string;
  academic_year: number;
  scope_kind: string;
  status: "submitted" | "reviewed" | "returned";
  term_label: string | null;
  week_start: string | null;
  week_end: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  preparation_submission_items?: SubmissionItemRow[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function subjectForItem(item: SubmissionItemRow) {
  const preparation = one(item.lesson_preparations);
  const schedule = one(preparation?.teaching_schedule_items);
  const allocation = one(schedule?.teacher_allocations);
  const offering = one(allocation?.subject_offerings);
  const subject = one(offering?.subjects);
  return {
    preparation,
    schedule,
    subjectId: offering?.subject_id ?? null,
    subjectName: subject?.display_name ?? null,
  };
}

function mapSubmission(row: SubmissionRow): ReviewSubmissionSummary {
  const items = row.preparation_submission_items ?? [];
  const subjects = items.map(subjectForItem);
  return {
    id: row.id,
    academicYear: row.academic_year,
    scopeKind: row.scope_kind,
    status: row.status,
    termLabel: row.term_label,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    preparationCount: items.length,
    subjectNames: [...new Set(subjects.map((item) => item.subjectName).filter((value): value is string => Boolean(value)))],
    subjectIds: [...new Set(subjects.map((item) => item.subjectId).filter((value): value is string => Boolean(value)))],
  };
}

const submissionSelect = `
  id,
  academic_year,
  scope_kind,
  status,
  term_label,
  week_start,
  week_end,
  submitted_at,
  reviewed_at,
  review_note,
  preparation_submission_items(
    id,
    lesson_preparation_id,
    preparation_status_snapshot,
    lesson_preparations(
      id,
      planned_on,
      status,
      teaching_schedule_items(
        register_class_id,
        teacher_allocations(
          subject_offerings(
            subject_id,
            subjects(display_name)
          )
        )
      )
    )
  )
`;

export async function requireTeachingReviewer(nextPath = "/teaching/reviews") {
  const context = await getUserContext();
  if (!context.user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);

  // Teaching review is a school-operational surface. Platform personas,
  // including Platform Support, never enter it. The database remains the
  // authoritative scope boundary for current placement and HOD subject scope.
  if (context.platformMemberships.length) redirect("/");

  const membership = context.currentSchoolMembership;
  if (!membership || !REVIEWER_ROLES.has(membership.roleKey)) redirect("/teaching");
  return { context, membership };
}

export async function getReviewQueue(schoolId: string, academicYear: number) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("preparation_submissions")
    .select(submissionSelect)
    .eq("school_id", schoolId)
    .eq("academic_year", academicYear)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true });

  if (error) throw new Error(`Unable to load preparation review queue: ${error.message}`);
  return ((data ?? []) as unknown as SubmissionRow[]).map(mapSubmission);
}

export async function getTeachingReadiness(schoolId: string, academicYear: number) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resolve_hod_teaching_readiness", {
    p_school_id: schoolId,
    p_academic_year: academicYear,
  });
  if (error) throw new Error(`Unable to load teaching readiness: ${error.message}`);

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    exceptionKind: String(row.exception_kind ?? "unknown"),
    subjectOfferingId: typeof row.subject_offering_id === "string" ? row.subject_offering_id : null,
    subjectId: typeof row.subject_id === "string" ? row.subject_id : null,
    registerClassId: typeof row.register_class_id === "string" ? row.register_class_id : null,
    teacherAllocationId: typeof row.teacher_allocation_id === "string" ? row.teacher_allocation_id : null,
    detail: typeof row.detail === "string" ? row.detail : null,
    severity: typeof row.severity === "string" ? row.severity : null,
  })) satisfies TeachingReadinessException[];
}

export async function getReviewSubmission(schoolId: string, submissionId: string): Promise<ReviewSubmissionDetail | null> {
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, historyResult] = await Promise.all([
    supabase
      .from("preparation_submissions")
      .select(submissionSelect)
      .eq("school_id", schoolId)
      .eq("id", submissionId)
      .maybeSingle(),
    supabase
      .from("preparation_review_events")
      .select("id,event_kind,actor_role_snapshot,comment,occurred_at")
      .eq("school_id", schoolId)
      .eq("preparation_submission_id", submissionId)
      .order("occurred_at", { ascending: true }),
  ]);

  if (error) throw new Error(`Unable to load preparation submission: ${error.message}`);
  if (!data) return null;
  if (historyResult.error) throw new Error(`Unable to load review history: ${historyResult.error.message}`);

  const row = data as unknown as SubmissionRow;
  const summary = mapSubmission(row);
  const items = (row.preparation_submission_items ?? []).map((item) => {
    const subject = subjectForItem(item);
    return {
      id: item.id,
      lessonPreparationId: item.lesson_preparation_id,
      preparationStatusSnapshot: item.preparation_status_snapshot,
      plannedOn: subject.preparation?.planned_on ?? null,
      preparationStatus: subject.preparation?.status ?? null,
      registerClassId: subject.schedule?.register_class_id ?? null,
      subjectName: subject.subjectName,
      subjectId: subject.subjectId,
    };
  });

  return {
    ...summary,
    items,
    history: ((historyResult.data ?? []) as Array<Record<string, unknown>>).map((event) => ({
      id: String(event.id),
      eventKind: String(event.event_kind) as ReviewHistoryEvent["eventKind"],
      actorRole: String(event.actor_role_snapshot ?? "unknown"),
      comment: typeof event.comment === "string" ? event.comment : null,
      occurredAt: String(event.occurred_at),
    })),
  };
}

const reviewSchema = z.object({
  submissionId: z.string().uuid(),
  schoolId: z.string().uuid(),
  action: z.enum(["reviewed", "returned"]),
  comment: z.string().trim().max(4000).optional(),
});

export async function reviewPreparationSubmissionAction(formData: FormData) {
  const parsed = reviewSchema.safeParse({
    submissionId: formData.get("submissionId"),
    schoolId: formData.get("schoolId"),
    action: formData.get("action"),
    comment: String(formData.get("comment") ?? ""),
  });
  if (!parsed.success) redirect("/teaching/reviews?error=Invalid%20review%20request");

  const { membership } = await requireTeachingReviewer(`/teaching/reviews/${parsed.data.submissionId}`);
  if (membership.schoolId !== parsed.data.schoolId) redirect("/teaching/reviews?error=School%20scope%20changed");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_preparation_submission", {
    p_submission_id: parsed.data.submissionId,
    p_action: parsed.data.action,
    p_comment: parsed.data.comment || null,
  });

  if (error) {
    redirect(`/teaching/reviews/${parsed.data.submissionId}?error=${encodeURIComponent(error.message || "Review could not be saved")}`);
  }

  revalidatePath("/teaching/reviews");
  revalidatePath(`/teaching/reviews/${parsed.data.submissionId}`);
  redirect(`/teaching/reviews/${parsed.data.submissionId}?saved=${parsed.data.action}`);
}
