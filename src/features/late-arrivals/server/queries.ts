import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LateArrivalLearner = {
  enrolmentId: string;
  learnerId: string;
  name: string;
  admissionNumber: string | null;
  registerClass: string;
  weekLateCount: number;
  lastLateDate: string | null;
};

export type LateDetentionItem = {
  id: string;
  learnerId: string;
  learnerName: string;
  lateCount: number;
  dueOn: string;
  status: string;
  weekStart: string;
};

function currentWeekRange() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(now.getDate() - day + 1);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return { monday: monday.toISOString().slice(0, 10), friday: friday.toISOString().slice(0, 10) };
}

export async function getLateArrivalWorkspace(schoolId: string, academicYear: number) {
  const supabase = await createSupabaseServerClient();
  const { monday, friday } = currentWeekRange();
  const { data: enrolments } = await supabase.from("enrolments").select("id,learner_id,admission_number,register_class_id").eq("school_id", schoolId).eq("academic_year", academicYear).eq("status", "current");
  const learnerIds = (enrolments ?? []).map((item) => item.learner_id);
  const classIds = (enrolments ?? []).map((item) => item.register_class_id);
  const [{ data: learners }, { data: classes }, { data: obligations }, { data: weekEvents }] = await Promise.all([
    learnerIds.length ? supabase.from("learners").select("id,first_names,surname").in("id", learnerIds) : Promise.resolve({ data: [] }),
    classIds.length ? supabase.from("register_classes").select("id,display_name").in("id", classIds) : Promise.resolve({ data: [] }),
    supabase.from("late_detention_obligations").select("id,learner_id,qualifying_week_start,qualifying_late_count,due_on,status").eq("school_id", schoolId).in("status", ["pending", "carried_forward"]).order("due_on"),
    supabase.from("school_late_arrival_events").select("learner_id,arrival_date").eq("school_id", schoolId).gte("arrival_date", monday).lte("arrival_date", friday).order("arrival_date", { ascending: false }),
  ]);

  const learnerMap = new Map((learners ?? []).map((item) => [item.id, item]));
  const classMap = new Map((classes ?? []).map((item) => [item.id, item.display_name]));
  const weekCountMap = new Map<string, number>();
  const lastLateMap = new Map<string, string>();
  for (const event of weekEvents ?? []) {
    weekCountMap.set(event.learner_id, (weekCountMap.get(event.learner_id) ?? 0) + 1);
    if (!lastLateMap.has(event.learner_id)) lastLateMap.set(event.learner_id, event.arrival_date);
  }

  const roster: LateArrivalLearner[] = (enrolments ?? []).map((item) => {
    const learner = learnerMap.get(item.learner_id);
    return {
      enrolmentId: item.id,
      learnerId: item.learner_id,
      name: learner ? `${learner.first_names} ${learner.surname}` : "Learner",
      admissionNumber: item.admission_number,
      registerClass: classMap.get(item.register_class_id) ?? "Class",
      weekLateCount: weekCountMap.get(item.learner_id) ?? 0,
      lastLateDate: lastLateMap.get(item.learner_id) ?? null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const names = new Map(roster.map((item) => [item.learnerId, item.name]));
  const detention: LateDetentionItem[] = (obligations ?? []).map((item) => ({
    id: item.id,
    learnerId: item.learner_id,
    learnerName: names.get(item.learner_id) ?? "Learner",
    lateCount: item.qualifying_late_count,
    dueOn: item.due_on,
    status: item.status,
    weekStart: item.qualifying_week_start,
  }));

  return { learners: roster, detention };
}
