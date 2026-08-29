import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DetentionHistoryItem = {
  id: string;
  learnerId: string;
  learnerName: string;
  admissionNumber: string | null;
  gradeName: string | null;
  className: string | null;
  qualifyingWeekStart: string;
  qualifyingLateCount: number;
  dueOn: string;
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
    .limit(200);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    learnerId: row.learner_id,
    learnerName: `${row.first_names} ${row.surname}`.trim(),
    admissionNumber: row.admission_number,
    gradeName: row.grade_name,
    className: row.class_name,
    qualifyingWeekStart: row.qualifying_week_start,
    qualifyingLateCount: row.qualifying_late_count,
    dueOn: row.due_on,
    status: row.status,
    completedAt: row.completed_at,
    resolutionNote: row.resolution_note,
    detentionSessionCount: row.detention_session_count ?? 0,
    latestSessionDate: row.latest_session_date,
    latestRecordedOutcome: row.latest_recorded_outcome,
    createdAt: row.created_at,
  }));
}
