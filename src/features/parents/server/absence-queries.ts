import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatLearnerName } from "@/lib/person-name";

export type AbsenceHistoryEvent = {
  id: string;
  eventType: "submitted" | "reviewed" | "resubmitted" | "withdrawn";
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: string;
};

export type AbsenceNoticePage = {
  notices: AbsenceNoticeSummary[];
  hasMore: boolean;
};

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
  attachments: AbsenceAttachment[];
  history: AbsenceHistoryEvent[];
};

export type AbsenceAttachment = {
  id: string;
  noticeId: string;
  fileName: string;
  mimeType: string;
};

export async function getParentAbsenceNotices(): Promise<AbsenceNoticeSummary[]> {
  const supabase = await createSupabaseServerClient();

  const { data: notices, error } = await supabase
    .from("guardian_absence_notices")
    .select(`
      id, learner_id, absence_from, absence_to, reason_category, message,
      status, review_note, reviewed_at, created_at,
      learners!inner(id, first_names, surname),
      guardian_absence_notice_attachments(id, file_name, mime_type),
      guardian_absence_notice_events(id, event_type, from_status, to_status, note, created_at)
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error("Unable to load your absence notices.");
  if (!notices?.length) return [];

  return notices.map((row) => {
    const learner = Array.isArray(row.learners) ? row.learners[0] : row.learners;
    return {
      id: row.id,
      learnerId: row.learner_id,
      learnerName: formatLearnerName(learner?.first_names, learner?.surname),
      absenceFrom: row.absence_from,
      absenceTo: row.absence_to,
      reasonCategory: row.reason_category,
      message: row.message,
      status: row.status,
      reviewNote: row.review_note,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
      attachmentCount: row.guardian_absence_notice_attachments?.length ?? 0,
      attachments: (row.guardian_absence_notice_attachments ?? []).map((attachment) => ({
        id: attachment.id,
        noticeId: row.id,
        fileName: attachment.file_name,
        mimeType: attachment.mime_type,
      })),
      history: [...(row.guardian_absence_notice_events ?? [])]
        .sort((left, right) => left.created_at.localeCompare(right.created_at))
        .map((event) => ({
          id: event.id,
          eventType: event.event_type as AbsenceHistoryEvent["eventType"],
          fromStatus: event.from_status,
          toStatus: event.to_status,
          note: event.note,
          createdAt: event.created_at,
        })),
    };
  });
}

export async function getSchoolAbsenceNotices(
  schoolId: string,
  options: { offset?: number; limit?: number; from?: string; to?: string } = {},
): Promise<AbsenceNoticePage> {
  const supabase = await createSupabaseServerClient();
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));

  let query = supabase
    .from("guardian_absence_notices")
    .select(`
      id, learner_id, absence_from, absence_to, reason_category, message,
      status, review_note, reviewed_at, created_at,
      learners!inner(id, first_names, surname),
      guardian_absence_notice_attachments(id, file_name, mime_type),
      guardian_absence_notice_events(id, event_type, from_status, to_status, note, created_at)
    `)
    .eq("school_id", schoolId);
  // Paginate the date-overlapping set on the server: a fixed newest-100 window
  // silently dropped older notices that still fall inside the reviewed period.
  if (options.from) query = query.gte("absence_to", options.from);
  if (options.to) query = query.lte("absence_from", options.to);
  const { data: notices } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit);

  if (!notices?.length) return { notices: [], hasMore: false };
  const pageRows = notices.slice(0, limit);

  return {
    hasMore: notices.length > limit,
    notices: pageRows.map((row) => {
      const learner = Array.isArray(row.learners) ? row.learners[0] : row.learners;
      return {
        id: row.id,
        learnerId: row.learner_id,
        learnerName: formatLearnerName(learner?.first_names, learner?.surname),
        absenceFrom: row.absence_from,
        absenceTo: row.absence_to,
        reasonCategory: row.reason_category,
        message: row.message,
        status: row.status,
        reviewNote: row.review_note,
        reviewedAt: row.reviewed_at,
        createdAt: row.created_at,
        attachmentCount: row.guardian_absence_notice_attachments?.length ?? 0,
        attachments: (row.guardian_absence_notice_attachments ?? []).map((attachment) => ({
          id: attachment.id,
          noticeId: row.id,
          fileName: attachment.file_name,
          mimeType: attachment.mime_type,
        })),
        history: [...(row.guardian_absence_notice_events ?? [])]
          .sort((left, right) => left.created_at.localeCompare(right.created_at))
          .map((event) => ({
            id: event.id,
            eventType: event.event_type as AbsenceHistoryEvent["eventType"],
            fromStatus: event.from_status,
            toStatus: event.to_status,
            note: event.note,
            createdAt: event.created_at,
          })),
      };
    }),
  };
}
