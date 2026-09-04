import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LateArrivalLearner = {
  enrolmentId: string;
  learnerId: string;
  name: string;
  admissionNumber: string | null;
  registerClass: string;
  triggerProgress: number;
  triggerThreshold: number;
  totalLateCount: number;
  weekLateDates: string[];
  lastLateDate: string | null;
};

export type LateDetentionItem = {
  id: string;
  learnerId: string;
  learnerName: string;
  dueOn: string;
  originalDueOn: string;
  triggeredOn: string | null;
  status: string;
  rolloverCount: number;
  assignedStaffMemberId: string | null;
  assignedStaffName: string | null;
};

export type DetentionStaffOption = {
  id: string;
  name: string;
  employeeNumber: string | null;
  eligible: boolean;
  availabilityWindows: Array<{
    effectiveFrom: string;
    effectiveTo: string | null;
  }>;
};

type LateArrivalRosterRpcRow = {
  enrolment_id: string;
  learner_id: string;
  learner_name: string;
  admission_number: string | null;
  class_name: string;
  trigger_progress: number;
  trigger_threshold: number;
  total_late_count: number;
  week_late_dates: string[] | null;
  last_late_date: string | null;
};

type PlanningStaffRpcRow = {
  staff_member_id: string;
  employee_number: string | null;
  first_name: string;
  last_name: string;
  eligible: boolean;
  effective_from: string;
  effective_to: string | null;
};

function currentWeekRange(today: string) {
  const current = new Date(`${today}T12:00:00`);
  const day = current.getDay() || 7;
  const monday = new Date(current);
  monday.setDate(current.getDate() - day + 1);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return { monday: monday.toISOString().slice(0, 10), friday: friday.toISOString().slice(0, 10) };
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function getLateArrivalWorkspace(schoolId: string, academicYear: number, today: string) {
  const supabase = await createSupabaseServerClient();
  const { monday, friday } = currentWeekRange(today);
  const planningHorizon = addDays(today, 70);

  const [rosterResult, obligationsResult, staffResult] = await Promise.all([
    supabase.rpc("list_late_arrival_roster_summary", {
      p_school_id: schoolId,
      p_academic_year: academicYear,
      p_week_start: monday,
      p_week_end: friday,
    }),
    supabase.from("late_detention_obligations").select("id,learner_id,due_on,original_due_on,triggered_on,status,rollover_count,assigned_staff_member_id").eq("school_id", schoolId).in("status", ["pending", "carried_forward"]).order("due_on"),
    supabase.rpc("list_detention_planning_staff", {
      p_school_id: schoolId,
      p_from_date: today,
      p_to_date: planningHorizon,
    }),
  ]);

  if (rosterResult.error || obligationsResult.error || staffResult.error) {
    throw new Error("Unable to load the late-arrival workspace.");
  }

  const roster: LateArrivalLearner[] = ((rosterResult.data ?? []) as LateArrivalRosterRpcRow[]).map((row) => ({
    enrolmentId: row.enrolment_id,
    learnerId: row.learner_id,
    name: row.learner_name,
    admissionNumber: row.admission_number,
    registerClass: row.class_name,
    triggerProgress: row.trigger_progress,
    triggerThreshold: row.trigger_threshold,
    totalLateCount: row.total_late_count,
    weekLateDates: row.week_late_dates ?? [],
    lastLateDate: row.last_late_date,
  }));

  const obligations = obligationsResult.data ?? [];
  const staffMap = new Map<string, DetentionStaffOption>();
  for (const row of (staffResult.data ?? []) as PlanningStaffRpcRow[]) {
    const window = { effectiveFrom: row.effective_from, effectiveTo: row.effective_to };
    const existing = staffMap.get(row.staff_member_id);
    if (existing) {
      if (!existing.availabilityWindows.some((entry) => entry.effectiveFrom === window.effectiveFrom && entry.effectiveTo === window.effectiveTo)) {
        existing.availabilityWindows.push(window);
      }
      existing.eligible = existing.eligible || row.eligible;
      continue;
    }
    staffMap.set(row.staff_member_id, {
      id: row.staff_member_id,
      name: `${row.first_name} ${row.last_name}`,
      employeeNumber: row.employee_number,
      eligible: row.eligible,
      availabilityWindows: [window],
    });
  }

  const obligationStaffIds = obligations
    .map((item) => item.assigned_staff_member_id)
    .filter((id): id is string => Boolean(id));
  const missingAssignedStaffIds = [...new Set(obligationStaffIds.filter((id) => !staffMap.has(id)))];
  const { data: missingAssignedStaff, error: missingAssignedStaffError } = missingAssignedStaffIds.length
    ? await supabase.from("staff_members").select("id,employee_number,first_name,last_name").in("id", missingAssignedStaffIds)
    : { data: [], error: null };
  if (missingAssignedStaffError) throw new Error("Unable to load assigned detention staff.");

  const assignedNameMap = new Map<string, string>();
  for (const member of staffMap.values()) assignedNameMap.set(member.id, member.name);
  for (const member of missingAssignedStaff ?? []) assignedNameMap.set(member.id, `${member.first_name} ${member.last_name}`);

  const names = new Map(roster.map((item) => [item.learnerId, item.name]));
  const detention: LateDetentionItem[] = obligations.map((item) => ({
    id: item.id,
    learnerId: item.learner_id,
    learnerName: names.get(item.learner_id) ?? "Learner",
    dueOn: item.due_on,
    originalDueOn: item.original_due_on ?? item.due_on,
    triggeredOn: item.triggered_on,
    status: item.status,
    rolloverCount: item.rollover_count ?? 0,
    assignedStaffMemberId: item.assigned_staff_member_id,
    assignedStaffName: item.assigned_staff_member_id ? assignedNameMap.get(item.assigned_staff_member_id) ?? "Assigned staff" : null,
  }));

  const staffOptions = [...staffMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { learners: roster, detention, staffOptions };
}
