"use server";

import { revalidatePath } from "next/cache";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LessonPreparationRow = {
  scheduleId: string;
  allocationId: string;
  subject: string;
  grade: string;
  className: string;
  plannedOn: string;
  periods: number;
  curriculumVersion: string | null;
  theme: string | null;
  topic: string | null;
  objectives: string[];
  competencies: string[];
  competencyOptions: Array<{ id: string; text: string }>;
  curriculumUnitId: string | null;
  subjectOfferingId: string | null;
  preparationId: string | null;
  preparationUpdatedAt: string | null;
  preparationStatus: string | null;
  preparation: Record<string, string>;
  selectedCompetencyIds: string[];
  sessionCount: number;
  actualReflection: string | null;
};

export type LessonPreparationTerm = { id: string; name: string; startsOn: string | null; endsOn: string | null };
export type LessonPreparationWorkspaceData = { schoolId: string; rows: LessonPreparationRow[]; terms: LessonPreparationTerm[] };
export type LessonPreparationActionState = { success?: boolean; message: string; updatedAt?: string };

type NamedRow = { id: string; display_name: string };
type PacingRow = { id: string; curriculum_unit_id: string };
type UnitRow = { id: string; curriculum_version_id: string; theme: string | null; topic: string | null };
type VersionRow = { id: string; version_key: string };
type ObjectiveRow = { curriculum_unit_id: string; objective_text: string; sequence_number: number };
type CompetencyRow = { id: string; curriculum_unit_id: string; competency_text: string; sequence_number: number };
type SubmissionItemRow = { lesson_preparation_id: string; preparation_submission_id: string };
type SubmissionRow = { id: string; status: string; submitted_at: string };

const editableStatuses = new Set(["draft", "prepared", "returned"]);
const teacherRoles = new Set(["teacher", "class_teacher"]);
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

async function teacherContext() {
  const context = await getUserContext();
  if (!context.user || context.platformMemberships.length) return null;
  const membership = context.memberships.find((item) => teacherRoles.has(item.roleKey));
  if (!membership) return null;
  const db = await createSupabaseServerClient();
  const { data: staff } = await db.from("staff_members").select("id").eq("user_id", context.user.id).maybeSingle();
  if (!staff) return null;
  return { context, membership, db, staffId: staff.id };
}

async function ownedSchedule(scheduleId: string) {
  const scope = await teacherContext();
  if (!scope) return null;
  const { data: schedule } = await scope.db.from("teaching_schedule_items")
    .select("id,tenant_id,school_id,academic_year,teacher_allocation_id,pacing_plan_item_id,planned_on,planned_period_count,status")
    .eq("id", scheduleId).maybeSingle();
  if (!schedule || schedule.school_id !== scope.membership.schoolId) return null;
  const { data: allocation } = await scope.db.from("teacher_allocations").select("id,staff_member_id,subject_offering_id,active_from,active_to")
    .eq("id", schedule.teacher_allocation_id).eq("staff_member_id", scope.staffId).maybeSingle();
  if (!allocation) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (allocation.active_from > today || (allocation.active_to && allocation.active_to < today)) return null;
  return { ...scope, schedule, allocation };
}

async function latestPreparationSubmissionStatus(
  db: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  lessonPreparationId: string,
): Promise<string | null> {
  const { data: items } = await db.from("preparation_submission_items")
    .select("preparation_submission_id")
    .eq("lesson_preparation_id", lessonPreparationId);
  const submissionIds = [...new Set((items ?? []).map((row) => row.preparation_submission_id))];
  if (!submissionIds.length) return null;
  const { data: submission } = await db.from("preparation_submissions")
    .select("status,submitted_at")
    .in("id", submissionIds)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return submission?.status ?? null;
}

