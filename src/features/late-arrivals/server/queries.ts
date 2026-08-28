import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LateArrivalLearner = { enrolmentId: string; learnerId: string; name: string; admissionNumber: string | null; registerClass: string };
export type LateDetentionItem = { id: string; learnerId: string; learnerName: string; lateCount: number; dueOn: string; status: string; weekStart: string };

export async function getLateArrivalWorkspace(schoolId: string, academicYear: number) {
  const supabase = await createSupabaseServerClient();
  const { data: enrolments } = await supabase.from("enrolments").select("id,learner_id,admission_number,register_class_id").eq("school_id", schoolId).eq("academic_year", academicYear).eq("status", "current");
  const learnerIds = (enrolments ?? []).map((item) => item.learner_id);
  const classIds = (enrolments ?? []).map((item) => item.register_class_id);
  const [{ data: learners }, { data: classes }, { data: obligations }] = await Promise.all([
    learnerIds.length ? supabase.from("learners").select("id,first_names,surname").in("id", learnerIds) : Promise.resolve({ data: [] }),
    classIds.length ? supabase.from("register_classes").select("id,display_name").in("id", classIds) : Promise.resolve({ data: [] }),
    supabase.from("late_detention_obligations").select("id,learner_id,qualifying_week_start,qualifying_late_count,due_on,status").eq("school_id", schoolId).in("status", ["pending", "carried_forward"]).order("due_on"),
  ]);
  const learnerMap = new Map((learners ?? []).map((item) => [item.id, item]));
  const classMap = new Map((classes ?? []).map((item) => [item.id, item.display_name]));
  const roster: LateArrivalLearner[] = (enrolments ?? []).map((item) => {
    const learner = learnerMap.get(item.learner_id);
    return { enrolmentId: item.id, learnerId: item.learner_id, name: learner ? `${learner.first_names} ${learner.surname}` : "Learner", admissionNumber: item.admission_number, registerClass: classMap.get(item.register_class_id) ?? "Class" };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const names = new Map(roster.map((item) => [item.learnerId, item.name]));
  const detention: LateDetentionItem[] = (obligations ?? []).map((item) => ({ id: item.id, learnerId: item.learner_id, learnerName: names.get(item.learner_id) ?? "Learner", lateCount: item.qualifying_late_count, dueOn: item.due_on, status: item.status, weekStart: item.qualifying_week_start }));
  return { learners: roster, detention };
}
