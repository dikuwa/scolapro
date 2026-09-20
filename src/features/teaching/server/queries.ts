import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getNamibiaDateKey } from "@/lib/namibia-date";
import { getSchoolCalendar } from "@/features/calendar/server/calendar";

// Read-only workspace data for the Teaching views. Everything comes from the
// existing canonical teaching-planning tables (pacing_plans / pacing_plan_items
// / teaching_schedule_items / lesson_preparations / teaching_actuals plus
// curriculum_units / curriculum_objectives / curriculum_competencies) and the
// school calendar foundation (academic_years / academic_terms,
// school_day_overrides) with governed teacher allocations. No new tables,
// columns or RPCs are introduced; this module never mutates data.

type PostgrestLike<T> = { data: T[] | null; error: { message: string } | null };

// Postgrest builders are thenable, not real Promises; accept either so
// conditional fetching can pass null without awaiting an empty chain.
async function fetchRows<T>(
  builder: { then<U>(onFulfilled: (result: PostgrestLike<T>) => U): unknown } | null,
  message: string,
): Promise<T[]> {
  if (!builder) return [];
  const { data, error } = (await Promise.resolve(builder)) as PostgrestLike<T>;
  if (error) throw new Error(message);
  return data ?? [];
}

function one<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function isEffectiveOn(date: string, startsOn: string | null, endsOn: string | null): boolean {
  return (!startsOn || startsOn <= date) && (!endsOn || endsOn >= date);
}

export type TeachingAllocationRow = {
  allocationId: string;
  classId: string | null;
  className: string;
  gradeName: string;
  subjectName: string;
  subjectId: string;
  offeringId: string;
  curriculumVersionId: string | null;
  activeFrom: string;
  activeTo: string | null;
};

export type TeachingTerm = {
  id: string;
  number: number;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  status: string;
  isCurrent: boolean;
};

export type TeachingPlanRow = {
  planId: string;
  planLevel: string;
  status: string;
  curriculumVersionId: string;
  offeringId: string;
};

export type TeachingPlanItem = {
  itemId: string;
  planId: string;
  planLevel: string;
  planStatus: string;
  unitId: string;
  unitCode: string;
  topic: string;
  theme: string | null;
  sequenceNumber: number;
  plannedStartOn: string | null;
  plannedEndOn: string | null;
  plannedPeriods: number;
  recommendedPeriodsMin: number | null;
  recommendedPeriodsMax: number | null;
  practicalRequired: boolean;
  priority: string;
};

export type TeachingScheduleRow = {
  itemId: string;
  planItemId: string;
  plannedOn: string;
  plannedPeriodCount: number;
  status: string;
  movedTo: string | null;
};

export type TeachingPreparationRow = {
  id: string;
  scheduleItemId: string;
  plannedOn: string;
  status: string;
  preparation: Record<string, unknown>;
  curriculumSnapshot: Record<string, unknown>;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
};

export type TeachingActualRow = {
  scheduleItemId: string;
  taughtOn: string;
  periodsUsed: number;
  coverageState: string;
  reflection: string | null;
  compensatoryAction: string | null;
};

export type TeachingObjectiveRow = { unitId: string; code: string | null; text: string };
export type TeachingCompetencyRow = { unitId: string; code: string | null; text: string };

export type TeachingDayOverride = {
  date: string;
  isSchoolDay: boolean;
  reason: string | null;
  source: string;
};

export type TeachingUnitOption = {
  unitId: string;
  unitCode: string;
  topic: string;
  theme: string | null;
  curriculumVersionId: string;
};

export type PlanningClassOption = {
  classId: string;
  className: string;
  gradeId: string;
  gradeName: string;
};

export type PlanningAllocationOption = {
  allocationId: string;
  classId: string | null;
  className: string;
  gradeName: string;
  subjectName: string;
  offeringId: string;
  curriculumVersionId: string | null;
  activeFrom: string;
  activeTo: string | null;
};

