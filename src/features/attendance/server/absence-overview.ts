import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AbsenceOverviewClass = { id: string; name: string; grade: string };

export type AbsenceOverviewRow = {
  /** Stable composite key for React reconciliation. */
  key: string;
  source: "daily" | "lesson" | "guardian";
  learnerId: string;
  learnerName: string;
  admissionNumber: string | null;
  /** Register class for school signals; null for guardian notices. */
  classId: string | null;
  className: string | null;
  gradeName: string | null;
  /** Lesson subject where the row is a subject-period signal. */
  subjectName: string | null;
  status: string;
  /** Friendly exception/notice reason. */
  reason: string | null;
  note: string | null;
  reviewStatus: string | null;
};

function one<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

const exceptionStatuses = ["absent", "excused"];

const lessonStatusLabels: Record<string, string> = { absent: "Absent", excused: "Excused", late: "Late" };

/**
 * Unified, read-only absence overview for one school date. This surface never
 * writes: attendance_events/daily_register_current stay the canonical official
 * evidence, subject-period data stays lesson-scoped, and guardian notices are
 * shown as submitted by parents. A learner can legitimately appear for several
 * different sources on the same day (daily register + separate lessons), so no
 * de-duplication across sources is applied.
 */
export async function getAbsenceOverviewWorkspace(
  schoolId: string,
  academicYear: number,
  attendanceDate: string,
  selectedClassId: string | null,
): Promise<{ classes: AbsenceOverviewClass[]; selectedClassId: string | null; rows: AbsenceOverviewRow[] }> {
  const supabase = await createSupabaseServerClient();

  const { data: classes, error: classError } = await supabase
    .from("register_classes")
    .select("id,display_name,grades(display_name)")
    .eq("school_id", schoolId)
    .eq("academic_year", academicYear)
    .order("display_name");
  if (classError) throw new Error("Unable to load the absence overview.");

  const classOptions: AbsenceOverviewClass[] = (classes ?? []).map((item) => ({ id: item.id, name: item.display_name, grade: one(item.grades)?.display_name ?? "Grade" }));
  const classId = selectedClassId && classOptions.some((item) => item.id === selectedClassId) ? selectedClassId : null;

  const [{ data: reasons }, { data: dailyRows }, { data: lessonRows }, { data: noticeRows }] = await Promise.all([
    supabase.from("attendance_reasons").select("id,reason_code,display_name").eq("audience", "learner").eq("active", true).order("sort_order"),
    supabase.from("daily_register_current")
      .select("submission_id,enrolment_id,learner_id,register_class_id,status,reason_id,note,first_names,surname")
      .eq("school_id", schoolId)
      .eq("attendance_date", attendanceDate)
      .in("status", exceptionStatuses),
    supabase.from("subject_attendance_current")
      .select("learner_id,enrolment_id,register_class_id,timetable_slot_id,status,reason_id,note,first_names,surname")
      .eq("school_id", schoolId)
      .eq("attendance_date", attendanceDate)
      .in("status", exceptionStatuses),
    supabase.from("guardian_absence_notices")
      .select("id,learner_id,absence_from,absence_to,reason_category,message,status,review_note,learners!inner(first_names,surname)")
      .eq("school_id", schoolId)
      .lte("absence_from", attendanceDate)
      .gte("absence_to", attendanceDate),
  ]);

  const reasonNames = new Map<string, string>();
  for (const reason of reasons ?? []) reasonNames.set(reason.id, reason.display_name);

  const classByEnrolment = new Map<string, AbsenceOverviewClass>();
  for (const item of classes ?? []) classByEnrolment.set(item.id, { id: item.id, name: item.display_name, grade: one(item.grades)?.display_name ?? "Grade" });

  const rows: AbsenceOverviewRow[] = [];

  // Official daily-register absence/exception signals.
  for (const row of dailyRows ?? []) {
    if (classId && row.register_class_id !== classId) continue;
    const schoolClass = classByEnrolment.get(row.register_class_id) ?? null;
    rows.push({
      key: `daily:${row.enrolment_id}:${row.register_class_id}`,
      source: "daily",
      learnerId: row.learner_id,
      learnerName: `${row.first_names ?? ""} ${row.surname ?? ""}`.trim() || "Learner",
      admissionNumber: null,
      classId: row.register_class_id,
      className: schoolClass?.name ?? null,
      gradeName: schoolClass?.grade ?? null,
      subjectName: null,
      status: row.status === "excused" ? "Excused" : "Absent",
      reason: row.reason_id ? (reasonNames.get(row.reason_id) ?? null) : null,
      note: row.note,
      reviewStatus: null,
    });
  }

  // Lesson/subject-period absence signals with their subject tag.
  const slotIds = [...new Set((lessonRows ?? []).map((row) => row.timetable_slot_id).filter(Boolean))];
  const subjectBySlot = new Map<string, string>();
  const lessonClassBySlot = new Map<string, string>();
  if (slotIds.length) {
    const { data: slots } = await supabase
      .from("timetable_slots")
      .select("id,register_class_id,teacher_allocations(subject_offerings(subjects(display_name)))")
      .in("id", slotIds);
    for (const slot of slots ?? []) {
      const allocation = one(slot.teacher_allocations);
      const offering = allocation ? one(allocation.subject_offerings) : null;
      const subject = offering ? one(offering.subjects) : null;
      subjectBySlot.set(slot.id, subject?.display_name ?? "Subject");
      lessonClassBySlot.set(slot.id, slot.register_class_id);
    }
  }

  for (const row of lessonRows ?? []) {
    const rowClassId = lessonClassBySlot.get(row.timetable_slot_id) ?? row.register_class_id ?? null;
    if (classId && rowClassId !== classId) continue;
    const schoolClass = rowClassId ? classByEnrolment.get(rowClassId) ?? null : null;
    rows.push({
      key: `lesson:${row.enrolment_id}:${row.timetable_slot_id}`,
      source: "lesson",
      learnerId: row.learner_id,
      learnerName: `${row.first_names ?? ""} ${row.surname ?? ""}`.trim() || "Learner",
      admissionNumber: null,
      classId: rowClassId,
      className: schoolClass?.name ?? null,
      gradeName: schoolClass?.grade ?? null,
      subjectName: subjectBySlot.get(row.timetable_slot_id) ?? "Subject",
      status: lessonStatusLabels[row.status] ?? row.status,
      reason: row.reason_id ? (reasonNames.get(row.reason_id) ?? null) : null,
      note: row.note,
      reviewStatus: null,
    });
  }

  // Guardian absence notices covering this date. These are parent statements,
  // not school marks, so they carry no class attribution.
  for (const row of noticeRows ?? []) {
    const learner = one(row.learners);
    rows.push({
      key: `guardian:${row.id}`,
      source: "guardian",
      learnerId: row.learner_id,
      learnerName: learner ? `${learner.first_names} ${learner.surname}`.trim() : "Learner",
      admissionNumber: null,
      classId: null,
      className: null,
      gradeName: null,
      subjectName: null,
      status: "Reported by guardian",
      reason: guardianReasonLabel(row.reason_category),
      note: row.message ?? row.review_note ?? null,
      reviewStatus: row.status,
    });
  }

  const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
  rows.sort((left, right) => {
    const byName = collator.compare(left.learnerName, right.learnerName);
    if (byName) return byName;
    return collator.compare(left.source, right.source);
  });

  return { classes: classOptions, selectedClassId: classId, rows };
}

const guardianReasonLabels: Record<string, string> = {
  illness: "Illness",
  medical_appointment: "Medical appointment",
  compassionate: "Compassionate",
  family: "Family",
  transport: "Transport",
  weather: "Weather",
  school_activity: "School activity",
  other: "Other",
};

function guardianReasonLabel(value: string | null) {
  return value ? (guardianReasonLabels[value] ?? value) : null;
}
