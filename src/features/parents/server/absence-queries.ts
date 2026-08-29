import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AbsenceNoticeSummary = {
  id: string;
  learnerId: string;
  learnerName: string;
  absenceFrom: string;
  absenceTo: string;
  reasonCategory: string;
  message: string | null;
  status: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  attachmentCount: number;
};

export type AbsenceAttachment = {
  id: string;
  noticeId: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
};

export async function getParentAbsenceNotices(): Promise<AbsenceNoticeSummary[]> {
  const supabase = await createSupabaseServerClient();

  const { data: notices } = await supabase
    .from("guardian_absence_notices")
    .select(`
      id, learner_id, absence_from, absence_to, reason_category, message,
      status, review_note, reviewed_at, created_at,
      learners!inner(id, first_names, surname),
      guardian_absence_notice_attachments(id)
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!notices?.length) return [];

  return notices.map((row) => {
    const learner = Array.isArray(row.learners) ? row.learners[0] : row.learners;
    return {
      id: row.id,
      learnerId: row.learner_id,
      learnerName: learner ? `${learner.first_names} ${learner.surname}` : "Unknown",
      absenceFrom: row.absence_from,
      absenceTo: row.absence_to,
      reasonCategory: row.reason_category,
      message: row.message,
      status: row.status,
      reviewNote: row.review_note,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
      attachmentCount: row.guardian_absence_notice_attachments?.length ?? 0,
    };
  });
}

export async function getSchoolAbsenceNotices(schoolId: string): Promise<AbsenceNoticeSummary[]> {
  const supabase = await createSupabaseServerClient();

  const { data: notices } = await supabase
    .from("guardian_absence_notices")
    .select(`
      id, learner_id, absence_from, absence_to, reason_category, message,
      status, review_note, reviewed_at, created_at,
      learners!inner(id, first_names, surname),
      guardian_absence_notice_attachments(id)
    `)
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (!notices?.length) return [];

  return notices.map((row) => {
    const learner = Array.isArray(row.learners) ? row.learners[0] : row.learners;
    return {
      id: row.id,
      learnerId: row.learner_id,
      learnerName: learner ? `${learner.first_names} ${learner.surname}` : "Unknown",
      absenceFrom: row.absence_from,
      absenceTo: row.absence_to,
      reasonCategory: row.reason_category,
      message: row.message,
      status: row.status,
      reviewNote: row.review_note,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
      attachmentCount: row.guardian_absence_notice_attachments?.length ?? 0,
    };
  });
}