export type PlanningOfferingOption = {
  offeringId: string;
  subjectId: string;
  gradeId: string;
  subjectName: string;
  gradeName: string;
  curriculumVersionId: string | null;
};

export type PlanningPlanSummary = {
  planId: string;
  planLevel: string;
  status: string;
  curriculumVersionId: string;
  offeringId: string;
  subjectName: string;
  gradeName: string;
  className: string | null;
  itemCount: number;
  scheduledCount: number;
};

export type TeachingPlanningData = TeachingWorkspaceData & {
  units: TeachingUnitOption[];
  classes: PlanningClassOption[];
  planningAllocations: PlanningAllocationOption[];
  planSummaries: PlanningPlanSummary[];
};

export type TeachingWorkspaceData = {
  today: string;
  academicYear: number;
  academicYearStatus: string | null;
  terms: TeachingTerm[];
  currentTerm: TeachingTerm | null;
  allocations: TeachingAllocationRow[];
  planByAllocation: Record<string, TeachingPlanRow[]>;
  planItems: TeachingPlanItem[];
  scheduleItems: TeachingScheduleRow[];
  preparations: TeachingPreparationRow[];
  actuals: TeachingActualRow[];
  objectivesByUnit: Record<string, TeachingObjectiveRow[]>;
  competenciesByUnit: Record<string, TeachingCompetencyRow[]>;
  dayOverrides: TeachingDayOverride[];
  /** Curriculum versions actually reachable from this actor's allocations and plans. */
  curriculumVersionIds: string[];
  /** Configured offerings are populated only for the authoring route. */
  planningOfferings: PlanningOfferingOption[];
  hasLeadershipAuthority: boolean;
  isTeacher: boolean;
};

const leadershipRoles = new Set(["school_admin", "principal", "deputy_principal", "hod"]);

