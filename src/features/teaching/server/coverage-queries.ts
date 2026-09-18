import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getNamibiaDateKey } from "@/lib/namibia-date";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CoverageAllocation = {
  allocationId: string;
  classId: string | null;
  className: string;
  gradeName: string;
  subjectName: string;
  subjectId: string;
  activeFrom: string;
  activeTo: string | null;
};

export type CoverageScheduleItem = {
  itemId: string;
  planItemId: string;
  topic: string;
  unitCode: string;
  plannedOn: string;
  plannedPeriodCount: number;
  status: string;
  movedTo: string | null;
  teacherAllocationId: string;
};

export type CoverageActual = {
  id: string;
  scheduleItemId: string;
  taughtOn: string;
  periodsUsed: number;
  coverageState: string;
  reflection: string | null;
  compensatoryAction: string | null;
  recordedAt: string;
};

export type CoverageWorkspaceData = {
  today: string;
  academicYear: number;
  allocations: CoverageAllocation[];
  scheduleItems: CoverageScheduleItem[];
  actuals: CoverageActual[];
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

type PostgrestLike<T> = { data: T[] | null; error: { message: string } | null };

async function fetchRows<T>(
  builder: { then<U>(onFulfilled: (result: PostgrestLike<T>) => U): unknown } | null,
  message: string,
): Promise<T[]> {
  if (!builder) return [];
  const { data, error } = (await Promise.resolve(builder)) as PostgrestLike<T>;
  if (error) throw new Error(message);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Load the coverage workspace data for a teacher.
 *
 * Reads teaching_schedule_items and teaching_actuals through the existing
 * can_access_teaching_plan RLS boundary — no new migration required. Returns
 * all allocations visible to the caller plus their schedule items and actuals
 * for the given academic year. Leadership roles (school_admin, principal,
 * deputy_principal, hod) can read across all school allocations; teachers and
 * class_teachers see only their own allocations.
 */
export async function getCoverageWorkspace(input: {
  schoolId: string;
  academicYear: number;
}): Promise<CoverageWorkspaceData> {
  const today = getNamibiaDateKey(new Date());
  const supabase = await createSupabaseServerClient();

  // Load teacher allocations scoped to this school and academic year.
  const allocationRows = await fetchRows(
    supabase
      .from("teacher_allocations")
      .select(
        "id,register_class_id,subject_offerings!inner(subject_id,subjects!inner(display_name),grades!inner(display_name)),register_classes(display_name),active_from,active_to",
      )
      .eq("school_id", input.schoolId)
      .eq("academic_year", input.academicYear)
      .lte("active_from", `${input.academicYear}-12-31`)
      .or(`active_to.is.null,active_to.gte.${input.academicYear}-01-01`)
      .order("active_from"),
    "Unable to load teacher allocations.",
  );

  // Build allocations list. If the query returns zero rows for a teacher the
  // caller will see an empty state — the RLS boundary is intact.
  const allocations: CoverageAllocation[] = allocationRows.map((row: Record<string, unknown>) => {
    const offering = row.subject_offerings as Record<string, unknown>;
    const subject = offering.subjects as Record<string, unknown>;
    const grade = offering.grades as Record<string, unknown>;
    const cls = row.register_classes as Record<string, unknown> | null;
    return {
      allocationId: String(row.id),
      classId: row.register_class_id ? String(row.register_class_id) : null,
      className: String(cls?.display_name ?? "Unassigned class"),
      gradeName: String(grade.display_name ?? "Grade"),
      subjectName: String(subject.display_name ?? "Subject"),
      subjectId: String(offering.subject_id ?? ""),
      activeFrom: String(row.active_from),
      activeTo: row.active_to ? String(row.active_to) : null,
    };
  });

  const allocationIds = allocations.map((a) => a.allocationId);

  // Load schedule items for all visible allocations.
  const scheduleRows = await fetchRows(
    allocationIds.length
      ? supabase
          .from("teaching_schedule_items")
          .select(
            "id,pacing_plan_item_id,planned_on,planned_period_count,status,moved_to_date,teacher_allocation_id,pacing_plan_items!inner(curriculum_units!inner(unit_code,topic))",
          )
          .in("teacher_allocation_id", allocationIds)
          .eq("school_id", input.schoolId)
          .order("planned_on")
      : null,
    "Unable to load teaching schedule items.",
  );

  const scheduleItems: CoverageScheduleItem[] = scheduleRows.map((row: Record<string, unknown>) => {
    const planItem = row.pacing_plan_items as Record<string, unknown>;
    const unit = planItem.curriculum_units as Record<string, unknown>;
    return {
      itemId: String(row.id),
      planItemId: String(row.pacing_plan_item_id),
      topic: String(unit.topic),
      unitCode: String(unit.unit_code),
      plannedOn: String(row.planned_on),
      plannedPeriodCount: Number(row.planned_period_count),
      status: String(row.status),
      movedTo: row.moved_to_date ? String(row.moved_to_date) : null,
      teacherAllocationId: String(row.teacher_allocation_id),
    };
  });

  const scheduleItemIds = scheduleItems.map((s) => s.itemId);

  // Load actuals for all visible schedule items.
  const actualRows = await fetchRows(
    scheduleItemIds.length
      ? supabase
          .from("teaching_actuals")
          .select("id,teaching_schedule_item_id,taught_on,periods_used,coverage_state,reflection,compensatory_action,recorded_at")
          .in("teaching_schedule_item_id", scheduleItemIds)
          .order("recorded_at", { ascending: false })
      : null,
    "Unable to load teaching actuals.",
  );

  const actuals: CoverageActual[] = actualRows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    scheduleItemId: String(row.teaching_schedule_item_id),
    taughtOn: String(row.taught_on),
    periodsUsed: Number(row.periods_used),
    coverageState: String(row.coverage_state),
    reflection: row.reflection ? String(row.reflection) : null,
    compensatoryAction: row.compensatory_action ? String(row.compensatory_action) : null,
    recordedAt: String(row.recorded_at),
  }));

  return {
    today,
    academicYear: input.academicYear,
    allocations,
    scheduleItems,
    actuals,
  };
}
