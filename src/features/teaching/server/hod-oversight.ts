"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveReviewScope } from "@/features/teaching/server/review-queries";

export type HodTeachingOversightRow = {
  planId: string;
  subjectId: string;
  subjectName: string;
  gradeName: string | null;
  className: string | null;
  teacherName: string | null;
  planLevel: string;
  planStatus: string;
  planItemCount: number;
  scheduledLessonCount: number;
  submittedPreparationCount: number;
  reviewedPreparationCount: number;
  returnedPreparationCount: number;
  taughtLessonCount: number;
  reflectedLessonCount: number;
  latestTaughtOn: string | null;
};

type OversightRpcRow = {
  plan_id: string;
  subject_id: string;
  subject_name: string;
  grade_name: string | null;
  class_name: string | null;
  teacher_name: string | null;
  plan_level: string;
  plan_status: string;
  plan_item_count: number;
  scheduled_lesson_count: number;
  submitted_preparation_count: number;
  reviewed_preparation_count: number;
  returned_preparation_count: number;
  taught_lesson_count: number;
  reflected_lesson_count: number;
  latest_taught_on: string | null;
};

export type HodTeachingOversightResult =
  | { state: "ok"; schoolId: string; rows: HodTeachingOversightRow[] }
  | { state: "denied"; message: string }
  | { state: "unavailable"; message: string };

export async function getHodTeachingOversight(academicYear: number): Promise<HodTeachingOversightResult> {
  const scope = await resolveReviewScope();
  if (!scope || scope.roleKey !== "hod") {
    return { state: "denied", message: "A current governed HOD teaching scope is required." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resolve_hod_teaching_oversight", {
    p_school_id: scope.schoolId,
    p_academic_year: academicYear,
  });

  if (error) {
    return { state: "unavailable", message: "Teaching oversight could not be loaded from the governed teaching records." };
  }

  const rows = ((data ?? []) as OversightRpcRow[]).map((row) => ({
    planId: row.plan_id,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    gradeName: row.grade_name,
    className: row.class_name,
    teacherName: row.teacher_name,
    planLevel: row.plan_level,
    planStatus: row.plan_status,
    planItemCount: Number(row.plan_item_count),
    scheduledLessonCount: Number(row.scheduled_lesson_count),
    submittedPreparationCount: Number(row.submitted_preparation_count),
    reviewedPreparationCount: Number(row.reviewed_preparation_count),
    returnedPreparationCount: Number(row.returned_preparation_count),
    taughtLessonCount: Number(row.taught_lesson_count),
    reflectedLessonCount: Number(row.reflected_lesson_count),
    latestTaughtOn: row.latest_taught_on,
  }));

  return { state: "ok", schoolId: scope.schoolId, rows };
}
