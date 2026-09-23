"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaDateKey } from "@/lib/namibia-date";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";

// Governed authoring for the existing connected teaching plan. This module only
// writes the canonical tables (pacing_plans / pacing_plan_items /
// teaching_schedule_items). There is no parallel plan store, no invented
// planning vocabulary and no official curriculum content: the curriculum
// registry is read-only here.
//
// Authority is enforced twice on purpose. The application checks below exist so
// a teacher or HOD gets an intelligible message; the real boundary is the
// RLS/RPC surface from
// supabase/migrations/20260918140000_teaching_planning_authoring_authority.sql
// (current school, HOD department responsibility, national_baseline
// restriction, allocation window). Removing the SQL boundary would make these
// checks decorative, so they must not be treated as the enforcement point.

export type PlanningActionState = { success?: boolean; message: string };

const leadershipRoles = new Set(["school_admin", "principal", "deputy_principal", "hod"]);
const planningRoles = new Set([...leadershipRoles, "teacher", "class_teacher"]);

const uuidSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");
const planLevelSchema = z.enum(["national_baseline", "department", "class"]);
const planStatusSchema = z.enum(["draft", "active", "superseded", "archived"]);
const itemPrioritySchema = z.enum(["essential", "high", "normal", "extension"]);
const scheduleStatusSchema = z.enum(["planned", "moved", "cancelled"]);

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** Empty form fields must be absent, not empty strings, or optional schema fails. */
const formText = (form: FormData, key: string) => text(form, key) || undefined;

