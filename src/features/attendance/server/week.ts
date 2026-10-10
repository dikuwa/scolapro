import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveAttendanceTeachingImpact, type AttendanceClassOption, type AttendanceReasonOption, type AttendanceSortDirection } from "@/features/attendance/server/register";
import { formatLearnerName, formatPersonName } from "@/lib/person-name";
import { getUserContext } from "@/lib/auth/get-user-context";
import { canCaptureRegisterClass } from "@/features/attendance/server/capture-scope";
import { officialCaptureStatusOf, type OfficialAttendanceStatus } from "@/features/attendance/server/official-semantics";

export type WeeklyCell = {
  date: string;
  /** Official weekly-register vocabulary: Present/Absent only. */
  status: OfficialAttendanceStatus;
  reasonId: string | null;
  note: string | null;
};

export type WeeklyLearnerRow = {
  enrolmentId: string;
  learnerId: string;
  /** Display name: Surname GivenNames (e.g. "Mbuti Angel"). */
  name: string;
  /**
   * Alternate search token: GivenNames Surname order.
   * Allows client-side filters to match either name order.
   */
  nameAlternate: string;
  admissionNumber: string | null;
  sex: string | null;
  days: WeeklyCell[];
};

function relation<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function sortLearners<T extends { surname: string; first_names: string; admissionNumber: string | null }>(learners: T[], direction: AttendanceSortDirection) {
  const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
  return learners.sort((left, right) => {
    const surnameOrder = collator.compare(left.surname, right.surname);
    const givenOrder = collator.compare(left.first_names, right.first_names);
    const fallback = collator.compare(left.admissionNumber ?? "", right.admissionNumber ?? "");
    const order = surnameOrder || givenOrder || fallback;
    return direction === "desc" ? -order : order;
  });
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

export async function getWeeklyRegisterWorkspace(
  schoolId: string,
  academicYear: number,
  selectedClassId: string | null,
  date: string,
  sortDirection: AttendanceSortDirection = "asc",
) {
  const supabase = await createSupabaseServerClient();
  const context = await getUserContext();
  const actor = {
    memberships: context.memberships,
    platformRoles: context.platformMemberships.map((item) => item.roleKey),
  };
  const weekDates = schoolWeekDates(date);
  const monday = weekDates[0];
  const friday = weekDates[4];

  const [{ data: classes, error: classError }, { data: reasons, error: reasonError }, resolvedDays] = await Promise.all([
    supabase.from("register_classes").select("id,display_name,register_teacher_staff_id,grades(display_name)").eq("school_id", schoolId).eq("academic_year", academicYear).order("display_name"),
    supabase.from("attendance_reasons").select("id,reason_code,display_name,sensitive").eq("audience", "learner").eq("active", true).order("sort_order"),
    Promise.all(weekDates.map(async (attendanceDate) => ({ attendanceDate, ...(await resolveAttendanceTeachingImpact(schoolId, attendanceDate)) }))),
  ]);
  if (classError || reasonError) throw new Error("Unable to load the weekly attendance workspace.");

  const classOptions: AttendanceClassOption[] = (classes ?? [])
    .filter((item) => canCaptureRegisterClass(actor, { schoolId, registerTeacherStaffId: item.register_teacher_staff_id }))
    .map((item) => ({ id: item.id, name: item.display_name, grade: relation(item.grades)?.display_name ?? "Grade" }));
  const reasonsList: AttendanceReasonOption[] = (reasons ?? []).map((item) => ({ id: item.id, code: item.reason_code, name: item.display_name, sensitive: item.sensitive }));
  const classId = selectedClassId && classOptions.some((item) => item.id === selectedClassId) ? selectedClassId : classOptions[0]?.id ?? null;

  // Calendar impact is independent of class selection, so all five day
  // resolutions share the first request wave instead of creating another
  // serial phase before the register data can load.
  const nonTeachingDates: string[] = [];
  const nonTeachingReasons: Record<string, string> = {};
  const outOfTermDates: string[] = [];
  for (const day of resolvedDays) {
    if (day.kind === "out_of_term") {
      outOfTermDates.push(day.attendanceDate);
    } else if (!day.eligible) {
      nonTeachingDates.push(day.attendanceDate);
      if (day.reason) nonTeachingReasons[day.attendanceDate] = day.reason;
    }
  }
  // Out-of-term weekdays are navigation context, not register columns. In-term
  // holidays remain visible as locked labelled columns for official continuity.
  const dates = weekDates.filter((attendanceDate) => !outOfTermDates.includes(attendanceDate));

  const emptyWorkspace = {
    classes: classOptions,
    reasons: reasonsList,
    selectedClassId: classId,
    weekStart: monday,
    weekEnd: friday,
    dates,
    nonTeachingDates,
    nonTeachingReasons,
    outOfTermDates,
    learners: [] as WeeklyLearnerRow[],
    submissionIds: {} as Record<string, string>,
  };
  if (!classId || !dates.length) return emptyWorkspace;

  const [{ data: enrolments, error: enrolmentError }, { data: currentRows, error: currentError }, { data: submissions, error: submissionError }] = await Promise.all([
    supabase.from("enrolments").select("id,admission_number,learner_id,enrolled_from,enrolled_to,learners!inner(id,first_names,surname,sex)").eq("school_id", schoolId).eq("register_class_id", classId).eq("academic_year", academicYear).lte("enrolled_from", friday).or(`enrolled_to.is.null,enrolled_to.gte.${monday}`).order("admission_number"),
    supabase.from("daily_register_current").select("submission_id,enrolment_id,attendance_date,status,reason_id,note").eq("school_id", schoolId).eq("register_class_id", classId).in("attendance_date", dates),
    supabase.from("attendance_register_submissions").select("id,attendance_date,recorded_at").eq("school_id", schoolId).eq("register_class_id", classId).in("attendance_date", dates).order("recorded_at", { ascending: false }),
  ]);
  if (enrolmentError || currentError || submissionError) throw new Error("Unable to load this weekly register.");

  const currentMap = new Map((currentRows ?? []).map((row) => [`${row.enrolment_id}:${row.attendance_date}`, row]));
  const submissionIds: Record<string, string> = {};
  for (const submission of submissions ?? []) if (!submissionIds[submission.attendance_date]) submissionIds[submission.attendance_date] = submission.id;

  const learnersSortable = (enrolments ?? []).map((item) => {
    const learner = relation(item.learners);
    const givenNorm = formatPersonName(learner?.first_names);
    const surnameNorm = formatPersonName(learner?.surname);
    return {
      enrolmentId: item.id,
      learnerId: item.learner_id,
      name: [surnameNorm, givenNorm].filter(Boolean).join(" ") || "Learner",
      nameAlternate: [givenNorm, surnameNorm].filter(Boolean).join(" "),
      surname: learner?.surname ?? "",
      first_names: learner?.first_names ?? "",
      admissionNumber: item.admission_number,
      sex: learner?.sex ?? null,
      days: dates.map((attendanceDate) => {
        const current = currentMap.get(`${item.id}:${attendanceDate}`);
        return {
          date: attendanceDate,
          status: officialCaptureStatusOf(current?.status) ?? "present",
          reasonId: current?.reason_id ?? null,
          note: current?.note ?? null,
        };
      }),
    };
  });

  sortLearners(learnersSortable, sortDirection);

  // Strip sort-only fields before returning so the public type is preserved.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const learners: WeeklyLearnerRow[] = learnersSortable.map(({ surname: _s, first_names: _f, ...row }) => row);

  return { ...emptyWorkspace, learners, submissionIds };
}
