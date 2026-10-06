import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getNamibiaDateKey } from "@/lib/namibia-date";

export type TermCalendarSummary = {
  academicTermId: string;
  termNumber: number;
  termName: string;
  learnerStartsOn: string | null;
  learnerEndsOn: string | null;
  teacherStartsOn: string | null;
  teacherEndsOn: string | null;
  officialLearnerDayCount: number | null;
  calculatedLearnerDayCount: number;
  sourceLabel: string | null;
  sourceReference: string | null;
};

export type OperationalCalendarEvent = {
  id: string;
  scopeKind: "school" | "department";
  eventKind: string;
  title: string;
  startsOn: string;
  endsOn: string;
  startsAt: string | null;
  endsAt: string | null;
  audienceScope: string;
  description: string | null;
  learnerDayEffect: string;
  departmentLabel: string | null;
  targetStaffMemberId: string | null;
  linkedPath: string | null;
};

export type DepartmentCalendarOption = {
  assignmentId: string;
  label: string;
  subjectNames: string[];
};

export type CalendarStaffOption = {
  staffMemberId: string;
  label: string;
};

function datePlusDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mapOperationalEvent(row: Record<string, unknown>): OperationalCalendarEvent {
  return {
    id: String(row.event_id),
    scopeKind: String(row.scope_kind) as OperationalCalendarEvent["scopeKind"],
    eventKind: String(row.event_kind),
    title: String(row.title),
    startsOn: String(row.starts_on).slice(0, 10),
    endsOn: String(row.ends_on).slice(0, 10),
    startsAt: row.starts_at ? String(row.starts_at) : null,
    endsAt: row.ends_at ? String(row.ends_at) : null,
    audienceScope: String(row.audience_scope),
    description: row.description ? String(row.description) : null,
    learnerDayEffect: String(row.learner_day_effect),
    departmentLabel: row.department_label ? String(row.department_label) : null,
    targetStaffMemberId: row.target_staff_member_id ? String(row.target_staff_member_id) : null,
    linkedPath: row.linked_path ? String(row.linked_path) : null,
  };
}