export async function getTeachingWorkspace(input: {
  schoolId: string;
  academicYear: number;
  roleKey: string;
  staffMemberId?: string | null;
  includeConfiguredOfferings?: boolean;
}): Promise<TeachingWorkspaceData> {
  const supabase = await createSupabaseServerClient();
  const today = getNamibiaDateKey();

  const calendar = await getSchoolCalendar(input.schoolId, input.academicYear);

  const terms: TeachingTerm[] = calendar.terms.map((term) => ({
    id: term.id,
    number: term.number,
    name: term.name,
    startsOn: term.startsOn,
    endsOn: term.endsOn,
    status: term.status,
    isCurrent:
      term.status === "active" ||
      (Boolean(term.startsOn) && Boolean(term.endsOn) && term.startsOn! <= today && term.endsOn! >= today),
  }));
  const currentTerm = terms.find((term) => term.isCurrent) ?? null;

  const allocationsResult = await supabase
    .from("teacher_allocations")
    .select(
      "id,subject_offering_id,register_class_id,active_from,active_to,subject_offerings(subject_id,curriculum_version_id,status,subjects(display_name),grades(display_name)),register_classes(display_name)",
    )
    .eq("school_id", input.schoolId)
    .eq("academic_year", input.academicYear)
    .order("active_from")
    .order("id");

  if (allocationsResult.error) throw new Error("Unable to load teaching allocations.");

  const allocations: TeachingAllocationRow[] = [];
  const offeringIds = new Set<string>();
  const curriculumVersionIds = new Set<string>();
  const planningOfferings: PlanningOfferingOption[] = [];
  let allowedHodSubjectIds: Set<string> | null = null;

  if (input.includeConfiguredOfferings) {
    if (input.roleKey === "hod") {
      allowedHodSubjectIds = new Set<string>();
      if (input.staffMemberId) {
        const [assignmentsResult, responsibilitiesResult] = await Promise.all([
          supabase
            .from("staff_school_assignments")
            .select("id,effective_from,effective_to")
            .eq("school_id", input.schoolId)
            .eq("staff_member_id", input.staffMemberId),
          supabase
            .from("subject_department_responsibilities")
            .select("subject_id,department_head_staff_assignment_id,effective_from,effective_to")
            .eq("school_id", input.schoolId),
        ]);
        if (assignmentsResult.error || responsibilitiesResult.error) {
          throw new Error("Unable to load HOD subject scope.");
        }
        const activeAssignmentIds = new Set(
          (assignmentsResult.data ?? [])
            .filter((assignment) => isEffectiveOn(today, assignment.effective_from, assignment.effective_to))
            .map((assignment) => assignment.id),
        );
        for (const responsibility of responsibilitiesResult.data ?? []) {
          if (
            activeAssignmentIds.has(responsibility.department_head_staff_assignment_id) &&
            isEffectiveOn(today, responsibility.effective_from, responsibility.effective_to)
          ) {
            allowedHodSubjectIds.add(responsibility.subject_id);
          }
        }
      }
    }

    const seenOfferingIds = new Set<string>();
    const offeringsResult = await supabase
      .from("subject_offerings")
      .select("id,subject_id,grade_id,curriculum_version_id,status,subjects(display_name),grades(display_name)")
      .eq("school_id", input.schoolId)
      .eq("academic_year", input.academicYear)
      .eq("status", "active")
      .order("id");

    if (offeringsResult.error) throw new Error("Unable to load subject offerings.");

    for (const row of offeringsResult.data ?? []) {
      if (seenOfferingIds.has(row.id)) continue;
      if (allowedHodSubjectIds && !allowedHodSubjectIds.has(row.subject_id)) continue;
      const subject = one(row.subjects);
      const grade = one(row.grades);
      // A valid offering must resolve through the canonical subject and grade
      // relations. Never manufacture a catalogue-only placeholder option.
      if (!subject?.display_name || !grade?.display_name) continue;
      seenOfferingIds.add(row.id);
      planningOfferings.push({
        offeringId: row.id,
        subjectId: row.subject_id,
        gradeId: row.grade_id,
        subjectName: subject.display_name,
        gradeName: grade.display_name,
        curriculumVersionId: row.curriculum_version_id,
      });
      offeringIds.add(row.id);
      if (row.curriculum_version_id) curriculumVersionIds.add(row.curriculum_version_id);
    }
  }

  for (const row of allocationsResult.data ?? []) {
    const offering = one(row.subject_offerings);
    const classRow = one(row.register_classes);
    if (
      input.includeConfiguredOfferings &&
      (!offering ||
        offering.status !== "active" ||
        (allowedHodSubjectIds && !allowedHodSubjectIds.has(offering.subject_id)))
    ) {
      continue;
    }
    if (!isEffectiveOn(today, row.active_from, row.active_to)) continue;
    const allocation: TeachingAllocationRow = {
      allocationId: row.id,
      classId: row.register_class_id,
      className: classRow?.display_name ?? "Unassigned class",
      gradeName: offering ? one(offering.grades)?.display_name ?? "Grade" : "Grade",
      subjectName: offering ? one(offering.subjects)?.display_name ?? "Subject" : "Subject",
      subjectId: offering?.subject_id ?? "",
      offeringId: row.subject_offering_id,
      curriculumVersionId: offering?.curriculum_version_id ?? null,
      activeFrom: row.active_from,
      activeTo: row.active_to,
    };
    allocations.push(allocation);
    offeringIds.add(allocation.offeringId);
    if (allocation.curriculumVersionId) curriculumVersionIds.add(allocation.curriculumVersionId);
  }

  const plans = await fetchRows(
    supabase
      .from("pacing_plans")
      .select("id,plan_level,status,curriculum_version_id,subject_offering_id")
      .eq("school_id", input.schoolId)
      .eq("academic_year", input.academicYear)
      .in("status", ["draft", "active"]),
    "Unable to load pacing plans.",
  );

  const planByAllocation: Record<string, TeachingPlanRow[]> = {};
  const planIds: string[] = [];
  for (const plan of plans) {
    if (!plan.subject_offering_id || !offeringIds.has(plan.subject_offering_id)) continue;
    planByAllocation[plan.subject_offering_id] = [
      ...(planByAllocation[plan.subject_offering_id] ?? []),
      {
        planId: plan.id,
        planLevel: plan.plan_level,
        status: plan.status,
        curriculumVersionId: plan.curriculum_version_id,
        offeringId: plan.subject_offering_id,
      },
    ];
    planIds.push(plan.id);
    curriculumVersionIds.add(plan.curriculum_version_id);
  }

  const planRows = await fetchRows(
    planIds.length
      ? supabase
          .from("pacing_plan_items")
          .select(
            "id,pacing_plan_id,curriculum_unit_id,planned_start_on,planned_end_on,planned_periods,priority,sequence_number,curriculum_units(unit_code,theme,topic,recommended_periods_min,recommended_periods_max,practical_required)",
          )
          .in("pacing_plan_id", planIds)
          .order("sequence_number")
          .order("id")
      : null,
    "Unable to load pacing plan items.",
  );

  const planLevelByPlanId = new Map(plans.map((plan) => [plan.id, plan.plan_level]));
  const planStatusByPlanId = new Map(plans.map((plan) => [plan.id, plan.status]));

  const planItems: TeachingPlanItem[] = planRows.map((row) => {
    const unit = one(row.curriculum_units);
    return {
      itemId: row.id,
      planId: row.pacing_plan_id,
      planLevel: planLevelByPlanId.get(row.pacing_plan_id) ?? "class",
      planStatus: planStatusByPlanId.get(row.pacing_plan_id) ?? "draft",
      unitId: row.curriculum_unit_id,
      unitCode: unit?.unit_code ?? "",
      topic: unit?.topic ?? "Curriculum unit",
      theme: unit?.theme ?? null,
      sequenceNumber: row.sequence_number,
      plannedStartOn: row.planned_start_on,
      plannedEndOn: row.planned_end_on,
      plannedPeriods: row.planned_periods,
      recommendedPeriodsMin: unit?.recommended_periods_min ?? null,
      recommendedPeriodsMax: unit?.recommended_periods_max ?? null,
      practicalRequired: unit?.practical_required ?? false,
      priority: row.priority,
    };
  });

  const planItemIds = planItems.map((item) => item.itemId);
  const unitIds = [...new Set(planItems.map((item) => item.unitId))];

  const scheduleRows = await fetchRows(
    planItemIds.length
      ? supabase
          .from("teaching_schedule_items")
          .select("id,pacing_plan_item_id,planned_on,planned_period_count,status,moved_to_date")
          .eq("school_id", input.schoolId)
          .eq("academic_year", input.academicYear)
          .in("pacing_plan_item_id", planItemIds)
          .order("planned_on")
      : null,
    "Unable to load the teaching schedule.",
  );

  const scheduleItems: TeachingScheduleRow[] = scheduleRows.map((row) => ({
    itemId: row.id,
    planItemId: row.pacing_plan_item_id,
    plannedOn: row.planned_on,
    plannedPeriodCount: row.planned_period_count,
    status: row.status,
    movedTo: row.moved_to_date,
  }));

  const scheduleItemIds = scheduleItems.map((item) => item.itemId);

  const preparationRows = await fetchRows(
    scheduleItemIds.length
      ? supabase
          .from("lesson_preparations")
          .select(
            "id,teaching_schedule_item_id,planned_on,status,preparation,curriculum_snapshot,review_note,submitted_at,reviewed_at",
          )
          .in("teaching_schedule_item_id", scheduleItemIds)
          .order("planned_on")
      : null,
    "Unable to load lesson preparations.",
  );

  const preparations: TeachingPreparationRow[] = preparationRows.map((row) => ({
    id: row.id,
    scheduleItemId: row.teaching_schedule_item_id,
    plannedOn: row.planned_on,
    status: row.status,
    preparation: (row.preparation ?? {}) as Record<string, unknown>,
    curriculumSnapshot: (row.curriculum_snapshot ?? {}) as Record<string, unknown>,
    reviewNote: row.review_note,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
  }));

  const actualRows = await fetchRows(
    scheduleItemIds.length
      ? supabase
          .from("teaching_actuals")
          .select("teaching_schedule_item_id,taught_on,periods_used,coverage_state,reflection,compensatory_action")
          .in("teaching_schedule_item_id", scheduleItemIds)
          .order("taught_on")
      : null,
    "Unable to load teaching actuals.",
  );

  const actuals: TeachingActualRow[] = actualRows.map((row) => ({
    scheduleItemId: row.teaching_schedule_item_id,
    taughtOn: row.taught_on,
    periodsUsed: row.periods_used,
    coverageState: row.coverage_state,
    reflection: row.reflection,
    compensatoryAction: row.compensatory_action,
  }));

  // Official curriculum registry content for the units actually planned. This
  // is authoritative registry text rendered read-only in every view.
  const objectiveRows = await fetchRows(
    unitIds.length
      ? supabase
          .from("curriculum_objectives")
          .select("curriculum_unit_id,objective_code,objective_text,sequence_number")
          .in("curriculum_unit_id", unitIds)
          .order("sequence_number")
      : null,
    "Unable to load curriculum objectives.",
  );
  const competencyRows = await fetchRows(
    unitIds.length
      ? supabase
          .from("curriculum_competencies")
          .select("curriculum_unit_id,competency_code,competency_text,sequence_number")
          .in("curriculum_unit_id", unitIds)
          .order("sequence_number")
      : null,
    "Unable to load curriculum competencies.",
  );

  const objectivesByUnit: Record<string, TeachingObjectiveRow[]> = {};
  for (const row of objectiveRows) {
    const list = objectivesByUnit[row.curriculum_unit_id] ?? [];
    list.push({ unitId: row.curriculum_unit_id, code: row.objective_code, text: row.objective_text });
    objectivesByUnit[row.curriculum_unit_id] = list;
  }
  const competenciesByUnit: Record<string, TeachingCompetencyRow[]> = {};
  for (const row of competencyRows) {
    const list = competenciesByUnit[row.curriculum_unit_id] ?? [];
    list.push({ unitId: row.curriculum_unit_id, code: row.competency_code, text: row.competency_text });
    competenciesByUnit[row.curriculum_unit_id] = list;
  }

  const dayOverrideRows = await fetchRows(
    supabase
      .from("school_day_overrides")
      .select("school_date,is_school_day,reason,source")
      .eq("school_id", input.schoolId)
      .gte("school_date", `${input.academicYear}-01-01`)
      .lte("school_date", `${input.academicYear}-12-31`)
      .order("school_date"),
    "Unable to load school day calendar.",
  );

  const dayOverrides: TeachingDayOverride[] = dayOverrideRows.map((row) => ({
    date: row.school_date,
    isSchoolDay: row.is_school_day,
    reason: row.reason,
    source: row.source,
  }));

  return {
    today,
    academicYear: input.academicYear,
    academicYearStatus: calendar.academicYear?.status ?? null,
    terms,
    currentTerm,
    allocations,
    planByAllocation,
    planItems,
    scheduleItems,
    preparations,
    actuals,
    objectivesByUnit,
    competenciesByUnit,
    dayOverrides,
    curriculumVersionIds: [...curriculumVersionIds],
    planningOfferings,
    hasLeadershipAuthority: leadershipRoles.has(input.roleKey),
    isTeacher: input.roleKey === "teacher" || input.roleKey === "class_teacher",
  };
}

