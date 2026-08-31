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

  const [{ data: enrolments }, { data: policy }, { data: obligations }, { data: assignments }, { data: preferences }] = await Promise.all([
    supabase.from("enrolments").select("id,learner_id,admission_number,register_class_id").eq("school_id", schoolId).eq("academic_year", academicYear).eq("status", "current"),
    supabase.from("school_late_arrival_policies").select("cumulative_threshold").eq("school_id", schoolId).maybeSingle(),
    supabase.from("late_detention_obligations").select("id,learner_id,due_on,original_due_on,triggered_on,status,rollover_count,assigned_staff_member_id").eq("school_id", schoolId).in("status", ["pending", "carried_forward"]).order("due_on"),
    supabase.from("staff_school_assignments").select("staff_member_id,effective_from,effective_to").eq("school_id", schoolId).lte("effective_from", today).or(`effective_to.is.null,effective_to.gte.${today}`),
    supabase.from("detention_supervision_preferences").select("staff_member_id,eligible").eq("school_id", schoolId),
  ]);

  const learnerIds = (enrolments ?? []).map((item) => item.learner_id);
  const classIds = (enrolments ?? []).map((item) => item.register_class_id);
  const obligationStaffIds = (obligations ?? [])
    .map((item) => item.assigned_staff_member_id)
    .filter((id): id is string => Boolean(id));
  const staffIds = [...new Set([...(assignments ?? []).map((item) => item.staff_member_id), ...obligationStaffIds])];

  const [{ data: learners }, { data: classes }, { data: yearEvents }, { data: staff }] = await Promise.all([
    learnerIds.length ? supabase.from("learners").select("id,first_names,surname").in("id", learnerIds) : Promise.resolve({ data: [] }),
    classIds.length ? supabase.from("register_classes").select("id,display_name").in("id", classIds) : Promise.resolve({ data: [] }),
    learnerIds.length ? supabase.from("school_late_arrival_events").select("learner_id,arrival_date").eq("school_id", schoolId).in("learner_id", learnerIds).gte("arrival_date", `${academicYear}-01-01`).lte("arrival_date", `${academicYear}-12-31`).order("arrival_date", { ascending: false }) : Promise.resolve({ data: [] }),
    staffIds.length ? supabase.from("staff_members").select("id,employee_number,first_name,last_name,status").in("id", staffIds) : Promise.resolve({ data: [] }),
  ]);

  const learnerMap = new Map((learners ?? []).map((item) => [item.id, item]));
  const classMap = new Map((classes ?? []).map((item) => [item.id, item.display_name]));
  const staffMap = new Map((staff ?? []).map((item) => [item.id, item]));
  const preferenceMap = new Map((preferences ?? []).map((item) => [item.staff_member_id, item.eligible]));
  const threshold = Math.max(1, Number(policy?.cumulative_threshold ?? 3));

  const eventDates = new Map<string, string[]>();
  for (const event of yearEvents ?? []) {
    const current = eventDates.get(event.learner_id) ?? [];
    current.push(event.arrival_date);
    eventDates.set(event.learner_id, current);
  }

  const roster: LateArrivalLearner[] = (enrolments ?? []).map((item) => {
    const learner = learnerMap.get(item.learner_id);
    const dates = eventDates.get(item.learner_id) ?? [];
    const weekLateDates = dates.filter((date) => date >= monday && date <= friday);
    return {
      enrolmentId: item.id,
      learnerId: item.learner_id,
      name: learner ? `${learner.first_names} ${learner.surname}` : "Learner",
      admissionNumber: item.admission_number,
      registerClass: classMap.get(item.register_class_id) ?? "Class",
      triggerProgress: dates.length % threshold,
      triggerThreshold: threshold,
      totalLateCount: dates.length,
      weekLateDates,
      lastLateDate: dates[0] ?? null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const names = new Map(roster.map((item) => [item.learnerId, item.name]));
  const detention: LateDetentionItem[] = (obligations ?? []).map((item) => {
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
  for (const assignment of assignments ?? []) {
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
