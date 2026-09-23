import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TeachingPlanDocumentRow = {
  sequence: number;
  term: string;
  week: string;
  dateRange: string;
  topic: string;
  topicNumber: string;
  generalObjectives: string[];
  competencies: string[];
  plannedDate: string | null;
  completedDate: string | null;
  note: string | null;
};

export type TeachingPlanDocumentEvent = {
  term: string;
  dateRange: string;
  title: string;
  note: string | null;
};

export type TeachingPlanDocument = {
  planId: string;
  schoolId: string;
  academicYear: number;
  subject: string;
  grade: string;
  classes: string[];
  curriculumVersion: string | null;
  status: string;
  isClassVariant: boolean;
  rows: TeachingPlanDocumentRow[];
  events: TeachingPlanDocumentEvent[];
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function weekOf(date: string | null, termStart: string | null): string {
  if (!date || !termStart || date < termStart) return "—";
  const start = new Date(`${termStart}T12:00:00Z`).getTime();
  const value = new Date(`${date}T12:00:00Z`).getTime();
  return String(Math.floor((value - start) / 604_800_000) + 1);
}

function range(start: string | null, end: string | null): string {
  if (!start) return "—";
  return end && end !== start ? `${start} – ${end}` : start;
}

export async function getTeachingPlanDocument(
  schoolId: string,
  planId: string,
): Promise<TeachingPlanDocument | null> {
  const db = await createSupabaseServerClient();
  const { data: plan } = await db
    .from("pacing_plans")
    .select("id,school_id,academic_year,subject_offering_id,curriculum_version_id,plan_level,register_class_id,status")
    .eq("id", planId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!plan) return null;

  const [{ data: offering }, { data: version }, { data: items }, { data: events }, { data: academicYear }] = await Promise.all([
    db.from("subject_offerings").select("id,subject_id,grade_id").eq("id", plan.subject_offering_id).eq("school_id", schoolId).maybeSingle(),
    db.from("curriculum_versions").select("version_key").eq("id", plan.curriculum_version_id).maybeSingle(),
    db.from("pacing_plan_items").select("id,curriculum_unit_id,academic_term_id,planned_start_on,planned_end_on,completed_on,sequence_number,notes,curriculum_units(unit_code,topic)").eq("pacing_plan_id", plan.id).order("sequence_number").order("id"),
    db.from("pacing_plan_events").select("academic_term_id,title,notes,starts_on,ends_on").eq("pacing_plan_id", plan.id).order("starts_on").order("id"),
    db.from("academic_years").select("id").eq("school_id", schoolId).eq("year", plan.academic_year).maybeSingle(),
  ]);
  if (!offering) return null;

  const [{ data: subject }, { data: grade }, { data: allocations }, { data: variantClass }, { data: terms }] = await Promise.all([
    db.from("subjects").select("display_name").eq("id", offering.subject_id).eq("school_id", schoolId).maybeSingle(),
    db.from("grades").select("display_name").eq("id", offering.grade_id).eq("school_id", schoolId).maybeSingle(),
    db.from("teacher_allocations").select("register_classes(display_name)").eq("subject_offering_id", offering.id).eq("school_id", schoolId),
    plan.register_class_id ? db.from("register_classes").select("display_name").eq("id", plan.register_class_id).eq("school_id", schoolId).maybeSingle() : Promise.resolve({ data: null }),
    academicYear?.id ? db.from("academic_terms").select("id,display_name,starts_on,ends_on,term_number").eq("academic_year_id", academicYear.id).order("term_number") : Promise.resolve({ data: [] }),
  ]);

  const termById = new Map((terms ?? []).map((term) => [term.id, term] as const));
  const itemIds = (items ?? []).map((item) => item.curriculum_unit_id);
  const [{ data: objectives }, { data: competencies }] = itemIds.length
    ? await Promise.all([
        db.from("curriculum_objectives").select("curriculum_unit_id,objective_text,sequence_number").in("curriculum_unit_id", itemIds).order("sequence_number"),
        db.from("curriculum_competencies").select("curriculum_unit_id,competency_text,sequence_number").in("curriculum_unit_id", itemIds).order("sequence_number"),
      ])
    : [{ data: [] }, { data: [] }];

  const objectivesByUnit = new Map<string, string[]>();
  for (const row of objectives ?? []) objectivesByUnit.set(row.curriculum_unit_id, [...(objectivesByUnit.get(row.curriculum_unit_id) ?? []), row.objective_text]);
  const competenciesByUnit = new Map<string, string[]>();
  for (const row of competencies ?? []) competenciesByUnit.set(row.curriculum_unit_id, [...(competenciesByUnit.get(row.curriculum_unit_id) ?? []), row.competency_text]);

  const classes = plan.plan_level === "class"
    ? [variantClass?.display_name ?? "Class pacing variant"]
    : [...new Set((allocations ?? []).map((allocation) => one(allocation.register_classes)?.display_name).filter((value): value is string => Boolean(value)))];

  return {
    planId: plan.id,
    schoolId,
    academicYear: plan.academic_year,
    subject: subject?.display_name ?? "Subject",
    grade: grade?.display_name ?? "Grade",
    classes,
    curriculumVersion: version?.version_key ?? null,
    status: plan.status,
    isClassVariant: plan.plan_level === "class",
    rows: (items ?? []).map((item) => {
      const unit = one(item.curriculum_units);
      const term = item.academic_term_id ? termById.get(item.academic_term_id) ?? null : null;
      return {
        sequence: item.sequence_number,
        term: term?.display_name ?? "Unassigned",
        week: weekOf(item.planned_start_on, term?.starts_on ?? null),
        dateRange: range(item.planned_start_on, item.planned_end_on),
        topic: unit?.topic ?? "Curriculum topic",
        topicNumber: unit?.unit_code ?? "—",
        generalObjectives: objectivesByUnit.get(item.curriculum_unit_id) ?? [],
        competencies: competenciesByUnit.get(item.curriculum_unit_id) ?? [],
        plannedDate: item.planned_start_on,
        completedDate: item.completed_on,
        note: item.notes,
      };
    }),
    events: (events ?? []).map((event) => ({
      term: event.academic_term_id ? termById.get(event.academic_term_id)?.display_name ?? "Unassigned" : "Unassigned",
      dateRange: range(event.starts_on, event.ends_on),
      title: event.title,
      note: event.notes,
    })),
  };
}
