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

export async function getDetentionHistory(schoolId: string): Promise<DetentionHistoryItem[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("late_detention_history")
    .select("*")
    .eq("school_id", schoolId)
    .order("due_on", { ascending: false })
    .limit(500);

  if (error || !data) return [];

  return data.map((row) => ({
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
  }));
}
