import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ConductManagementView = {
  academicYear: number;
  summary: {
    active_learners: number;
    learners_with_records: number;
    recognition_count: number;
    violation_count: number;
    attention_event_count: number;
    learners_with_repeated_patterns: number;
  };
  learners: Array<{
    learner_id: string;
    learner_name: string;
    grade_id: string | null;
    grade_name: string | null;
    class_id: string | null;
    class_name: string | null;
    recognition_count: number;
    violation_count: number;
    recognition_points: number;
    violation_points: number;
    net_points: number;
    attention_event_count: number;
    repeated_pattern_count: number;
    last_event_on: string | null;
  }>;
  hasMore: boolean;
  policyUsage: Array<{
    type: "recognition" | "violation";
    group_name: string;
    item_name: string;
    event_count: number;
    learner_count: number;
    points: number;
  }>;
};

export async function getConductManagementView(
  schoolId: string,
  academicYear: number,
  filters: {
    query: string;
    gradeId: string | null;
    classId: string | null;
    attentionOnly: boolean;
    repeatedOnly: boolean;
    page: number;
  },
): Promise<ConductManagementView> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("get_conduct_management_view", {
    p_school_id: schoolId,
    p_academic_year: academicYear,
    p_query: filters.query,
    p_grade_id: filters.gradeId,
    p_class_id: filters.classId,
    p_attention_only: filters.attentionOnly,
    p_repeated_only: filters.repeatedOnly,
    p_page: filters.page,
  });
  if (error || !data) throw new Error("Unable to load Conduct management.");
  return data as ConductManagementView;
}