export async function getOperationalCalendarWorkspace(input: {
  schoolId: string;
  academicYear: number;
  staffMemberId: string | null;
  canManageSchool: boolean;
  canManageDepartment: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const yearStart = `${input.academicYear}-01-01`;
  const yearEnd = `${input.academicYear}-12-31`;
  const loadManagementScope = input.canManageDepartment || input.canManageSchool;

  const [
    termResult,
    eventResult,
    responsibilityResult,
    staffAssignmentResult,
    subjectResult,
  ] = await Promise.all([
    supabase.rpc("list_academic_term_calendar_summary", {
      p_school_id: input.schoolId,
      p_academic_year: input.academicYear,
    }),
    supabase.rpc("list_my_operational_calendar_events", {
      p_school_id: input.schoolId,
      p_from: yearStart,
      p_to: yearEnd,
    }),
    loadManagementScope
      ? supabase
          .from("subject_department_responsibilities")
          .select("subject_id,department_head_staff_assignment_id,department_label,effective_from,effective_to")
          .eq("school_id", input.schoolId)
      : Promise.resolve({ data: [], error: null }),
    loadManagementScope
      ? supabase
          .from("staff_school_assignments")
          .select("id,staff_member_id,effective_from,effective_to")
          .eq("school_id", input.schoolId)
      : Promise.resolve({ data: [], error: null }),
    loadManagementScope
      ? supabase
          .from("subjects")
          .select("id,display_name")
          .eq("school_id", input.schoolId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (
    termResult.error ||
    eventResult.error ||
    responsibilityResult.error ||
    staffAssignmentResult.error ||
    subjectResult.error
  ) {
    console.error("[calendar] operational workspace query failed", {
      terms: termResult.error,
      events: eventResult.error,
      responsibilities: responsibilityResult.error,
      assignments: staffAssignmentResult.error,
      subjects: subjectResult.error,
    });
    throw new Error("Unable to load the operational calendar workspace.");
  }

  const today = getNamibiaDateKey();
  const active = (from: string, to: string | null) => from <= today && (!to || to >= today);
  const activeAssignments = (staffAssignmentResult.data ?? []).filter((row) =>
    active(row.effective_from, row.effective_to),
  );
  const assignmentById = new Map(activeAssignments.map((row) => [row.id, row]));
  const subjectNameById = new Map(
    (subjectResult.data ?? []).map((row) => [row.id, row.display_name]),
  );

  const departmentMap = new Map<string, DepartmentCalendarOption>();
  for (const row of responsibilityResult.data ?? []) {
    const assignment = assignmentById.get(row.department_head_staff_assignment_id);
    if (!assignment || !active(row.effective_from, row.effective_to)) continue;
    if (
      input.canManageDepartment &&
      !input.canManageSchool &&
      (!input.staffMemberId || assignment.staff_member_id !== input.staffMemberId)
    ) continue;

    const existing = departmentMap.get(row.department_head_staff_assignment_id);
    const subjectName = subjectNameById.get(row.subject_id) ?? "Subject";
    if (existing) {
      if (!existing.subjectNames.includes(subjectName)) existing.subjectNames.push(subjectName);
      continue;
    }
    departmentMap.set(row.department_head_staff_assignment_id, {
      assignmentId: row.department_head_staff_assignment_id,
      label: row.department_label?.trim() || "Department",
      subjectNames: [subjectName],
    });
  }

  const staffIds = [...new Set(activeAssignments.map((row) => row.staff_member_id))];
  const staffResult = staffIds.length
    ? await supabase
        .from("staff_members")
        .select("id,first_name,last_name,employee_number")
        .in("id", staffIds)
        .order("last_name")
    : { data: [], error: null };

  if (staffResult.error) {
    console.error("[calendar] staff options query failed", staffResult.error);
    throw new Error("Unable to load calendar staff options.");
  }

  const terms = ((termResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    academicTermId: String(row.academic_term_id),
    termNumber: Number(row.term_number),
    termName: String(row.term_name ?? `Term ${row.term_number}`),
    learnerStartsOn: row.learner_starts_on ? String(row.learner_starts_on).slice(0, 10) : null,
    learnerEndsOn: row.learner_ends_on ? String(row.learner_ends_on).slice(0, 10) : null,
    teacherStartsOn: row.teacher_starts_on ? String(row.teacher_starts_on).slice(0, 10) : null,
    teacherEndsOn: row.teacher_ends_on ? String(row.teacher_ends_on).slice(0, 10) : null,
    officialLearnerDayCount: row.official_learner_day_count == null ? null : Number(row.official_learner_day_count),
    calculatedLearnerDayCount: Number(row.calculated_learner_day_count ?? 0),
    sourceLabel: row.source_label ? String(row.source_label) : null,
    sourceReference: row.source_reference ? String(row.source_reference) : null,
  })) satisfies TermCalendarSummary[];

  return {
    terms,
    events: ((eventResult.data ?? []) as Array<Record<string, unknown>>).map(mapOperationalEvent),
    departments: [...departmentMap.values()].sort((a, b) => a.label.localeCompare(b.label)),
    staffOptions: (staffResult.data ?? []).map((row) => ({
      staffMemberId: row.id,
      label: `${row.last_name}, ${row.first_name}${row.employee_number ? ` · ${row.employee_number}` : ""}`,
    })) satisfies CalendarStaffOption[],
  };
}

export async function getUpcomingOperationalCalendarEvents(schoolId: string, days = 30) {
  const supabase = await createSupabaseServerClient();
  const from = getNamibiaDateKey();
  const to = datePlusDays(from, days);
  const { data, error } = await supabase.rpc("list_my_operational_calendar_events", {
    p_school_id: schoolId,
    p_from: from,
    p_to: to,
  });
  if (error) {
    console.error("[calendar] upcoming operational events failed", error);
    return [] as OperationalCalendarEvent[];
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapOperationalEvent);
}
