import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProfessionalFileReviewQueueRow = {
  id: string;
  documentTitle: string;
  originalFilename: string;
  teacherName: string;
  subjectName: string;
  submittedAt: string;
  status: string;
};

export type ProfessionalFileReviewEvent = {
  id: string;
  eventKind: string;
  actorRole: string;
  comment: string | null;
  occurredAt: string;
};

export type ProfessionalFileReviewDetail = {
  id: string;
  status: string;
  documentId: string;
  documentTitle: string;
  originalFilename: string;
  categoryLabel: string | null;
  mimeType: string;
  fileSize: number;
  teacherName: string;
  subjectName: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  viewHref: string;
  downloadHref: string;
  events: ProfessionalFileReviewEvent[];
};

function one<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function teacherName(row: { first_name?: string | null; last_name?: string | null } | null) {
  return [row?.first_name, row?.last_name].filter(Boolean).join(" ") || "Teacher";
}

export async function getProfessionalFileReviewQueue(): Promise<ProfessionalFileReviewQueueRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("teacher_professional_document_review_submissions")
    .select(`
      id,status,submitted_at,
      subject:subjects(display_name),
      owner:staff_members(first_name,last_name),
      document:teacher_professional_documents(title,original_filename)
    `)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false });
  if (error) return [];

  return (data ?? []).map((row) => {
    const subject = one(row.subject);
    const owner = one(row.owner);
    const document = one(row.document);
    return {
      id: row.id,
      documentTitle: document?.title || document?.original_filename || "Professional document",
      originalFilename: document?.original_filename || "Document",
      teacherName: teacherName(owner),
      subjectName: subject?.display_name || "Subject",
      submittedAt: row.submitted_at,
      status: row.status,
    };
  });
}

export async function getProfessionalFileReviewDetail(
  submissionId: string,
): Promise<ProfessionalFileReviewDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("teacher_professional_document_review_submissions")
    .select(`
      id,status,document_id,submitted_at,reviewed_at,review_note,
      subject:subjects(display_name),
      owner:staff_members(first_name,last_name),
      document:teacher_professional_documents(
        id,title,original_filename,category_label,mime_type,file_size
      ),
      events:teacher_professional_document_review_events(
        id,event_kind,actor_role_snapshot,comment,occurred_at
      )
    `)
    .eq("id", submissionId)
    .maybeSingle();
  if (error || !data) return null;

  const subject = one(data.subject);
  const owner = one(data.owner);
  const document = one(data.document);
  if (!document) return null;
  const events = [...(data.events ?? [])]
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    .map((event) => ({
      id: event.id,
      eventKind: event.event_kind,
      actorRole: event.actor_role_snapshot,
      comment: event.comment,
      occurredAt: event.occurred_at,
    }));

  return {
    id: data.id,
    status: data.status,
    documentId: data.document_id,
    documentTitle: document.title || document.original_filename,
    originalFilename: document.original_filename,
    categoryLabel: document.category_label,
    mimeType: document.mime_type,
    fileSize: document.file_size,
    teacherName: teacherName(owner),
    subjectName: subject?.display_name || "Subject",
    submittedAt: data.submitted_at,
    reviewedAt: data.reviewed_at,
    reviewNote: data.review_note,
    viewHref: `/api/teaching/reviews/professional-files/${data.id}`,
    downloadHref: `/api/teaching/reviews/professional-files/${data.id}?download=1`,
    events,
  };
}
