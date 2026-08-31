import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  total_learner_count: number | null;
};

export type DetentionHistoryPage = {
  items: DetentionHistoryItem[];
  totalLearners: number;
  page: number;
  pageSize: number;
  query: string;
};

export async function getDetentionHistoryPage(
  schoolId: string,
  { query = "", page = 1, pageSize = 25 }: { query?: string; page?: number; pageSize?: number } = {},
): Promise<DetentionHistoryPage> {
  const supabase = await createSupabaseServerClient();
  const safePage = Math.max(1, Math.trunc(page) || 1);
  const safePageSize = Math.min(50, Math.max(1, Math.trunc(pageSize) || 25));
  const safeQuery = query.trim().slice(0, 120);

  const { data, error } = await supabase.rpc("list_detention_history_page", {
    p_school_id: schoolId,
    p_query: safeQuery || null,
    p_page: safePage,
    p_page_size: safePageSize,
  });
  if (error) throw new Error(error.message || "Unable to load detention history.");

  const rows = (data ?? []) as DetentionHistoryRpcRow[];
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
    })),
    totalLearners: Number(rows[0]?.total_learner_count ?? 0),
    page: safePage,
    pageSize: safePageSize,
    query: safeQuery,
  };
}