async function curriculumSnapshot(db: Awaited<ReturnType<typeof createSupabaseServerClient>>, pacingPlanItemId: string) {
  const { data: item } = await db.from("pacing_plan_items").select("curriculum_unit_id").eq("id", pacingPlanItemId).maybeSingle();
  if (!item?.curriculum_unit_id) return {};
  const { data: unit } = await db.from("curriculum_units").select("id,curriculum_version_id,theme,topic").eq("id", item.curriculum_unit_id).maybeSingle();
  if (!unit) return {};
  const [{ data: version }, { data: objectives }, { data: competencies }] = await Promise.all([
    db.from("curriculum_versions").select("id,version_key").eq("id", unit.curriculum_version_id).maybeSingle(),
    db.from("curriculum_objectives").select("objective_text,sequence_number").eq("curriculum_unit_id", unit.id).order("sequence_number"),
    db.from("curriculum_competencies").select("id,competency_text,sequence_number").eq("curriculum_unit_id", unit.id).order("sequence_number"),
  ]);
  return {
    curriculumVersionId: version?.id ?? null,
    curriculumVersion: version?.version_key ?? null,
    curriculumUnitId: unit.id,
    theme: unit.theme ?? null,
    topic: unit.topic ?? null,
    generalObjectives: (objectives ?? []).map((row) => row.objective_text),
    competencies: (competencies ?? []).map((row) => row.competency_text),
    competencyOptions: (competencies ?? []).map((row) => ({ id: row.id, text: row.competency_text })),
  };
}

