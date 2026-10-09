import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  resolveAttendanceDayDecision,
  type AttendanceDayDecision,
  type LearnerTermWindow,
} from "@/features/attendance/server/learner-calendar-bounds";

export type AttendanceClassOption = {
  id: string;
  name: string;
  grade: string;
};

export type AttendanceReasonOption = {
  id: string;
  code: string;
  name: string;
  sensitive: boolean;
};

export type AttendanceLearnerRow = {
  enrolmentId: string;
  learnerId: string;
  name: string;
  admissionNumber: string | null;
  sex: string | null;
  status: "present" | "absent" | "late" | "excused" | "unknown";
  reasonId: string | null;
  note: string | null;
};

export type AttendanceSortDirection = "asc" | "desc";

function relation<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function sortLearners<T extends { name: string; admissionNumber: string | null }>(learners: T[], direction: AttendanceSortDirection) {
  const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
  return learners.sort((left, right) => {
    const nameOrder = collator.compare(left.name, right.name);
    const fallback = collator.compare(left.admissionNumber ?? "", right.admissionNumber ?? "");
    return direction === "desc" ? -(nameOrder || fallback) : nameOrder || fallback;
  });
}

export type AttendanceTeachingDay = AttendanceDayDecision;

/**
 * Resolves the shared calendar teaching-impact state for one school date.
 * The database's is_expected_school_day predicate remains the final write
 * authority. This read projection fails closed when it cannot verify a day,
 * while preserving explicit exceptional openings outside normal term bounds.
 */
export async function resolveAttendanceTeachingImpact(schoolId: string, attendanceDate: string): Promise<AttendanceTeachingDay> {
  const supabase = await createSupabaseServerClient();
  const [impactResult, overrideResult, termResult] = await Promise.all([
    supabase.rpc("resolve_school_teaching_impact", { p_school_id: schoolId, p_target_date: attendanceDate }),
    supabase
      .from("school_day_overrides")
      .select("reason,is_school_day,teaching_impact")
      .eq("school_id", schoolId)
      .eq("school_date", attendanceDate)
      .maybeSingle(),
    supabase.rpc("list_academic_term_calendar_summary", {
      p_school_id: schoolId,
      p_academic_year: Number(attendanceDate.slice(0, 4)),
    }),
  ]);
  return resolveAttendanceDayDecision({
    date: attendanceDate,
    terms: termResult.error ? [] : (termResult.data ?? []) as LearnerTermWindow[],
    resolvedImpact: impactResult.error || typeof impactResult.data !== "string" ? null : impactResult.data,
    resolverAvailable: !impactResult.error,
    override: overrideResult.error || !overrideResult.data ? null : {
      isSchoolDay: overrideResult.data.is_school_day,
      teachingImpact: overrideResult.data.teaching_impact,
      reason: overrideResult.data.reason,
    },
  });
}

export async function getDailyRegisterWorkspace(
  schoolId: string,
  academicYear: number,
  selectedClassId: string | null,
  attendanceDate: string,
  sortDirection: AttendanceSortDirection = "asc",
) {
  const supabase = await createSupabaseServerClient();

  const [{ data: classes, error: classError }, { data: reasons, error: reasonError }, teachingDay] = await Promise.all([
    supabase.from("register_classes").select("id,display_name,grades(display_name)").eq("school_id", schoolId).eq("academic_year", academicYear).order("display_name"),
    supabase.from("attendance_reasons").select("id,reason_code,display_name,sensitive").eq("audience", "learner").eq("active", true).order("sort_order"),
    resolveAttendanceTeachingImpact(schoolId, attendanceDate),
  ]);
  if (classError || reasonError) throw new Error("Unable to load the attendance workspace.");

  const classOptions: AttendanceClassOption[] = (classes ?? []).map((item) => ({ id: item.id, name: item.display_name, grade: relation(item.grades)?.display_name ?? "Grade" }));
  const reasonsList: AttendanceReasonOption[] = (reasons ?? []).map((item) => ({ id: item.id, code: item.reason_code, name: item.display_name, sensitive: item.sensitive }));
  const classId = selectedClassId && classOptions.some((item) => item.id === selectedClassId) ? selectedClassId : classOptions[0]?.id ?? null;

  // Calendar impact is independent of class selection, so resolve it in the
  // first request wave instead of adding a serial round trip.


  if (!classId) return { classes: classOptions, reasons: reasonsList, selectedClassId: null, teachingDay, learners: [] as AttendanceLearnerRow[], currentSubmissionId: null };

  const [{ data: enrolments, error: enrolmentError }, { data: currentRows, error: currentError }, { data: submission, error: submissionError }] = await Promise.all([
    supabase.from("enrolments").select("id,admission_number,learner_id,learners!inner(id,first_names,surname,sex)").eq("school_id", schoolId).eq("register_class_id", classId).eq("academic_year", academicYear).lte("enrolled_from", attendanceDate).or(`enrolled_to.is.null,enrolled_to.gte.${attendanceDate}`).order("admission_number"),
    supabase.from("daily_register_current").select("submission_id,enrolment_id,status,reason_id,note").eq("school_id", schoolId).eq("register_class_id", classId).eq("attendance_date", attendanceDate),
    supabase.from("attendance_register_submissions").select("id").eq("school_id", schoolId).eq("register_class_id", classId).eq("attendance_date", attendanceDate).order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (enrolmentError || currentError || submissionError) throw new Error("Unable to load this class register.");

  const currentByEnrolment = new Map((currentRows ?? []).map((row) => [row.enrolment_id, row]));
  const learners: AttendanceLearnerRow[] = (enrolments ?? []).map((item) => {
    const learner = relation(item.learners);
    const current = currentByEnrolment.get(item.id);
    return {
      enrolmentId: item.id,
      learnerId: item.learner_id,
      name: learner ? `${learner.first_names} ${learner.surname}`.trim() : "Learner",
      admissionNumber: item.admission_number,
      sex: learner?.sex ?? null,
      status: (current?.status as AttendanceLearnerRow["status"] | undefined) ?? "present",
      reasonId: current?.reason_id ?? null,
      note: current?.note ?? null,
    };
  });

  sortLearners(learners, sortDirection);

  return { classes: classOptions, reasons: reasonsList, selectedClassId: classId, teachingDay, learners, currentSubmissionId: submission?.id ?? null };
}
