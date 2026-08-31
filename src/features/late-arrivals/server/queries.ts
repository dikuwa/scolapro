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

export async function getLateArrivalWorkspace(schoolId: string, academicYear: number, today: string) {
  const supabase = await createSupabaseServerClient();
  const { monday, friday } = currentWeekRange(today);

  const [rosterResult, obligationsResult, assignmentsResult, preferencesResult] = await Promise.all([
    supabase.rpc("list_late_arrival_roster_summary", {
      p_school_id: schoolId,
      p_academic_year: academicYear,
      p_week_start: monday,
      p_week_end: friday,
    }),
    supabase.from("late_detention_obligations").select("id,learner_id,due_on,original_due_on,triggered_on,status,rollover_count,assigned_staff_member_id").eq("school_id", schoolId).in("status", ["pending", "carried_forward"]).order("due_on"),
    supabase.from("staff_school_assignments").select("staff_member_id,effective_from,effective_to").eq("school_id", schoolId).lte("effective_from", today).or(`effective_to.is.null,effective_to.gte.${today}`),
    supabase.from("detention_supervision_preferences").select("staff_member_id,eligible").eq("school_id", schoolId),
  ]);

  if (rosterResult.error || obligationsResult.error || assignmentsResult.error || preferencesResult.error) {
    throw new Error("Unable to load the late-arrival workspace.");
  }

  const roster: LateArrivalLearner[] = (rosterResult.data ?? []).map((row) => ({
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
  const assignments = assignmentsResult.data ?? [];
  const preferences = preferencesResult.data ?? [];
  const obligationStaffIds = obligations
    .map((item) => item.assigned_staff_member_id)
    .filter((id): id is string => Boolean(id));
  const staffIds = [...new Set([...assignments.map((item) => item.staff_member_id), ...obligationStaffIds])];

  const { data: staff, error: staffError } = staffIds.length
    ? await supabase.from("staff_members").select("id,employee_number,first_name,last_name,status").in("id", staffIds)
    : { data: [], error: null };
  if (staffError) throw new Error("Unable to load detention staff.");

  const staffMap = new Map((staff ?? []).map((item) => [item.id, item]));
  const preferenceMap = new Map(preferences.map((item) => [item.staff_member_id, item.eligible]));
  const names = new Map(roster.map((item) => [item.learnerId, item.name]));

  const detention: LateDetentionItem[] = obligations.map((item) => {
    const assigned = item.assigned_staff_member_id ? staffMap.get(item.assigned_staff_member_id) : null;
    return {
      id: item.id,
      learnerId: item.learner_id,
      learnerName: names.get(item.learner_id) ?? "Learner",
      dueOn: item.due_on,
      originalDueOn: item.original_due_on ?? item.due_on,
      triggeredOn: item.triggered_on,
      status: item.status,
      rolloverCount: item.rollover_count ?? 0,
      assignedStaffMemberId: item.assigned_staff_member_id,
      assignedStaffName: assigned ? `${assigned.first_name} ${assigned.last_name}` : null,
    };
  });

  const staffOptions: DetentionStaffOption[] = [];
  const seenStaffIds = new Set<string>();
  for (const assignment of assignments) {
    if (seenStaffIds.has(assignment.staff_member_id)) continue;
    const member = staffMap.get(assignment.staff_member_id);
    if (!member || member.status !== "active") continue;
    seenStaffIds.add(member.id);
    staffOptions.push({
      id: member.id,
      name: `${member.first_name} ${member.last_name}`,
      employeeNumber: member.employee_number,
      eligible: preferenceMap.get(member.id) ?? true,
    });
  }
  staffOptions.sort((a, b) => a.name.localeCompare(b.name));

  return { learners: roster, detention, staffOptions };
}