export async function getLessonPreparationWorkspace(): Promise<LessonPreparationWorkspaceData | null> {
  const scope = await teacherContext();
  if (!scope) return null;
  const year = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);
  const { data: allocations } = await scope.db.from("teacher_allocations")
    .select("id,subject_offering_id,register_class_id,active_from,active_to")
    .eq("school_id", scope.membership.schoolId).eq("staff_member_id", scope.staffId).eq("academic_year", year)
    .lte("active_from", today).or(`active_to.is.null,active_to.gte.${today}`);
  if (!allocations?.length) return { schoolId: scope.membership.schoolId, rows: [], terms: [] };

  const allocationIds = allocations.map((row) => row.id);
  const offeringIds = [...new Set(allocations.map((row) => row.subject_offering_id))];
  const classIds = [...new Set(allocations.map((row) => row.register_class_id))];
  const [{ data: schedules }, { data: offerings }, { data: classes }, { data: academicYear }] = await Promise.all([
    scope.db.from("teaching_schedule_items").select("id,teacher_allocation_id,pacing_plan_item_id,register_class_id,planned_on,planned_period_count,status")
      .in("teacher_allocation_id", allocationIds).in("status", ["planned", "prepared", "taught", "moved"]).order("planned_on"),
    scope.db.from("subject_offerings").select("id,subject_id,grade_id,curriculum_version_id").in("id", offeringIds),
    scope.db.from("register_classes").select("id,grade_id,display_name").in("id", classIds),
    scope.db.from("academic_years").select("id").eq("school_id", scope.membership.schoolId).eq("year", year).maybeSingle(),
  ]);

  const subjectIds = [...new Set((offerings ?? []).map((row) => row.subject_id))];
  const gradeIds = [...new Set((offerings ?? []).map((row) => row.grade_id))];
  const pacingIds = [...new Set((schedules ?? []).map((row) => row.pacing_plan_item_id))];
  const scheduleIds = (schedules ?? []).map((row) => row.id);

  let subjects: NamedRow[] = [];
  let grades: NamedRow[] = [];
  let pacing: PacingRow[] = [];
  let preparations: Array<{ id: string; teaching_schedule_item_id: string; status: string; preparation: unknown; curriculum_snapshot: unknown; updated_at: string; selected_competency_ids: string[] | null; session_count: number | null }> = [];
  let deliveries: Array<{ lesson_preparation_id: string; teaching_schedule_item_id: string; session_number: number }> = [];
  let actuals: Array<{ teaching_schedule_item_id: string; reflection: string | null; recorded_at: string }> = [];
  let terms: Array<{ id: string; display_name: string; starts_on: string | null; ends_on: string | null; term_number: number }> = [];

  if (subjectIds.length) subjects = ((await scope.db.from("subjects").select("id,display_name").in("id", subjectIds)).data ?? []) as NamedRow[];
  if (gradeIds.length) grades = ((await scope.db.from("grades").select("id,display_name").in("id", gradeIds)).data ?? []) as NamedRow[];
  if (pacingIds.length) pacing = ((await scope.db.from("pacing_plan_items").select("id,curriculum_unit_id").in("id", pacingIds)).data ?? []) as PacingRow[];
  if (scheduleIds.length) {
    deliveries = ((await scope.db.from("lesson_preparation_deliveries")
      .select("lesson_preparation_id,teaching_schedule_item_id,session_number")
      .in("teaching_schedule_item_id", scheduleIds)).data ?? []) as typeof deliveries;
    const linkedPreparationIds = [...new Set(deliveries.map((row) => row.lesson_preparation_id))];
    if (linkedPreparationIds.length) {
      preparations = ((await scope.db.from("lesson_preparations")
        .select("id,teaching_schedule_item_id,status,preparation,curriculum_snapshot,updated_at,selected_competency_ids,session_count")
        .in("id", linkedPreparationIds)).data ?? []) as typeof preparations;
    }
    actuals = ((await scope.db.from("teaching_actuals").select("teaching_schedule_item_id,reflection,recorded_at").in("teaching_schedule_item_id", scheduleIds).order("recorded_at", { ascending: false })).data ?? []) as typeof actuals;
  }
  if (academicYear) terms = ((await scope.db.from("academic_terms").select("id,display_name,starts_on,ends_on,term_number").eq("academic_year_id", academicYear.id).order("term_number")).data ?? []) as typeof terms;

  let submissionItems: SubmissionItemRow[] = [];
  let submissions: SubmissionRow[] = [];
  const preparationIds = preparations.map((row) => row.id);
  if (preparationIds.length) {
    submissionItems = ((await scope.db.from("preparation_submission_items")
      .select("lesson_preparation_id,preparation_submission_id")
      .in("lesson_preparation_id", preparationIds)).data ?? []) as SubmissionItemRow[];
    const submissionIds = [...new Set(submissionItems.map((row) => row.preparation_submission_id))];
    if (submissionIds.length) {
      submissions = ((await scope.db.from("preparation_submissions")
        .select("id,status,submitted_at")
        .in("id", submissionIds)
        .order("submitted_at", { ascending: false })).data ?? []) as SubmissionRow[];
    }
  }

  const unitIds = [...new Set(pacing.map((row) => row.curriculum_unit_id))];
  let units: UnitRow[] = [];
  let versions: VersionRow[] = [];
  let objectives: ObjectiveRow[] = [];
  let competencies: CompetencyRow[] = [];
  if (unitIds.length) {
    units = ((await scope.db.from("curriculum_units").select("id,curriculum_version_id,theme,topic").in("id", unitIds)).data ?? []) as UnitRow[];
    objectives = ((await scope.db.from("curriculum_objectives").select("curriculum_unit_id,objective_text,sequence_number").in("curriculum_unit_id", unitIds).order("sequence_number")).data ?? []) as ObjectiveRow[];
    competencies = ((await scope.db.from("curriculum_competencies").select("id,curriculum_unit_id,competency_text,sequence_number").in("curriculum_unit_id", unitIds).order("sequence_number")).data ?? []) as CompetencyRow[];
  }
  const versionIds = [...new Set(units.map((row) => row.curriculum_version_id))];
  if (versionIds.length) versions = ((await scope.db.from("curriculum_versions").select("id,version_key").in("id", versionIds)).data ?? []) as VersionRow[];

  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((row) => [row.id, row]));
  const allocationMap = byId(allocations);
  const offeringMap = byId(offerings ?? []);
  const classMap = byId(classes ?? []);
  const subjectMap = byId(subjects);
  const gradeMap = byId(grades);
  const pacingMap = byId(pacing);
  const unitMap = byId(units);
  const versionMap = byId(versions);
  const preparationById = new Map(preparations.map((row) => [row.id, row]));
  const preparationMap = new Map(deliveries.map((row) => [row.teaching_schedule_item_id, preparationById.get(row.lesson_preparation_id)] as const));
  const actualMap = new Map<string, string | null>();
  for (const actual of actuals) if (!actualMap.has(actual.teaching_schedule_item_id)) actualMap.set(actual.teaching_schedule_item_id, actual.reflection ?? null);

  const submissionStatusById = new Map(submissions.map((row) => [row.id, row.status]));
  const latestSubmissionStatusByPreparation = new Map<string, string>();
  for (const submission of submissions) {
    for (const item of submissionItems) {
      if (item.preparation_submission_id === submission.id && !latestSubmissionStatusByPreparation.has(item.lesson_preparation_id)) {
        latestSubmissionStatusByPreparation.set(item.lesson_preparation_id, submissionStatusById.get(submission.id) ?? submission.status);
      }
    }
  }

  const rows: LessonPreparationRow[] = (schedules ?? []).map((schedule) => {
    const allocation = allocationMap.get(schedule.teacher_allocation_id);
    const offering = allocation ? offeringMap.get(allocation.subject_offering_id) : undefined;
    const klass = classMap.get(schedule.register_class_id);
    const unit = unitMap.get(pacingMap.get(schedule.pacing_plan_item_id)?.curriculum_unit_id ?? "");
    const prep = preparationMap.get(schedule.id);
    const submissionStatus = prep ? latestSubmissionStatusByPreparation.get(prep.id) : undefined;
    return {
      scheduleId: schedule.id,
      allocationId: schedule.teacher_allocation_id,
      subject: subjectMap.get(offering?.subject_id ?? "")?.display_name ?? "Assigned subject",
      grade: gradeMap.get(offering?.grade_id ?? "")?.display_name ?? "Assigned grade",
      className: klass?.display_name ?? "Assigned class",
      plannedOn: schedule.planned_on,
      periods: schedule.planned_period_count,
      curriculumVersion: versionMap.get(unit?.curriculum_version_id ?? "")?.version_key ?? null,
      theme: unit?.theme ?? null,
      topic: unit?.topic ?? null,
      objectives: objectives.filter((row) => row.curriculum_unit_id === unit?.id).map((row) => row.objective_text),
      competencies: competencies.filter((row) => row.curriculum_unit_id === unit?.id).map((row) => row.competency_text),
      competencyOptions: competencies.filter((row) => row.curriculum_unit_id === unit?.id).map((row) => ({ id: row.id, text: row.competency_text })),
      curriculumUnitId: unit?.id ?? null,
      subjectOfferingId: offering?.id ?? null,
      preparationId: prep?.id ?? null,
      preparationUpdatedAt: prep?.updated_at ?? null,
      preparationStatus: submissionStatus === "returned" ? "returned" : prep?.status ?? null,
      preparation: (prep?.preparation && typeof prep.preparation === "object" ? prep.preparation : {}) as Record<string, string>,
      selectedCompetencyIds: prep?.selected_competency_ids ?? [],
      sessionCount: prep?.session_count ?? 1,
      actualReflection: actualMap.get(schedule.id) ?? null,
    };
  });

  return {
    schoolId: scope.membership.schoolId,
    rows,
    terms: terms.map((term) => ({ id: term.id, name: term.display_name, startsOn: term.starts_on, endsOn: term.ends_on })),
  };
}

