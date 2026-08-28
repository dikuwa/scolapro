import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AttendanceClassOption, AttendanceReasonOption } from "@/features/attendance/server/register";

export type WeeklyCell = {
  date: string;
  status: "present" | "absent" | "late" | "excused" | "unknown";
  reasonId: string | null;
  note: string | null;
};

export type WeeklyLearnerRow = {
  enrolmentId: string;
  learnerId: string;
  name: string;
  admissionNumber: string | null;
  sex: string | null;
  days: WeeklyCell[];
};

function relation<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export function mondayFor(date: string) {
  const value = new Date(`${date}T12:00:00`);
  const day = value.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + offset);
  return value.toISOString().slice(0, 10);
}

export function schoolWeekDates(date: string) {
  const monday = new Date(`${mondayFor(date)}T12:00:00`);
  return Array.from({ length: 5 }, (_, index) => {
    const current = new Date(monday);
    current.setDate(current.getDate() + index);
    return current.toISOString().slice(0, 10);
  });
}

export async function getWeeklyRegisterWorkspace(schoolId: string, academicYear: number, selectedClassId: string | null, date: string) {
  const supabase = await createSupabaseServerClient();
  const dates = schoolWeekDates(date);
  const monday = dates[0];
  const friday = dates[4];

  const [{ data: classes, error: classError }, { data: reasons, error: reasonError }] = await Promise.all([
    supabase.from("register_classes").select("id,display_name,grades(display_name)").eq("school_id", schoolId).eq("academic_year", academicYear).order("display_name"),
    supabase.from("attendance_reasons").select("id,reason_code,display_name,sensitive").eq("audience", "learner").eq("active", true).order("sort_order"),
  ]);
  if (classError || reasonError) throw new Error("Unable to load the weekly attendance workspace.");

  const classOptions: AttendanceClassOption[] = (classes ?? []).map((item) => ({ id: item.id, name: item.display_name, grade: relation(item.grades)?.display_name ?? "Grade" }));
  const reasonsList: AttendanceReasonOption[] = (reasons ?? []).map((item) => ({ id: item.id, code: item.reason_code, name: item.display_name, sensitive: item.sensitive }));
  const classId = selectedClassId && classOptions.some((item) => item.id === selectedClassId) ? selectedClassId : classOptions[0]?.id ?? null;

  if (!classId) return { classes: classOptions, reasons: reasonsList, selectedClassId: null, dates, learners: [] as WeeklyLearnerRow[], submissionIds: {} as Record<string, string> };

  const [{ data: enrolments, error: enrolmentError }, { data: currentRows, error: currentError }, { data: submissions, error: submissionError }] = await Promise.all([
    supabase.from("enrolments").select("id,admission_number,learner_id,enrolled_from,enrolled_to,learners!inner(id,first_names,surname,sex)").eq("school_id", schoolId).eq("register_class_id", classId).eq("academic_year", academicYear).lte("enrolled_from", friday).or(`enrolled_to.is.null,enrolled_to.gte.${monday}`).order("admission_number"),
    supabase.from("daily_register_current").select("submission_id,enrolment_id,attendance_date,status,reason_id,note").eq("school_id", schoolId).eq("register_class_id", classId).in("attendance_date", dates),
    supabase.from("attendance_register_submissions").select("id,attendance_date,recorded_at").eq("school_id", schoolId).eq("register_class_id", classId).in("attendance_date", dates).order("recorded_at", { ascending: false }),
  ]);
  if (enrolmentError || currentError || submissionError) throw new Error("Unable to load this weekly register.");

  const currentMap = new Map((currentRows ?? []).map((row) => [`${row.enrolment_id}:${row.attendance_date}`, row]));
  const submissionIds: Record<string, string> = {};
  for (const submission of submissions ?? []) if (!submissionIds[submission.attendance_date]) submissionIds[submission.attendance_date] = submission.id;

  const learners: WeeklyLearnerRow[] = (enrolments ?? []).map((item) => {
    const learner = relation(item.learners);
    return {
      enrolmentId: item.id,
      learnerId: item.learner_id,
      name: learner ? `${learner.first_names} ${learner.surname}`.trim() : "Learner",
      admissionNumber: item.admission_number,
      sex: learner?.sex ?? null,
      days: dates.map((attendanceDate) => {
        const current = currentMap.get(`${item.id}:${attendanceDate}`);
        return {
          date: attendanceDate,
          status: (current?.status as WeeklyCell["status"] | undefined) ?? "present",
          reasonId: current?.reason_id ?? null,
          note: current?.note ?? null,
        };
      }),
    };
  });

  return { classes: classOptions, reasons: reasonsList, selectedClassId: classId, dates, learners, submissionIds };
}