/**
 * Authoring-scoped read for the governed /teaching/planning route.
 *
 * This is the connected-plan workspace read plus the bounded option sets an
 * authoring form needs: the official curriculum units of the versions this
 * actor can actually reach, the register classes behind their active
 * allocations, and per-plan progress. It introduces no parallel store, and it
 * stays in this server module (never in the route) so authoring and viewing
 * share exactly one read model.
 */
export async function getTeachingPlanningData(input: {
  schoolId: string;
  academicYear: number;
  roleKey: string;
  staffMemberId?: string | null;
}): Promise<TeachingPlanningData> {
  const workspace = await getTeachingWorkspace({
    ...input,
    includeConfiguredOfferings: true,
  });
  const supabase = await createSupabaseServerClient();

  // Official curriculum registry content for the versions in scope. Read-only.
  const units: TeachingUnitOption[] = [];
  if (workspace.curriculumVersionIds.length) {
    const unitRows = await fetchRows(
      supabase
        .from("curriculum_units")
        .select("id,curriculum_version_id,unit_code,topic,theme")
        .in("curriculum_version_id", workspace.curriculumVersionIds)
        .order("unit_code"),
      "Unable to load curriculum units.",
    );
    for (const row of unitRows) {
      units.push({
        unitId: row.id,
        unitCode: row.unit_code ?? "",
        topic: row.topic,
        theme: row.theme,
        curriculumVersionId: row.curriculum_version_id,
      });
    }
  }

  // Current-year classes are the canonical class scope for class plans and
  // scheduling. The UI narrows them to the selected offering grade.
  const classes: PlanningClassOption[] = [];
  const classRows = await fetchRows(
    supabase
      .from("register_classes")
      .select("id,display_name,grade_id,grades(display_name)")
      .eq("school_id", input.schoolId)
      .eq("academic_year", input.academicYear)
      .order("display_name"),
    "Unable to load register classes.",
  );
  for (const row of classRows) {
    const grade = one(row.grades);
    if (!grade?.display_name) continue;
    classes.push({
      classId: row.id,
      className: row.display_name ?? "Class",
      gradeId: row.grade_id,
      gradeName: grade.display_name,
    });
  }

  const planningAllocations: PlanningAllocationOption[] = workspace.allocations.map((row) => ({
    allocationId: row.allocationId,
    classId: row.classId,
    className: row.className,
    gradeName: row.gradeName,
    subjectName: row.subjectName,
    offeringId: row.offeringId,
    curriculumVersionId: row.curriculumVersionId,
    activeFrom: row.activeFrom,
    activeTo: row.activeTo,
  }));

  const itemCountByPlan = new Map<string, number>();
  const planIdByPlanItem = new Map<string, string>();
  for (const item of workspace.planItems) {
    itemCountByPlan.set(item.planId, (itemCountByPlan.get(item.planId) ?? 0) + 1);
    planIdByPlanItem.set(item.itemId, item.planId);
  }
  const scheduledByPlan = new Map<string, number>();
  for (const schedule of workspace.scheduleItems) {
    const planId = planIdByPlanItem.get(schedule.planItemId);
    if (planId) scheduledByPlan.set(planId, (scheduledByPlan.get(planId) ?? 0) + 1);
  }

  const allocationByOffering = new Map(
    workspace.allocations.map((row) => [row.offeringId, row] as const),
  );

  const planSummaries: PlanningPlanSummary[] = Object.values(workspace.planByAllocation)
    .flat()
    .map((plan) => {
      const allocation = allocationByOffering.get(plan.offeringId) ?? null;
      return {
        planId: plan.planId,
        planLevel: plan.planLevel,
        status: plan.status,
        curriculumVersionId: plan.curriculumVersionId,
        offeringId: plan.offeringId,
        subjectName: allocation?.subjectName ?? "Subject",
        gradeName: allocation?.gradeName ?? "Grade",
        className: allocation?.className ?? null,
        itemCount: itemCountByPlan.get(plan.planId) ?? 0,
        scheduledCount: scheduledByPlan.get(plan.planId) ?? 0,
      };
    });

  return {
    ...workspace,
    units,
    classes,
    planningAllocations,
    planSummaries,
  };
}