async function preparationForSchedule(
  db: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  scheduleId: string,
) {
  const { data: delivery } = await db.from("lesson_preparation_deliveries")
    .select("lesson_preparation_id")
    .eq("teaching_schedule_item_id", scheduleId)
    .maybeSingle();
  if (delivery?.lesson_preparation_id) {
    return (await db.from("lesson_preparations")
      .select("id,status,prepared_by_user_id,teaching_schedule_item_id,selected_competency_ids,session_count,updated_at")
      .eq("id", delivery.lesson_preparation_id)
      .maybeSingle()).data;
  }
  return (await db.from("lesson_preparations")
    .select("id,status,prepared_by_user_id,teaching_schedule_item_id,selected_competency_ids,session_count,updated_at")
    .eq("teaching_schedule_item_id", scheduleId)
    .maybeSingle()).data;
}

async function savePreparation(
  scheduleId: string,
  preparation: Record<string, string>,
  selectedCompetencyIds: string[],
  sessionCount: number,
  status: "draft" | "prepared",
) {
  const owned = await ownedSchedule(scheduleId);
  if (!owned) return { message: "This lesson is outside your current teaching allocation." };
  const existing = await preparationForSchedule(owned.db, scheduleId);
  if (existing && !editableStatuses.has(existing.status)) {
    const latestSubmissionStatus = existing.status === "submitted" ? await latestPreparationSubmissionStatus(owned.db, existing.id) : null;
    if (latestSubmissionStatus !== "returned") return { message: "This preparation is already submitted or reviewed and cannot be changed here." };
  }
  const snapshot = await curriculumSnapshot(owned.db, owned.schedule.pacing_plan_item_id);
  const normalizedSessionCount = Math.max(1, Math.min(30, sessionCount || 1));
  const allowedCompetencyIds = new Set((snapshot.competencyOptions ?? []).map((item) => item.id));
  const selectedIds = [...new Set(selectedCompetencyIds.filter((id) => allowedCompetencyIds.has(id)))];
  if (!selectedIds.length && (snapshot.competencyOptions ?? []).length) {
    return { message: "Select at least one specific objective / basic competency for this preparation." };
  }
  const payload = {
    tenant_id: owned.schedule.tenant_id,
    school_id: owned.schedule.school_id,
    teaching_schedule_item_id: existing?.teaching_schedule_item_id ?? scheduleId,
    planned_on: owned.schedule.planned_on,
    academic_year: owned.schedule.academic_year,
    subject_offering_id: owned.allocation.subject_offering_id,
    curriculum_unit_id: snapshot.curriculumUnitId ?? null,
    curriculum_version_id: snapshot.curriculumVersionId ?? null,
    curriculum_snapshot: { ...snapshot, selectedCompetencyIds: selectedIds, sessionCount: normalizedSessionCount },
    preparation,
    selected_competency_ids: selectedIds,
    session_count: normalizedSessionCount,
    status,
    prepared_by_user_id: owned.context.user!.id,
    updated_at: new Date().toISOString(),
  };
  const { data: saved, error } = existing
    ? await owned.db.from("lesson_preparations").update(payload).eq("id", existing.id).select("id").single()
    : await owned.db.from("lesson_preparations").insert(payload).select("id").single();
  if (error || !saved) return { message: "Preparation could not be saved. Check your current allocation and try again." };
  await owned.db.from("lesson_preparation_deliveries").insert({
    tenant_id: owned.schedule.tenant_id,
    school_id: owned.schedule.school_id,
    lesson_preparation_id: saved.id,
    teaching_schedule_item_id: scheduleId,
    teaching_group_id: null,
    session_number: 1,
    assigned_by_user_id: owned.context.user!.id,
  });
  if (status === "prepared") await owned.db.from("teaching_schedule_items").update({ status: "prepared" }).eq("id", scheduleId);
  revalidatePath("/teaching");
  revalidatePath("/teaching/preparation");
  return { success: true, message: status === "prepared" ? "Lesson marked prepared. It has not been submitted to the HOD." : "Draft saved." };
}