const formInteger = (form: FormData, key: string): number | undefined => {
  const value = text(form, key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

function planningErrorMessage(message: string | undefined, fallback: string): string {
  const detail = (message ?? "").toLowerCase();
  if (detail.includes("national_baseline") || detail.includes("national baseline")) {
    return "National baseline plans are authored at platform level, not by a school.";
  }
  if (detail.includes("allocation window")) {
    return "That lesson date falls outside the effective window of the selected teacher allocation.";
  }
  if (
    detail.includes("row-level security") ||
    detail.includes("permission denied") ||
    detail.includes("policy")
  ) {
    return "You do not have current planning authority for that plan. HOD authority is limited to the subjects you are responsible for at your current school.";
  }
  if (detail.includes("creator") || detail.includes("authorized for school")) {
    return "Planning authorship must stay with your own account at your current school.";
  }
  if (
    detail.includes("scope mismatch") ||
    detail.includes("another curriculum version") ||
    detail.includes("differs")
  ) {
    return "This change conflicts with the connected plan scope. Reload and try again.";
  }
  if (detail.includes("violates") || detail.includes("check")) {
    return "Some values are outside the governed planning vocabulary. Check dates, periods and ordering.";
  }
  return fallback;
}

type PlanningScope = {
  schoolId: string;
  roleKey: string;
  userId: string;
};

/**
 * Planning authority starts from the deterministic current school exactly as
 * `app_private.user_current_school_matches` does. A platform membership ends
 * planning scope entirely: Platform Support must never gain teaching mutation
 * authority, and controlling a second active school membership must not widen
 * it either, because `getUserContext` already bounds `memberships` to the
 * current school.
 */
async function planningScope(): Promise<PlanningScope | null> {
  const context = await getUserContext();
  if (!context.user) return null;
  if (context.platformMemberships.length) return null;
  const membership = context.memberships.find((item) => planningRoles.has(item.roleKey));
  if (!membership) return null;
  return {
    schoolId: membership.schoolId,
    roleKey: membership.roleKey,
    userId: context.user.id,
  };
}

function revalidatePlanning() {
  revalidatePath("/teaching");
  revalidatePath("/teaching/planning");
}

const SCOPE_MESSAGE = "Your session has ended or you lack planning authority. Sign in again.";

// ==================== pacing plans ====================

export async function createPacingPlan(
  _state: PlanningActionState,
  form: FormData,
): Promise<PlanningActionState> {
  const parsed = z
    .object({
      offeringId: uuidSchema,
      planLevel: planLevelSchema,
      registerClassId: uuidSchema.optional(),
      teacherAllocationId: uuidSchema.optional(),
      curriculumUnitId: uuidSchema,
    })
    .safeParse({
      offeringId: text(form, "offeringId"),
      planLevel: text(form, "planLevel"),
      registerClassId: formText(form, "registerClassId"),
      teacherAllocationId: formText(form, "teacherAllocationId"),
      curriculumUnitId: text(form, "curriculumUnitId"),
    });

  if (!parsed.success) {
    return { message: "Choose a subject offering, a plan level and a curriculum unit." };
  }

  if (parsed.data.planLevel === "national_baseline") {
    return { message: "National baseline plans are authored at platform level, not by a school." };
  }

  const scope = await planningScope();
  if (!scope) return { message: SCOPE_MESSAGE };
  if (!leadershipRoles.has(scope.roleKey) && parsed.data.planLevel !== "department") {
    return { message: "Teachers author the shared subject and grade plan. A class-specific pacing variant requires academic leadership." };
  }

  const supabase = await createSupabaseServerClient();

  // The offering is the canonical source of tenant, school and academic year for
  // the plan. tenant_id must never be derived from school_id.
  const { data: offering } = await supabase
    .from("subject_offerings")
    .select("id,tenant_id,school_id,academic_year,grade_id,status,curriculum_version_id")
    .eq("id", parsed.data.offeringId)
    .eq("school_id", scope.schoolId)
    .eq("status", "active")
    .maybeSingle();

  if (!offering) {
    return { message: "That subject offering is not available in your current school." };
  }
  if (!offering.curriculum_version_id) {
    return { message: "That subject offering has no curriculum version, so no plan can be authored for it." };
  }

  const academicYear = await getGovernedAcademicYear(scope.schoolId);
  if (offering.academic_year !== academicYear) {
    return {
      message: `That subject offering belongs to ${offering.academic_year}, not the school's current academic year (${academicYear}).`,
    };
  }

  const { data: unit } = await supabase
    .from("curriculum_units")
    .select("id,curriculum_version_id")
    .eq("id", parsed.data.curriculumUnitId)
    .maybeSingle();

  if (!unit) return { message: "That curriculum unit does not exist." };
  if (unit.curriculum_version_id !== offering.curriculum_version_id) {
    return { message: "That unit belongs to a different curriculum version than the offering." };
  }

  if (parsed.data.planLevel === "class" && !parsed.data.registerClassId) {
    return { message: "A class plan needs a register class." };
  }

  if (parsed.data.registerClassId) {
    const { data: registerClass } = await supabase
      .from("register_classes")
      .select("id,school_id,academic_year,grade_id")
      .eq("id", parsed.data.registerClassId)
      .eq("school_id", scope.schoolId)
      .maybeSingle();

    if (!registerClass) {
      return { message: "That register class is not available in your current school." };
    }
    if (registerClass.academic_year !== offering.academic_year) {
      return { message: "That register class belongs to a different academic year than the offering." };
    }
    if (registerClass.grade_id !== offering.grade_id) {
      return { message: "That register class belongs to a different grade than the offering." };
    }
  }

  if (parsed.data.teacherAllocationId) {
    const { data: allocation } = await supabase
      .from("teacher_allocations")
      .select("id,school_id,academic_year,subject_offering_id,register_class_id,active_from,active_to")
      .eq("id", parsed.data.teacherAllocationId)
      .eq("school_id", scope.schoolId)
      .maybeSingle();

    if (!allocation) {
      return { message: "That teacher allocation is not available in your current school." };
    }
    if (allocation.subject_offering_id !== offering.id) {
      return { message: "That teacher allocation is for a different subject offering." };
    }
    if (
      parsed.data.registerClassId &&
      allocation.register_class_id !== parsed.data.registerClassId
    ) {
      return { message: "That teacher allocation is not for the selected register class." };
    }
    if (allocation.academic_year !== offering.academic_year) {
      return { message: "That teacher allocation belongs to a different academic year than the offering." };
    }
    const today = getNamibiaDateKey();
    if (allocation.active_from > today || (allocation.active_to && allocation.active_to < today)) {
      return { message: "That teacher allocation is not currently effective." };
    }
  }

  if (parsed.data.planLevel === "department") {
    const { data: existingPlan } = await supabase
      .from("pacing_plans")
      .select("id")
      .eq("school_id", offering.school_id)
      .eq("academic_year", offering.academic_year)
      .eq("subject_offering_id", offering.id)
      .eq("plan_level", "department")
      .in("status", ["draft", "active"])
      .limit(1)
      .maybeSingle();
    if (existingPlan) {
      return { message: "A shared subject and grade plan already exists for this academic year. Open the existing plan instead." };
    }
  }

  const { error } = await supabase.from("pacing_plans").insert({
    tenant_id: offering.tenant_id,
    school_id: offering.school_id,
    academic_year: offering.academic_year,
    subject_offering_id: offering.id,
    curriculum_version_id: offering.curriculum_version_id,
    plan_level: parsed.data.planLevel,
    register_class_id: parsed.data.planLevel === "class" ? (parsed.data.registerClassId ?? null) : null,
    teacher_allocation_id: parsed.data.teacherAllocationId ?? null,
    created_by_user_id: scope.userId,
  });

  if (error) {
    return { message: planningErrorMessage(error.message, "The plan could not be created. Try again.") };
  }

  revalidatePlanning();
  return { success: true, message: "Plan created." };
}

export async function updatePacingPlanStatus(
  _state: PlanningActionState,
  form: FormData,
): Promise<PlanningActionState> {
  const parsed = z
    .object({ planId: uuidSchema, status: planStatusSchema })
    .safeParse({
      planId: text(form, "planId"),
      status: text(form, "status"),
    });

  if (!parsed.success) {
    return { message: "Choose a plan and a valid status." };
  }

  const scope = await planningScope();
  if (!scope) return { message: SCOPE_MESSAGE };

  const supabase = await createSupabaseServerClient();
  const { data: plan } = await supabase
    .from("pacing_plans")
    .select("id,school_id")
    .eq("id", parsed.data.planId)
    .eq("school_id", scope.schoolId)
    .maybeSingle();

  if (!plan) return { message: "That plan is not available in your current school." };

  const { error } = await supabase
    .from("pacing_plans")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.planId);

  if (error) {
    return { message: planningErrorMessage(error.message, "The plan status could not be updated. Try again.") };
  }

  revalidatePlanning();
  return { success: true, message: `Plan status set to ${parsed.data.status}.` };
}

// ==================== pacing plan items ====================

export async function createPacingPlanItem(
  _state: PlanningActionState,
  form: FormData,
): Promise<PlanningActionState> {
  const parsed = z
    .object({
      planId: uuidSchema,
      curriculumUnitId: uuidSchema,
      plannedStartOn: dateSchema.optional(),
      plannedEndOn: dateSchema.optional(),
      plannedPeriods: z.number().int().positive(),
      priority: itemPrioritySchema.optional(),
      sequenceNumber: z.number().int().positive().optional(),
      notes: z.string().max(2000, "Notes must be 2000 characters or fewer.").optional(),
      academicTermId: uuidSchema.optional(),
      completedOn: dateSchema.optional(),
    })
    .safeParse({
      planId: text(form, "planId"),
      curriculumUnitId: text(form, "curriculumUnitId"),
      plannedStartOn: formText(form, "plannedStartOn"),
      plannedEndOn: formText(form, "plannedEndOn"),
      plannedPeriods: formInteger(form, "plannedPeriods"),
      priority: formText(form, "priority"),
      sequenceNumber: formInteger(form, "sequenceNumber"),
      notes: formText(form, "notes"),
      academicTermId: formText(form, "academicTermId"),
      completedOn: formText(form, "completedOn"),
    });

  if (!parsed.success) {
    return { message: "Check the plan item details: a curriculum unit and a positive period count are required." };
  }

  if (
    parsed.data.plannedStartOn &&
    parsed.data.plannedEndOn &&
    parsed.data.plannedEndOn < parsed.data.plannedStartOn
  ) {
    return { message: "The planned end date must be on or after the planned start date." };
  }

  const scope = await planningScope();
  if (!scope) return { message: SCOPE_MESSAGE };

  const supabase = await createSupabaseServerClient();

  const { data: plan } = await supabase
    .from("pacing_plans")
    .select("id,tenant_id,school_id,curriculum_version_id")
    .eq("id", parsed.data.planId)
    .eq("school_id", scope.schoolId)
    .maybeSingle();

  if (!plan) return { message: "That plan is not available in your current school." };

  const { data: unit } = await supabase
    .from("curriculum_units")
    .select("id,curriculum_version_id")
    .eq("id", parsed.data.curriculumUnitId)
    .maybeSingle();

  if (!unit) return { message: "That curriculum unit does not exist." };
  if (unit.curriculum_version_id !== plan.curriculum_version_id) {
    return { message: "That unit belongs to a different curriculum version than the plan." };
  }

  const { error } = await supabase.from("pacing_plan_items").insert({
    tenant_id: plan.tenant_id,
    school_id: plan.school_id,
    pacing_plan_id: plan.id,
    curriculum_unit_id: parsed.data.curriculumUnitId,
    planned_start_on: parsed.data.plannedStartOn ?? null,
    planned_end_on: parsed.data.plannedEndOn ?? null,
    planned_periods: parsed.data.plannedPeriods,
    priority: parsed.data.priority ?? "normal",
    sequence_number: parsed.data.sequenceNumber ?? 100,
    notes: parsed.data.notes ?? null,
    academic_term_id: parsed.data.academicTermId ?? null,
    completed_on: parsed.data.completedOn ?? null,
  });

  if (error) {
    return { message: planningErrorMessage(error.message, "The plan item could not be created. Try again.") };
  }

  revalidatePlanning();
  return { success: true, message: "Plan item created." };
}

export async function updatePacingPlanItem(
  _state: PlanningActionState,
  form: FormData,
): Promise<PlanningActionState> {
  const parsed = z
    .object({
      itemId: uuidSchema,
      plannedStartOn: dateSchema.optional(),
      plannedEndOn: dateSchema.optional(),
      plannedPeriods: z.number().int().positive().optional(),
      priority: itemPrioritySchema.optional(),
      sequenceNumber: z.number().int().positive().optional(),
      notes: z.string().max(2000, "Notes must be 2000 characters or fewer.").optional(),
      academicTermId: uuidSchema.optional(),
      completedOn: dateSchema.optional(),
    })
    .safeParse({
      itemId: text(form, "itemId"),
      plannedStartOn: formText(form, "plannedStartOn"),
      plannedEndOn: formText(form, "plannedEndOn"),
      plannedPeriods: formInteger(form, "plannedPeriods"),
      priority: formText(form, "priority"),
      sequenceNumber: formInteger(form, "sequenceNumber"),
      notes: formText(form, "notes"),
      academicTermId: formText(form, "academicTermId"),
      completedOn: formText(form, "completedOn"),
    });

  if (!parsed.success) {
    return { message: "Check the plan item details and try again." };
  }

  if (
    parsed.data.plannedStartOn &&
    parsed.data.plannedEndOn &&
    parsed.data.plannedEndOn < parsed.data.plannedStartOn
  ) {
    return { message: "The planned end date must be on or after the planned start date." };
  }

  const scope = await planningScope();
  if (!scope) return { message: SCOPE_MESSAGE };

  const supabase = await createSupabaseServerClient();
  const { data: item } = await supabase
    .from("pacing_plan_items")
    .select("id,school_id")
    .eq("id", parsed.data.itemId)
    .eq("school_id", scope.schoolId)
    .maybeSingle();

  if (!item) return { message: "That plan item is not available in your current school." };

  // Root scope (tenant, school, parent plan, curriculum unit) is immutable by
  // database trigger, so only the authorable planning fields are assembled here.
  const updates: Record<string, unknown> = {};
  if (parsed.data.plannedStartOn !== undefined) updates.planned_start_on = parsed.data.plannedStartOn;
  if (parsed.data.plannedEndOn !== undefined) updates.planned_end_on = parsed.data.plannedEndOn;
  if (parsed.data.plannedPeriods !== undefined) updates.planned_periods = parsed.data.plannedPeriods;
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
  if (parsed.data.sequenceNumber !== undefined) updates.sequence_number = parsed.data.sequenceNumber;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
  if (parsed.data.academicTermId !== undefined) updates.academic_term_id = parsed.data.academicTermId;
  if (parsed.data.completedOn !== undefined) updates.completed_on = parsed.data.completedOn;

  if (!Object.keys(updates).length) {
    return { message: "Nothing to change on this plan item." };
  }

  const { error } = await supabase
    .from("pacing_plan_items")
    .update(updates)
    .eq("id", parsed.data.itemId);

  if (error) {
    return { message: planningErrorMessage(error.message, "The plan item could not be updated. Try again.") };
  }

  revalidatePlanning();
  return { success: true, message: "Plan item updated." };
}

// ==================== local planning events ====================

export async function createPacingPlanEvent(
  _state: PlanningActionState,
  form: FormData,
): Promise<PlanningActionState> {
  const parsed = z
    .object({
      planId: uuidSchema,
      academicTermId: uuidSchema.optional(),
      title: z.string().trim().min(1).max(160),
      notes: z.string().trim().max(2000).optional(),
      startsOn: dateSchema,
      endsOn: dateSchema,
    })
    .safeParse({
      planId: text(form, "planId"),
      academicTermId: formText(form, "academicTermId"),
      title: text(form, "eventTitle"),
      notes: formText(form, "eventNotes"),
      startsOn: text(form, "eventStartsOn"),
      endsOn: text(form, "eventEndsOn"),
    });

  if (!parsed.success) return { message: "Choose a plan, title and valid event dates." };
  if (parsed.data.endsOn < parsed.data.startsOn) {
    return { message: "The planning event end date must be on or after its start date." };
  }

  const scope = await planningScope();
  if (!scope) return { message: SCOPE_MESSAGE };
  const supabase = await createSupabaseServerClient();
  const { data: plan } = await supabase
    .from("pacing_plans")
    .select("id,tenant_id,school_id")
    .eq("id", parsed.data.planId)
    .eq("school_id", scope.schoolId)
    .maybeSingle();
  if (!plan) return { message: "That plan is not available in your current school." };

  const { error } = await supabase.from("pacing_plan_events").insert({
    tenant_id: plan.tenant_id,
    school_id: plan.school_id,
    pacing_plan_id: plan.id,
    academic_term_id: parsed.data.academicTermId ?? null,
    title: parsed.data.title,
    notes: parsed.data.notes ?? null,
    starts_on: parsed.data.startsOn,
    ends_on: parsed.data.endsOn,
    created_by_user_id: scope.userId,
  });
  if (error) {
    return { message: planningErrorMessage(error.message, "The planning event could not be added. Try again.") };
  }
  revalidatePlanning();
  return { success: true, message: "Planning event added." };
}

// ==================== teaching schedule items ====================

export async function createTeachingScheduleItem(
  _state: PlanningActionState,
  form: FormData,
): Promise<PlanningActionState> {
  const parsed = z
    .object({
      planItemId: uuidSchema,
      registerClassId: uuidSchema,
      teacherAllocationId: uuidSchema,
      plannedOn: dateSchema,
      plannedPeriodCount: z.number().int().positive().optional(),
    })
    .safeParse({
      planItemId: text(form, "planItemId"),
      registerClassId: text(form, "registerClassId"),
      teacherAllocationId: text(form, "teacherAllocationId"),
      plannedOn: text(form, "plannedOn"),
      plannedPeriodCount: formInteger(form, "plannedPeriodCount"),
    });

  if (!parsed.success) {
    return { message: "Choose a plan item, a register class, a teacher allocation and a lesson date." };
  }

  const scope = await planningScope();
  if (!scope) return { message: SCOPE_MESSAGE };

  const supabase = await createSupabaseServerClient();

  // The parent plan is the canonical source of tenant, school and academic year.
  const { data: planItem } = await supabase
    .from("pacing_plan_items")
    .select("id,school_id,pacing_plan_id")
    .eq("id", parsed.data.planItemId)
    .eq("school_id", scope.schoolId)
    .maybeSingle();

  if (!planItem) {
    return { message: "That plan item is not available in your current school." };
  }

  const { data: plan } = await supabase
    .from("pacing_plans")
    .select("id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,teacher_allocation_id")
    .eq("id", planItem.pacing_plan_id)
    .eq("school_id", scope.schoolId)
    .maybeSingle();

  if (!plan) return { message: "That plan is not available in your current school." };

  const { data: registerClass } = await supabase
    .from("register_classes")
    .select("id,school_id,academic_year")
    .eq("id", parsed.data.registerClassId)
    .eq("school_id", scope.schoolId)
    .maybeSingle();

  if (!registerClass) {
    return { message: "That register class is not available in your current school." };
  }
  if (registerClass.academic_year !== plan.academic_year) {
    return { message: "That register class belongs to a different academic year than the plan." };
  }

  const { data: allocation } = await supabase
    .from("teacher_allocations")
    .select("id,school_id,academic_year,subject_offering_id,register_class_id,active_from,active_to")
    .eq("id", parsed.data.teacherAllocationId)
    .eq("school_id", scope.schoolId)
    .maybeSingle();

  if (!allocation) {
    return { message: "That teacher allocation is not available in your current school." };
  }
  if (allocation.subject_offering_id !== plan.subject_offering_id) {
    return { message: "That teacher allocation is for a different subject offering." };
  }
  if (allocation.register_class_id !== parsed.data.registerClassId) {
    return { message: "That teacher allocation is not for the selected register class." };
  }
  if (allocation.academic_year !== plan.academic_year) {
    return { message: "That teacher allocation belongs to a different academic year than the plan." };
  }
  if (plan.register_class_id && plan.register_class_id !== parsed.data.registerClassId) {
    return { message: "This plan belongs to another register class." };
  }

  // A lesson may only be scheduled inside the allocation it names.
  if (
    parsed.data.plannedOn < allocation.active_from ||
    (allocation.active_to && parsed.data.plannedOn > allocation.active_to)
  ) {
    return { message: "That lesson date falls outside the effective window of the selected teacher allocation." };
  }

  const { error } = await supabase.from("teaching_schedule_items").insert({
    tenant_id: plan.tenant_id,
    school_id: plan.school_id,
    academic_year: plan.academic_year,
    pacing_plan_item_id: planItem.id,
    register_class_id: parsed.data.registerClassId,
    teacher_allocation_id: parsed.data.teacherAllocationId,
    planned_on: parsed.data.plannedOn,
    planned_period_count: parsed.data.plannedPeriodCount ?? 1,
    status: "planned",
  });

  if (error) {
    return { message: planningErrorMessage(error.message, "The lesson could not be scheduled. Try again.") };
  }

  revalidatePlanning();
  return { success: true, message: "Lesson scheduled." };
}

export async function updateTeachingScheduleItemStatus(
  _state: PlanningActionState,
  form: FormData,
): Promise<PlanningActionState> {
  const parsed = z
    .object({
      scheduleItemId: uuidSchema,
      status: scheduleStatusSchema,
      movedToDate: dateSchema.optional(),
    })
    .safeParse({
      scheduleItemId: text(form, "scheduleItemId"),
      status: text(form, "status"),
      movedToDate: formText(form, "movedToDate"),
    });

  if (!parsed.success) {
    return { message: "Choose a lesson, a valid scheduling status and a move date when moving a lesson." };
  }

  // A moved lesson records where it actually went. Inventing today's date would
  // fabricate planning evidence, so the move date must be supplied.
  if (parsed.data.status === "moved" && !parsed.data.movedToDate) {
    return { message: "Choose the date the lesson is moved to." };
  }

  const scope = await planningScope();
  if (!scope) return { message: SCOPE_MESSAGE };

  const supabase = await createSupabaseServerClient();
  const { data: scheduleItem } = await supabase
    .from("teaching_schedule_items")
    .select("id,school_id,teacher_allocation_id")
    .eq("id", parsed.data.scheduleItemId)
    .eq("school_id", scope.schoolId)
    .maybeSingle();

  if (!scheduleItem) {
    return { message: "That lesson is not available in your current school." };
  }

  if (parsed.data.movedToDate) {
    const { data: allocation } = await supabase
      .from("teacher_allocations")
      .select("active_from,active_to")
      .eq("id", scheduleItem.teacher_allocation_id)
      .maybeSingle();

    if (
      allocation &&
      (parsed.data.movedToDate < allocation.active_from ||
        (allocation.active_to && parsed.data.movedToDate > allocation.active_to))
    ) {
      return { message: "That move date falls outside the effective window of the lesson's teacher allocation." };
    }
  }

  // Only planning status and an explicit move date are written. A status change
  // never rewrites the historical planned date or silently clears an existing
  // move record.
  const updates: Record<string, unknown> = {
    status: parsed.data.status,
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.status === "moved") updates.moved_to_date = parsed.data.movedToDate;

  const { error } = await supabase
    .from("teaching_schedule_items")
    .update(updates)
    .eq("id", parsed.data.scheduleItemId);

  if (error) {
    return { message: planningErrorMessage(error.message, "The lesson status could not be updated. Try again.") };
  }

  revalidatePlanning();
  return { success: true, message: `Lesson status set to ${parsed.data.status}.` };
}
