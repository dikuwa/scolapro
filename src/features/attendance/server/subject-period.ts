import { createSupabaseServerClient } from "@/lib/supabase/server";

function one<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export type SubjectPeriodRoster = {
  slot: { id: string; weekday: number; classId: string; className: string; subjectName: string; teacherName: string; periodName: string; roomLabel: string | null; academicYear: number };
  learners: { enrolmentId: string; learnerId: string; name: string; admissionNumber: string | null; status: "present" | "absent" | "late" | "excused" | "unknown"; reasonId: string | null; note: string | null }[];
  reasons: { id: string; name: string; sensitive: boolean }[];
  currentSubmissionId: string | null;
};

export async function getSubjectPeriodRoster(slotId: string, attendanceDate: string): Promise<SubjectPeriodRoster | null> {
  const supabase = await createSupabaseServerClient();
  const { data: slot, error } = await supabase.from("timetable_slots")
    .select("id,school_id,weekday,register_class_id,room_label,academic_year,register_classes(display_name),timetable_periods(display_name),teacher_allocations(staff_member_id,active_from,active_to,staff_members(first_name,last_name,status),subject_offerings(subjects(display_name)))")
    .eq("id", slotId).eq("status", "active").maybeSingle();
  if (error || !slot) return null;

  const classRow = one(slot.register_classes);
  const allocation = one(slot.teacher_allocations);
  if (!allocation || allocation.active_from > attendanceDate || (allocation.active_to && allocation.active_to < attendanceDate)) return null;

  const staff = one(allocation.staff_members);
  const today = new Date().toISOString().slice(0, 10);
  if (attendanceDate >= today && staff?.status !== "active") return null;

  const [{ data: staffAssignments, error: staffAssignmentError }, { data: staffMemberships, error: staffMembershipError }] = await Promise.all([
    supabase.from("staff_school_assignments")
      .select("id")
      .eq("school_id", slot.school_id)
      .eq("staff_member_id", allocation.staff_member_id)
      .lte("effective_from", attendanceDate)
      .or(`effective_to.is.null,effective_to.gte.${attendanceDate}`)
      .limit(1),
    supabase.from("school_memberships")
      .select("id")
      .eq("school_id", slot.school_id)
      .eq("staff_member_id", allocation.staff_member_id)
      .lte("active_from", attendanceDate)
      .or(`active_to.is.null,active_to.gte.${attendanceDate}`)
      .limit(1),
  ]);
  if (staffAssignmentError || staffMembershipError || (!(staffAssignments?.length) && !(staffMemberships?.length))) return null;

  const offering = one(allocation.subject_offerings);
  const subject = offering ? one(offering.subjects) : null;
  const period = one(slot.timetable_periods);

  const [{ data: enrolments }, { data: reasons }, { data: submissions }] = await Promise.all([
    supabase.from("enrolments").select("id,learner_id,admission_number,learners(first_names,surname)").eq("register_class_id", slot.register_class_id).eq("academic_year", slot.academic_year).lte("enrolled_from", attendanceDate).or(`enrolled_to.is.null,enrolled_to.gte.${attendanceDate}`).order("admission_number"),
    supabase.from("attendance_reasons").select("id,display_name,is_sensitive").eq("audience", "learner").eq("active", true).order("display_order"),
    supabase.from("subject_attendance_submissions").select("id,recorded_at").eq("timetable_slot_id", slot.id).eq("attendance_date", attendanceDate).order("recorded_at", { ascending: false }).limit(1),
  ]);
  const currentSubmissionId = submissions?.[0]?.id ?? null;
  let eventMap = new Map<string, { status: "absent" | "late" | "excused" | "unknown"; reason_id: string | null; note: string | null }>();
  if (currentSubmissionId) {
    const { data: events } = await supabase.from("attendance_events").select("enrolment_id,status,reason_id,note").eq("subject_submission_id", currentSubmissionId);
    eventMap = new Map((events ?? []).map((event) => [event.enrolment_id, { status: event.status as "absent" | "late" | "excused" | "unknown", reason_id: event.reason_id, note: event.note }]));
  }

  return {
    slot: { id: slot.id, weekday: slot.weekday, classId: slot.register_class_id, className: classRow?.display_name ?? "Class", subjectName: subject?.display_name ?? "Subject", teacherName: staff ? `${staff.first_name ?? ""} ${staff.last_name ?? ""}`.trim() : "Teacher", periodName: period?.display_name ?? "Period", roomLabel: slot.room_label, academicYear: slot.academic_year },
    learners: (enrolments ?? []).map((item) => {
      const learner = one(item.learners); const event = eventMap.get(item.id);
      return { enrolmentId: item.id, learnerId: item.learner_id, name: learner ? `${learner.first_names} ${learner.surname}` : "Learner", admissionNumber: item.admission_number, status: event?.status ?? "present", reasonId: event?.reason_id ?? null, note: event?.note ?? null };
    }),
    reasons: (reasons ?? []).map((reason) => ({ id: reason.id, name: reason.display_name, sensitive: reason.is_sensitive })),
    currentSubmissionId,
  };
}