export async function saveLessonPreparation(_state: LessonPreparationActionState, form: FormData): Promise<LessonPreparationActionState> {
  const scheduleId = text(form, "scheduleId");
  if (!scheduleId) return { message: "Choose a scheduled lesson." };
  const preparation = Object.fromEntries([
    "resources", "introduction", "lessonStructure", "teacherActivities", "learnerActivities", "consolidation",
    "assessment", "homeworkMonitoring", "differentiation", "englishAcrossCurriculum", "compensatoryTeaching", "reflectionAmendments",
  ].map((key) => [key, text(form, key)]));
  const selectedCompetencyIds = form.getAll("selectedCompetencyIds").map(String).filter(Boolean);
  const sessionCount = Math.max(1, Math.min(30, Number(form.get("sessionCount") ?? 1) || 1));
  return savePreparation(scheduleId, preparation, selectedCompetencyIds, sessionCount, form.get("intent") === "prepared" ? "prepared" : "draft");
}

export async function saveLessonPreparationOffline(form: FormData): Promise<LessonPreparationActionState> {
  const scheduleId = text(form, "scheduleId");
  const clientMutationId = text(form, "clientMutationId");
  if (!scheduleId || !clientMutationId) return { message: "This offline draft is missing its mutation identity." };
  const owned = await ownedSchedule(scheduleId);
  if (!owned) return { message: "This lesson is outside your current teaching allocation." };
  const preparation = Object.fromEntries([
    "resources", "introduction", "lessonStructure", "teacherActivities", "learnerActivities", "consolidation",
    "assessment", "homeworkMonitoring", "englishAcrossCurriculum", "compensatoryTeaching", "reflectionAmendments",
  ].map((key) => [key, text(form, key)]));
  const selectedCompetencyIds = text(form, "selectedCompetencyIds")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const sessionCount = Math.max(1, Math.min(30, Number(form.get("sessionCount") ?? 1) || 1));
  const snapshot = await curriculumSnapshot(owned.db, owned.schedule.pacing_plan_item_id);
  const { data, error } = await owned.db.rpc("save_lesson_preparation_offline_draft", {
    p_schedule_id: scheduleId,
    p_preparation: preparation,
    p_curriculum_snapshot: { ...snapshot, selectedCompetencyIds, sessionCount },
    p_client_mutation_id: clientMutationId,
    p_expected_updated_at: text(form, "expectedUpdatedAt") || null,
  });
  if (error) {
    if (error.message.includes("changed while this device was offline")) return { message: "This draft changed on the server while you were offline. Review it online before saving again." };
    if (error.message.includes("no longer an editable draft")) return { message: "This preparation is no longer an editable draft. Review it online." };
    if (error.message.includes("different lesson preparation data")) return { message: "This offline draft no longer matches its original queued change. Review it online." };
    return { message: "Offline draft could not be synchronized. Check your current teaching allocation." };
  }
  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath("/teaching/preparation");
  return { success: true, message: "Offline draft synchronized.", updatedAt: row?.preparation_updated_at ?? undefined };
}

