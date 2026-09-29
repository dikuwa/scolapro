import "server-only";

import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OperationalControlSheetEvent = {
  id: string;
  eventKind: string;
  actorRole: string;
  comment: string | null;
  occurredAt: string;
};

export type OperationalControlSheetRow = {
  id: string;
  source: "preparation_review" | "professional_file_review";
  label: string;
  reviewPeriod: string | null;
  status: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  itemCount: number | null;
  subjectLabel: string | null;
  events: OperationalControlSheetEvent[];
};

export type OperationalFileControlSheet = {
  preparationRows: OperationalControlSheetRow[];
  professionalFileRows: OperationalControlSheetRow[];
};

type EventRow = {
  id: string;
  event_kind: string;
  actor_role_snapshot: string;
  comment: string | null;
  occurred_at: string;
};

type PreparationSubmissionRow = {
  id: string;
  scope_kind: string;
  term_label: string | null;
  week_start: string | null;
  week_end: string | null;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  items: Array<{ id: string }> | null;
  events: EventRow[] | null;
};

type ProfessionalSubmissionRow = {
  id: string;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  subject: { display_name: string | null } | Array<{ display_name: string | null }> | null;
  document: { title: string | null; original_filename: string } | Array<{ title: string | null; original_filename: string }> | null;
  events: EventRow[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function dateLabel(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-NA", {
    timeZone: "Africa/Windhoek",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function scopeLabel(row: Pick<PreparationSubmissionRow, "scope_kind" | "term_label" | "week_start" | "week_end">): string | null {
  if (row.scope_kind === "week") {
    const start = dateLabel(row.week_start);
    const end = dateLabel(row.week_end);
    return start && end ? `${start} – ${end}` : "Weekly review";
  }
  if (row.scope_kind === "term") return row.term_label ? `Term: ${row.term_label}` : "Term review";
  if (row.scope_kind === "selected_preparations") return "Selected preparations";
  return null;
}

function events(rows: EventRow[] | null): OperationalControlSheetEvent[] {
  return [...(rows ?? [])]
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id))
    .map((event) => ({
      id: event.id,
      eventKind: event.event_kind,
      actorRole: event.actor_role_snapshot,
      comment: event.comment,
      occurredAt: event.occurred_at,
    }));
}

export async function getOperationalFileControlSheet(
  academicYear: number,
): Promise<OperationalFileControlSheet> {
  const context = await getUserContext();
  if (!context.user || context.platformMemberships.length) {
    return { preparationRows: [], professionalFileRows: [] };
  }

  const membership = context.currentSchoolMembership;
  if (
    !membership?.staffMemberId ||
    !["teacher", "class_teacher", "hod"].includes(membership.roleKey)
  ) {
    return { preparationRows: [], professionalFileRows: [] };
  }

  const db = await createSupabaseServerClient();
  const [preparationsResult, professionalResult] = await Promise.all([
    db
      .from("preparation_submissions")
      .select(`
        id,scope_kind,term_label,week_start,week_end,status,submitted_at,reviewed_at,review_note,
        items:preparation_submission_items(id),
        events:preparation_review_events(id,event_kind,actor_role_snapshot,comment,occurred_at)
      `)
      .eq("school_id", membership.schoolId)
      .eq("academic_year", academicYear)
      .eq("submitted_by_user_id", context.user.id)
      .order("submitted_at", { ascending: false })
      .limit(50),
    db
      .from("teacher_professional_document_review_submissions")
      .select(`
        id,status,submitted_at,reviewed_at,review_note,
        subject:subjects(display_name),
        document:teacher_professional_documents(title,original_filename),
        events:teacher_professional_document_review_events(id,event_kind,actor_role_snapshot,comment,occurred_at)
      `)
      .eq("school_id", membership.schoolId)
      .eq("owner_staff_member_id", membership.staffMemberId)
      .eq("submitted_by_user_id", context.user.id)
      .order("submitted_at", { ascending: false })
      .limit(50),
  ]);

  const preparationRows = preparationsResult.error
    ? []
    : ((preparationsResult.data ?? []) as unknown as PreparationSubmissionRow[]).map((row) => ({
        id: row.id,
        source: "preparation_review" as const,
        label: "Preparation File",
        reviewPeriod: scopeLabel(row),
        status: row.status,
        submittedAt: row.submitted_at,
        reviewedAt: row.reviewed_at,
        reviewNote: row.review_note,
        itemCount: row.items?.length ?? 0,
        subjectLabel: null,
        events: events(row.events),
      }));

  const professionalFileRows = professionalResult.error
    ? []
    : ((professionalResult.data ?? []) as unknown as ProfessionalSubmissionRow[]).map((row) => {
        const subject = one(row.subject);
        const document = one(row.document);
        return {
          id: row.id,
          source: "professional_file_review" as const,
          label: document?.title?.trim() || document?.original_filename || "Professional document",
          reviewPeriod: null,
          status: row.status,
          submittedAt: row.submitted_at,
          reviewedAt: row.reviewed_at,
          reviewNote: row.review_note,
          itemCount: null,
          subjectLabel: subject?.display_name ?? null,
          events: events(row.events),
        };
      });

  return { preparationRows, professionalFileRows };
}
