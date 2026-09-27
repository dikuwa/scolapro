import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LearnerConductProfile = {
  academicYear: number;
  summary: {
    recognition_count: number;
    violation_count: number;
    recognition_points: number;
    violation_points: number;
    net_points: number;
  };
  breakdown: Array<{
    type: "recognition" | "violation";
    group_name: string;
    event_count: number;
    points: number;
  }>;
  terms: Array<{
    term_number: number;
    display_name: string;
    starts_on: string | null;
    ends_on: string | null;
    recognition_count: number;
    violation_count: number;
    recognition_points: number;
    violation_points: number;
    net_points: number;
  }>;
  timeline: Array<{
    id: string;
    event_date: string;
    type: "recognition" | "violation";
    group_name: string;
    item_name: string;
    points: number;
    severity: string | null;
    note: string | null;
    recorded_by: string;
    created_at: string;
    term_number: number | null;
  }>;
  hasMore: boolean;
};

export async function getLearnerConductProfile(
  schoolId: string,
  learnerId: string,
  academicYear: number,
  page: number,
): Promise<LearnerConductProfile> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("get_learner_conduct_profile", {
    p_school_id: schoolId,
    p_learner_id: learnerId,
    p_academic_year: academicYear,
    p_page: page,
  });
  if (error || !data) throw new Error("Unable to load the learner conduct profile.");
  return data as LearnerConductProfile;
}