export async function prepareLessonRange(_state: LessonPreparationActionState, form: FormData): Promise<LessonPreparationActionState> {
  const allocationId = text(form, "allocationId");
  const from = text(form, "from");
  const to = text(form, "to");
  const scope = await teacherContext();
  if (!scope || !allocationId || !from || !to || to < from) return { message: "Choose a valid assigned class and date range." };
  const { data: allocation } = await scope.db.from("teacher_allocations").select("id,staff_member_id").eq("id", allocationId).eq("staff_member_id", scope.staffId).maybeSingle();
  if (!allocation) return { message: "This assignment is not in your current teaching scope." };
  const { data: schedules } = await scope.db.from("teaching_schedule_items").select("id").eq("teacher_allocation_id", allocationId).gte("planned_on", from).lte("planned_on", to).in("status", ["planned", "prepared"]);
  let created = 0;
  for (const schedule of schedules ?? []) {
    const owned = await ownedSchedule(schedule.id);
    if (!owned) continue;
    const existing = await preparationForSchedule(owned.db, schedule.id);
    if (existing) continue;
    const snapshot = await curriculumSnapshot(owned.db, owned.schedule.pacing_plan_item_id);
    const { error } = await owned.db.from("lesson_preparations").insert({
      tenant_id: owned.schedule.tenant_id,
      school_id: owned.schedule.school_id,
      teaching_schedule_item_id: schedule.id,
      planned_on: owned.schedule.planned_on,
      academic_year: owned.schedule.academic_year,
      subject_offering_id: owned.allocation.subject_offering_id,
      curriculum_unit_id: snapshot.curriculumUnitId ?? null,
      curriculum_version_id: snapshot.curriculumVersionId ?? null,
      curriculum_snapshot: { ...snapshot, selectedCompetencyIds: [], sessionCount: 1 },
      preparation: {},
      selected_competency_ids: [],
      session_count: 1,
      status: "draft",
      prepared_by_user_id: owned.context.user!.id,
    });
    if (!error) created += 1;
  }
  revalidatePath("/teaching/preparation");
  return { success: true, message: `${created} lesson draft${created === 1 ? "" : "s"} prepared for editing. Nothing was submitted.` };
}

export async function submitLessonPreparation(_state: LessonPreparationActionState, form: FormData): Promise<LessonPreparationActionState> {
  const scheduleId = text(form, "scheduleId");
  const owned = await ownedSchedule(scheduleId);
  if (!owned) return { message: "This lesson is outside your current teaching allocation." };
  const existing = await preparationForSchedule(owned.db, scheduleId);
  if (!existing || existing.prepared_by_user_id !== owned.context.user!.id) return { message: "Only your own preparation can be submitted." };

  const latestSubmissionStatus = existing.status === "submitted" ? await latestPreparationSubmissionStatus(owned.db, existing.id) : null;
  const submittable = existing.status === "prepared" || existing.status === "returned" || (existing.status === "submitted" && latestSubmissionStatus === "returned");
  if (!submittable) return { message: "Mark the lesson prepared before submitting it for HOD review." };

  const { error } = await owned.db.rpc("submit_preparations", {
    p_school_id: owned.schedule.school_id,
    p_lesson_preparation_ids: [existing.id],
    p_scope_kind: "selected_preparations",
    p_term_label: null,
    p_week_start: null,
    p_week_end: null,
  });
  if (error) return { message: "Preparation could not be submitted. Check your current allocation and submission state." };
  revalidatePath("/teaching/preparation");
  return { success: true, message: "Preparation submitted to the governed HOD review queue." };
}


