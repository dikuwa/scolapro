import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DetentionLifecycleFilter = "all" | "outstanding" | "overdue" | "partial" | "completed";

export type DetentionObligationSummary = {
  outstandingObligations: number;
  overdueObligations: number;
  partialLearners: number;
  completedObligations: number;
  missedOutstandingObligations: number;
  multipleOutstandingLearners: number;
};

export type DetentionHistoryItem = {
  id: string;
  learnerId: string;
  learnerName: string;
  admissionNumber: string | null;
  gradeName: string | null;
  className: string | null;
  academicYear: number | null;
  triggeredOn: string | null;
  originalDueOn: string;
  dueOn: string;
  rolloverCount: number;
  assignedStaffMemberId: string | null;
  assignedStaffName: string | null;
  status: string;
  completedAt: string | null;
  resolutionNote: string | null;
  detentionSessionCount: number;
  latestSessionDate: string | null;
  latestRecordedOutcome: string | null;
  createdAt: string;
  currentlyEnrolled: boolean;
  missedSessionCount: number;
  learnerOutstandingCount: number;
  learnerOverdueCount: number;
  learnerCompletedCount: number;
  learnerMissedSessionCount: number;
};

type DetentionHistoryRpcRow = {
  id: string;
  learner_id: string;
  first_names: string | null;
  surname: string | null;
  admission_number: string | null;
  grade_name: string | null;
  class_name: string | null;
  academic_year: number | null;
  triggered_on: string | null;
  original_due_on: string | null;
  due_on: string;
  rollover_count: number | null;
  assigned_staff_member_id: string | null;
  supervisor_first_name: string | null;
  supervisor_last_name: string | null;
  status: string;
  completed_at: string | null;
  resolution_note: string | null;
  detention_session_count: number | null;
  latest_session_date: string | null;
  latest_recorded_outcome: string | null;
  created_at: string;
  currently_enrolled: boolean;
  missed_session_count: number | null;
  learner_outstanding_count: number | null;
  learner_overdue_count: number | null;
  learner_completed_count: number | null;
  learner_missed_session_count: number | null;
  total_learner_count: number | null;
};

type DetentionSummaryRpcRow = {
  outstanding_obligations: number | null;
  overdue_obligations: number | null;
  partial_learners: number | null;
  completed_obligations: number | null;
  missed_outstanding_obligations: number | null;
  multiple_outstanding_learners: number | null;
};

export type DetentionHistoryPage = {
  items: DetentionHistoryItem[];
  summary: DetentionObligationSummary;
  totalLearners: number;
  page: number;
  pageSize: number;
  query: string;
  lifecycle: DetentionLifecycleFilter;
};

export async function getDetentionHistoryPage(
  schoolId: string,
  {
    query = "",
    lifecycle = "all",
    page = 1,
    pageSize = 25,
  }: {
    query?: string;
    lifecycle?: DetentionLifecycleFilter;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<DetentionHistoryPage> {
  const supabase = await createSupabaseServerClient();
  const safePage = Math.max(1, Math.trunc(page) || 1);
  const safePageSize = Math.min(50, Math.max(1, Math.trunc(pageSize) || 25));
  const safeQuery = query.trim().slice(0, 120);

  const [historyResult, summaryResult] = await Promise.all([
    supabase.rpc("list_detention_obligation_tracking", {
      p_school_id: schoolId,
      p_query: safeQuery || null,
      p_lifecycle: lifecycle,
      p_page: safePage,
      p_page_size: safePageSize,
    }),
    supabase.rpc("get_detention_obligation_summary", {
      p_school_id: schoolId,
      p_query: safeQuery || null,
    }),
  ]);

  if (historyResult.error || summaryResult.error) {
    throw new Error("Unable to load detention obligation tracking.");
  }

  const rows = (historyResult.data ?? []) as DetentionHistoryRpcRow[];
  const summaryRow = ((summaryResult.data ?? []) as DetentionSummaryRpcRow[])[0];

  return {
    items: rows.map((row) => ({
      id: row.id,
      learnerId: row.learner_id,
      learnerName: `${row.first_names ?? ""} ${row.surname ?? ""}`.trim() || "Learner",
      admissionNumber: row.admission_number,
      gradeName: row.grade_name,
      className: row.class_name,
      academicYear: row.academic_year,
      triggeredOn: row.triggered_on,
      originalDueOn: row.original_due_on ?? row.due_on,
      dueOn: row.due_on,
      rolloverCount: row.rollover_count ?? 0,
      assignedStaffMemberId: row.assigned_staff_member_id,
      assignedStaffName: [row.supervisor_first_name, row.supervisor_last_name].filter(Boolean).join(" ") || null,
      status: row.status,
      completedAt: row.completed_at,
      resolutionNote: row.resolution_note,
      detentionSessionCount: row.detention_session_count ?? 0,
      latestSessionDate: row.latest_session_date,
      latestRecordedOutcome: row.latest_recorded_outcome,
      createdAt: row.created_at,
      currentlyEnrolled: Boolean(row.currently_enrolled),
      missedSessionCount: Number(row.missed_session_count ?? 0),
      learnerOutstandingCount: Number(row.learner_outstanding_count ?? 0),
      learnerOverdueCount: Number(row.learner_overdue_count ?? 0),
      learnerCompletedCount: Number(row.learner_completed_count ?? 0),
      learnerMissedSessionCount: Number(row.learner_missed_session_count ?? 0),
    })),
    summary: {
      outstandingObligations: Number(summaryRow?.outstanding_obligations ?? 0),
      overdueObligations: Number(summaryRow?.overdue_obligations ?? 0),
      partialLearners: Number(summaryRow?.partial_learners ?? 0),
      completedObligations: Number(summaryRow?.completed_obligations ?? 0),
      missedOutstandingObligations: Number(summaryRow?.missed_outstanding_obligations ?? 0),
      multipleOutstandingLearners: Number(summaryRow?.multiple_outstanding_learners ?? 0),
    },
    totalLearners: Number(rows[0]?.total_learner_count ?? 0),
    page: safePage,
    pageSize: safePageSize,
    query: safeQuery,
    lifecycle,
  };
}
