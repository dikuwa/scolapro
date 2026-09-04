import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DetentionPlanningStaff = {
  id: string;
  name: string;
  employeeNumber: string | null;
  eligible: boolean;
  availabilityWindows: Array<{
    effectiveFrom: string;
    effectiveTo: string | null;
  }>;
};

export type DetentionPlanningLearner = {
  obligationId: string;
  learnerId: string;
  learnerName: string;
  registerClass: string;
  dueOn: string;
  status: string;
};

export type DetentionPlanningSession = {
  id: string;
  sessionDate: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  status: string;
  supervisorIds: string[];
  learnerAssignments: Array<{
    obligationId: string;
    learnerId: string;
    supervisorStaffMemberId: string | null;
    attendanceStatus: string;
  }>;
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

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isDetentionStaffAvailableOn(member: DetentionPlanningStaff, date: string) {
  return member.availabilityWindows.some(
    (window) => window.effectiveFrom <= date && (window.effectiveTo === null || window.effectiveTo >= date),
  );
}

export async function getDetentionPlanning(schoolId: string, today: string) {
  const supabase = await createSupabaseServerClient();
  const horizon = addDays(today, 70);

  const [sessionsResult, obligationsResult, staffResult] = await Promise.all([
    supabase
      .from("detention_sessions")
      .select("id,session_date,starts_at,ends_at,location,status")
      .eq("school_id", schoolId)
      .in("status", ["planned", "open"])
      .gte("session_date", today)
      .lte("session_date", horizon)
      .order("session_date", { ascending: true }),
    supabase
      .from("late_detention_obligations")
      .select("id,learner_id,due_on,status")
      .eq("school_id", schoolId)
      .in("status", ["pending", "carried_forward"])
      .lte("due_on", horizon)
      .order("due_on", { ascending: true }),
    supabase.rpc("list_detention_planning_staff", {
      p_school_id: schoolId,
      p_from_date: today,
      p_to_date: horizon,
    }),
  ]);

  if (sessionsResult.error || obligationsResult.error || staffResult.error) {
    throw new Error("Unable to load detention planning data.");
  }

  const sessions = sessionsResult.data ?? [];
  const obligations = obligationsResult.data ?? [];
  const sessionIds = sessions.map((item) => item.id);
  const learnerIds = [...new Set(obligations.map((item) => item.learner_id))];

  const [supervisorsResult, itemsResult, learnersResult, enrolmentsResult] = await Promise.all([
    sessionIds.length
      ? supabase.from("detention_session_supervisors").select("detention_session_id,staff_member_id").in("detention_session_id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? supabase.from("detention_session_items").select("detention_session_id,obligation_id,learner_id,assigned_supervisor_staff_member_id,attendance_status").in("detention_session_id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
    learnerIds.length
      ? supabase.from("learners").select("id,first_names,surname").in("id", learnerIds)
      : Promise.resolve({ data: [], error: null }),
    learnerIds.length
      ? supabase.from("enrolments").select("learner_id,register_class_id").eq("school_id", schoolId).eq("status", "current").in("learner_id", learnerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (supervisorsResult.error || itemsResult.error || learnersResult.error || enrolmentsResult.error) {
    throw new Error("Unable to load detention planning details.");
  }

  const enrolments = enrolmentsResult.data ?? [];
  const classIds = [...new Set(enrolments.map((item) => item.register_class_id).filter((id): id is string => Boolean(id)))];
  const { data: classes, error: classesError } = classIds.length
    ? await supabase.from("register_classes").select("id,display_name").in("id", classIds)
    : { data: [], error: null };
  if (classesError) throw new Error("Unable to load detention learner classes.");

  const learnerMap = new Map((learnersResult.data ?? []).map((item) => [item.id, item]));
  const enrolmentMap = new Map(enrolments.map((item) => [item.learner_id, item]));
  const classMap = new Map((classes ?? []).map((item) => [item.id, item.display_name]));

  const staffMap = new Map<string, DetentionPlanningStaff>();
  for (const item of (staffResult.data ?? []) as PlanningStaffRpcRow[]) {
    const existing = staffMap.get(item.staff_member_id);
    const window = { effectiveFrom: item.effective_from, effectiveTo: item.effective_to };
    if (existing) {
      if (!existing.availabilityWindows.some((entry) => entry.effectiveFrom === window.effectiveFrom && entry.effectiveTo === window.effectiveTo)) {
        existing.availabilityWindows.push(window);
      }
      existing.eligible = existing.eligible || item.eligible;
      continue;
    }
    staffMap.set(item.staff_member_id, {
      id: item.staff_member_id,
      name: `${item.first_name} ${item.last_name}`,
      employeeNumber: item.employee_number,
      eligible: item.eligible,
      availabilityWindows: [window],
    });
  }
  const staff = [...staffMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  const queue: DetentionPlanningLearner[] = obligations.map((item) => {
    const learner = learnerMap.get(item.learner_id);
    const enrolment = enrolmentMap.get(item.learner_id);
    return {
      obligationId: item.id,
      learnerId: item.learner_id,
      learnerName: learner ? `${learner.first_names} ${learner.surname}` : "Learner",
      registerClass: enrolment?.register_class_id ? classMap.get(enrolment.register_class_id) ?? "Unassigned class" : "Unassigned class",
      dueOn: item.due_on,
      status: item.status,
    };
  });

  const supervisors = supervisorsResult.data ?? [];
  const items = itemsResult.data ?? [];
  const planningSessions: DetentionPlanningSession[] = sessions.map((session) => ({
    id: session.id,
    sessionDate: session.session_date,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    location: session.location,
    status: session.status,
    supervisorIds: supervisors.filter((item) => item.detention_session_id === session.id).map((item) => item.staff_member_id),
    learnerAssignments: items
      .filter((item) => item.detention_session_id === session.id)
      .map((item) => ({
        obligationId: item.obligation_id,
        learnerId: item.learner_id,
        supervisorStaffMemberId: item.assigned_supervisor_staff_member_id,
        attendanceStatus: item.attendance_status,
      })),
  }));

  return { sessions: planningSessions, queue, staff };
}