export async function reuseLessonPreparation(_state: LessonPreparationActionState, form: FormData): Promise<LessonPreparationActionState> {
  const preparationId = text(form, "preparationId");
  const targetScheduleId = text(form, "targetScheduleId");
  const sessionNumber = Math.max(1, Math.min(30, Number(form.get("sessionNumber") ?? 1) || 1));
  const owned = await ownedSchedule(targetScheduleId);
  if (!owned || !preparationId) return { message: "Choose a valid target lesson in your current allocation." };

  const { data: preparation } = await owned.db.from("lesson_preparations")
    .select("id,status,prepared_by_user_id,subject_offering_id,curriculum_unit_id,session_count")
    .eq("id", preparationId)
    .maybeSingle();
  if (!preparation || preparation.prepared_by_user_id !== owned.context.user!.id) {
    return { message: "Only your own preparation can be reused." };
  }
  if (["reviewed","archived"].includes(preparation.status)) {
    return { message: "Reviewed or archived preparation cannot receive new delivery assignments." };
  }
  if (sessionNumber > (preparation.session_count ?? 1)) {
    return { message: "Choose a session within the preparation session count." };
  }

  const snapshot = await curriculumSnapshot(owned.db, owned.schedule.pacing_plan_item_id);
  if (preparation.subject_offering_id !== owned.allocation.subject_offering_id
      || preparation.curriculum_unit_id !== (snapshot.curriculumUnitId ?? null)) {
    return { message: "Reuse is limited to the same subject offering and curriculum topic." };
  }

  const existing = await preparationForSchedule(owned.db, targetScheduleId);
  if (existing) return { message: "The target lesson already has a preparation assigned." };

  const { error } = await owned.db.from("lesson_preparation_deliveries").insert({
    tenant_id: owned.schedule.tenant_id,
    school_id: owned.schedule.school_id,
    lesson_preparation_id: preparation.id,
    teaching_schedule_item_id: targetScheduleId,
    teaching_group_id: null,
    session_number: sessionNumber,
    assigned_by_user_id: owned.context.user!.id,
  });
  if (error) return { message: "Preparation could not be assigned to that delivery." };
  revalidatePath("/teaching/preparation");
  return { success: true, message: "Preparation reused for the selected lesson. Delivery completion and reflection remain independent." };
}

export async function recordTeachingActual(_state: LessonPreparationActionState, form: FormData): Promise<LessonPreparationActionState> {
  const scheduleId = text(form, "scheduleId");
  const owned = await ownedSchedule(scheduleId);
  if (!owned) return { message: "This lesson is outside your current teaching allocation." };
  const coverageState = text(form, "coverageState");
  if (!["not_started", "started", "partially_taught", "taught", "reinforcement_needed", "assessed"].includes(coverageState)) return { message: "Choose a valid coverage state." };
  const periods = Math.max(1, Number(form.get("periodsUsed") ?? 1) || 1);
  const { error } = await owned.db.from("teaching_actuals").insert({
    tenant_id: owned.schedule.tenant_id,
    school_id: owned.schedule.school_id,
    teaching_schedule_item_id: scheduleId,
    taught_on: text(form, "taughtOn") || owned.schedule.planned_on,
    periods_used: periods,
    coverage_state: coverageState,
    reflection: text(form, "reflection") || null,
    compensatory_action: text(form, "compensatoryAction") || null,
    recorded_by_user_id: owned.context.user!.id,
  });
  if (error) return { message: "Teaching actual could not be recorded." };
  await owned.db.from("teaching_schedule_items").update({ status: "taught" }).eq("id", scheduleId);
  revalidatePath("/teaching/preparation");
  return { success: true, message: "Actual teaching and reflection recorded without changing the planned preparation." };
}