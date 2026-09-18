import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TeachingPrintPlanItem = {
  sequence: number;
  topic: string;
  theme: string | null;
  start: string | null;
  end: string | null;
  periods: number;
};

export type TeachingPrintPack = {
  preparationId: string;
  preparationStatus: string;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  schoolId: string;
  academicYear: number;
  termName: string | null;
  teacherName: string;
  subjectName: string;
  gradeName: string;
  className: string;
  plannedOn: string;
  plannedPeriods: number;
  curriculumVersion: string | null;
  theme: string | null;
  topic: string | null;
  objectives: string[];
  competencies: string[];
  preparation: Record<string, string>;
  coverage: {
    taughtOn: string;
    periodsUsed: number;
    state: string;
    reflection: string | null;
    compensatoryAction: string | null;
  } | null;
  plan: {
    id: string;
    level: string;
    status: string;
    items: TeachingPrintPlanItem[];
  };
};

function record(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      item == null ? "" : String(item),
    ]),
  );
}

export async function getTeachingPrintPack(
  schoolId: string,
  preparationId: string,
): Promise<TeachingPrintPack | null> {
  const db = await createSupabaseServerClient();

  const { data: prep, error: prepError } = await db
    .from("lesson_preparations")
    .select("id,school_id,teaching_schedule_item_id,status,preparation,curriculum_snapshot,review_note,submitted_at,reviewed_at")
    .eq("id", preparationId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (prepError || !prep) return null;

  const { data: schedule } = await db
    .from("teaching_schedule_items")
    .select("id,pacing_plan_item_id,teacher_allocation_id,planned_on,planned_period_count")
    .eq("id", prep.teaching_schedule_item_id)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!schedule) return null;

  const [{ data: planItem }, { data: allocation }, { data: actuals }] = await Promise.all([
    db
      .from("pacing_plan_items")
      .select("id,pacing_plan_id,curriculum_unit_id")
      .eq("id", schedule.pacing_plan_item_id)
      .maybeSingle(),
    db
      .from("teacher_allocations")
      .select("id,staff_member_id,subject_offering_id,register_class_id,academic_year")
      .eq("id", schedule.teacher_allocation_id)
      .eq("school_id", schoolId)
      .maybeSingle(),
    db
      .from("teaching_actuals")
      .select("taught_on,periods_used,coverage_state,reflection,compensatory_action,recorded_at")
      .eq("teaching_schedule_item_id", schedule.id)
      .order("recorded_at", { ascending: false })
      .limit(1),
  ]);
  if (!planItem || !allocation) return null;

  const [{ data: plan }, { data: offering }, { data: klass }, { data: staff }, { data: unit }] =
    await Promise.all([
      db
        .from("pacing_plans")
        .select("id,plan_level,status,curriculum_version_id")
        .eq("id", planItem.pacing_plan_id)
        .eq("school_id", schoolId)
        .maybeSingle(),
      db
        .from("subject_offerings")
        .select("id,subject_id,grade_id,curriculum_version_id")
        .eq("id", allocation.subject_offering_id)
        .eq("school_id", schoolId)
        .maybeSingle(),
      db
        .from("register_classes")
        .select("id,display_name")
        .eq("id", allocation.register_class_id)
        .eq("school_id", schoolId)
        .maybeSingle(),
      db
        .from("staff_members")
        .select("id,first_name,last_name")
        .eq("id", allocation.staff_member_id)
        .maybeSingle(),
      db
        .from("curriculum_units")
        .select("id,theme,topic")
        .eq("id", planItem.curriculum_unit_id)
        .maybeSingle(),
    ]);
  if (!plan || !offering) return null;

  const [{ data: subject }, { data: grade }, { data: version }, { data: objectives }, { data: competencies }, { data: planItemsRaw }, { data: academicYear }] =
    await Promise.all([
      db.from("subjects").select("display_name").eq("id", offering.subject_id).maybeSingle(),
      db.from("grades").select("display_name").eq("id", offering.grade_id).maybeSingle(),
      db
        .from("curriculum_versions")
        .select("version_key")
        .eq("id", plan.curriculum_version_id ?? offering.curriculum_version_id)
        .maybeSingle(),
      db
        .from("curriculum_objectives")
        .select("objective_text,sequence_number")
        .eq("curriculum_unit_id", planItem.curriculum_unit_id)
        .order("sequence_number"),
      db
        .from("curriculum_competencies")
        .select("competency_text,sequence_number")
        .eq("curriculum_unit_id", planItem.curriculum_unit_id)
        .order("sequence_number"),
      db
        .from("pacing_plan_items")
        .select("sequence_number,planned_start_on,planned_end_on,planned_periods,curriculum_units(theme,topic)")
        .eq("pacing_plan_id", plan.id)
        .order("sequence_number"),
      db
        .from("academic_years")
        .select("id")
        .eq("school_id", schoolId)
        .eq("year", allocation.academic_year)
        .maybeSingle(),
    ]);

  let termName: string | null = null;
  if (academicYear?.id) {
    const { data: term } = await db
      .from("academic_terms")
      .select("display_name")
      .eq("academic_year_id", academicYear.id)
      .lte("starts_on", schedule.planned_on)
      .gte("ends_on", schedule.planned_on)
      .limit(1)
      .maybeSingle();
    termName = term?.display_name ?? null;
  }

  const planItems: TeachingPrintPlanItem[] = (planItemsRaw ?? []).map((item) => {
    const linked = Array.isArray(item.curriculum_units) ? item.curriculum_units[0] : item.curriculum_units;
    return {
      sequence: item.sequence_number,
      topic: linked?.topic ?? "Curriculum unit",
      theme: linked?.theme ?? null,
      start: item.planned_start_on,
      end: item.planned_end_on,
      periods: item.planned_periods,
    };
  });

  const snapshot = record(prep.curriculum_snapshot);
  const latestActual = actuals?.[0] ?? null;

  return {
    preparationId: prep.id,
    preparationStatus: prep.status,
    reviewNote: prep.review_note,
    submittedAt: prep.submitted_at,
    reviewedAt: prep.reviewed_at,
    schoolId,
    academicYear: allocation.academic_year,
    termName,
    teacherName: [staff?.first_name, staff?.last_name].filter(Boolean).join(" ") || "Teacher",
    subjectName: subject?.display_name ?? "Subject",
    gradeName: grade?.display_name ?? "Grade",
    className: klass?.display_name ?? "Class",
    plannedOn: schedule.planned_on,
    plannedPeriods: schedule.planned_period_count,
    curriculumVersion: version?.version_key ?? snapshot.curriculumVersion ?? null,
    theme: unit?.theme ?? snapshot.theme ?? null,
    topic: unit?.topic ?? snapshot.topic ?? null,
    objectives: (objectives ?? []).map((row) => row.objective_text),
    competencies: (competencies ?? []).map((row) => row.competency_text),
    preparation: record(prep.preparation),
    coverage: latestActual
      ? {
          taughtOn: latestActual.taught_on,
          periodsUsed: latestActual.periods_used,
          state: latestActual.coverage_state,
          reflection: latestActual.reflection,
          compensatoryAction: latestActual.compensatory_action,
        }
      : null,
    plan: {
      id: plan.id,
      level: plan.plan_level,
      status: plan.status,
      items: planItems,
    },
  };
}
