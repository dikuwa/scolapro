import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mondayFor, schoolWeekDates } from "@/features/attendance/server/week";

export type RegisterTeacherMode = "week" | "term";
export type RegisterTeacherSex = "male" | "female";
export type RegisterTeacherMark = "I" | "a" | "";

export type RegisterTeacherDay = {
  date: string;
  weekday: string;
  dayNumber: string;
  teaching: boolean;
  reason: string | null;
  weekId: string;
  weekEnding: string;
};

export type RegisterTeacherLearner = {
  enrolmentId: string;
  learnerId: string;
  admissionNumber: string | null;
  surname: string;
  givenNames: string;
  dateOfBirth: string | null;
  sex: RegisterTeacherSex;
  enrolledFrom: string;
  enrolledTo: string | null;
  marks: Record<string, RegisterTeacherMark>;
  reasonedAbsenceDates: Record<string, boolean>;
  attended: number;
  absent: number;
  possible: number;
  termAttended: number;
  termAbsent: number;
  termDays: number;
};

export type RegisterTeacherWeek = {
  weekId: string;
  weekEnding: string;
  dates: RegisterTeacherDay[];
};

export type RegisterTeacherSection = {
  sex: RegisterTeacherSex;
  label: "BOYS" | "GIRLS";
  learners: RegisterTeacherLearner[];
  attendanceByDate: Record<string, number>;
  absenceByDate: Record<string, number>;
  possibleByDate: Record<string, number>;
  attendanceTotal: number;
  absenceTotal: number;
  possibleTotal: number;
  termAttendanceTotal: number;
  termAbsenceTotal: number;
  termPossibleTotal: number;
};

export type RegisterTeacherTermOption = {
  id: string;
  displayName: string;
  termNumber: number;
  startsOn: string | null;
  endsOn: string | null;
};

export type RegisterTeacherDocument = {
  mode: RegisterTeacherMode;
  academicYear: number;
  classId: string;
  className: string;
  gradeName: string;
  registerTeacherName: string;
  termId: string | null;
  termName: string;
  scopeStart: string;
  scopeEnd: string;
  selectedDate: string;
  teachingDayCount: number;
  weeks: RegisterTeacherWeek[];
  sections: RegisterTeacherSection[];
};

function relation<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return isoDate(value);
}

function rangeDates(start: string, end: string) {
  const dates: string[] = [];
  for (let current = start; current <= end; current = addDays(current, 1)) dates.push(current);
  return dates;
}

function fridayFor(date: string) {
  return addDays(mondayFor(date), 4);
}

function compactWeekday(date: string) {
  return new Intl.DateTimeFormat("en-NA", { weekday: "narrow" }).format(new Date(`${date}T12:00:00`));
}

function compactDay(date: string) {
  return new Intl.DateTimeFormat("en-NA", { day: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function validSex(value: string | null | undefined): RegisterTeacherSex | null {
  const normalized = value?.toLowerCase();
  return normalized === "male" || normalized === "female" ? normalized : null;
}

function isActiveOn(enrolledFrom: string, enrolledTo: string | null, date: string) {
  return enrolledFrom <= date && (!enrolledTo || enrolledTo >= date);
}

export async function getRegisterTeacherDocument(input: {
  schoolId: string;
  academicYear: number;
  classId: string;
  mode: RegisterTeacherMode;
  selectedDate: string;
  requestedTermId?: string | null;
}): Promise<RegisterTeacherDocument> {
  const supabase = await createSupabaseServerClient();

  const [{ data: classRow, error: classError }, { data: terms, error: termError }] = await Promise.all([
    supabase
      .from("register_classes")
      .select("id,display_name,grade_id,register_teacher_staff_id,grades(display_name)")
      .eq("school_id", input.schoolId)
      .eq("academic_year", input.academicYear)
      .eq("id", input.classId)
      .single(),
    supabase
      .from("academic_terms")
      .select("id,term_number,display_name,starts_on,ends_on,academic_years!inner(school_id,year)")
      .eq("academic_years.school_id", input.schoolId)
      .eq("academic_years.year", input.academicYear)
      .order("term_number"),
  ]);
  if (classError || !classRow || termError) throw new Error("Unable to load the register-teacher document scope.");

  const normalizedTerms: RegisterTeacherTermOption[] = (terms ?? []).map((row) => ({
    id: String(row.id),
    displayName: String(row.display_name),
    termNumber: Number(row.term_number),
    startsOn: row.starts_on ? String(row.starts_on).slice(0, 10) : null,
    endsOn: row.ends_on ? String(row.ends_on).slice(0, 10) : null,
  }));
  const term =
    normalizedTerms.find((item) => item.id === input.requestedTermId) ??
    [...normalizedTerms].reverse().find((item) => (!item.startsOn || item.startsOn <= input.selectedDate) && (!item.endsOn || item.endsOn >= input.selectedDate)) ??
    [...normalizedTerms].reverse().find((item) => !item.startsOn || item.startsOn <= input.selectedDate) ??
    normalizedTerms[0] ??
    null;

  let registerTeacherName = "Not assigned";
  if (classRow.register_teacher_staff_id) {
    const { data: staff } = await supabase
      .from("staff_members")
      .select("first_name,last_name")
      .eq("id", classRow.register_teacher_staff_id)
      .maybeSingle();
    if (staff) registerTeacherName = `${staff.first_name ?? ""} ${staff.last_name ?? ""}`.trim() || "Not assigned";
  }

  const weekDates = schoolWeekDates(input.selectedDate);
  const termStart = term?.startsOn ?? `${input.academicYear}-01-01`;
  const termEnd = term?.endsOn ?? input.selectedDate;
  const termActualEnd = input.selectedDate < termEnd ? input.selectedDate : termEnd;
  const scopeStart = input.mode === "week" ? weekDates[0] : termStart;
  const scopeEnd = input.mode === "week" ? weekDates[4] : termActualEnd;
  const dates = rangeDates(scopeStart, scopeEnd).filter((date) => {
    const day = new Date(`${date}T12:00:00`).getDay();
    return day >= 1 && day <= 5;
  });

  const queryEnd = scopeEnd > termActualEnd ? scopeEnd : termActualEnd;
  const [{ data: impactRows, error: impactError }, { data: enrolments, error: enrolmentError }, { data: currentRows, error: currentError }, { data: overrideRows, error: overrideError }] = await Promise.all([
    supabase.rpc("resolve_school_teaching_impact_range", { p_school_id: input.schoolId, p_from: termStart, p_to: termEnd }),
    supabase
      .from("enrolments")
      .select("id,learner_id,admission_number,enrolled_from,enrolled_to,learners!inner(first_names,surname,date_of_birth,sex)")
      .eq("school_id", input.schoolId)
      .eq("register_class_id", input.classId)
      .eq("academic_year", input.academicYear)
      .lte("enrolled_from", queryEnd)
      .or(`enrolled_to.is.null,enrolled_to.gte.${termStart}`)
      .order("admission_number"),
    supabase
      .from("daily_register_current")
      .select("enrolment_id,attendance_date,status,reason_id,note")
      .eq("school_id", input.schoolId)
      .eq("register_class_id", input.classId)
      .gte("attendance_date", termStart)
      .lte("attendance_date", queryEnd),
    supabase
      .from("school_day_overrides")
      .select("school_date,reason")
      .eq("school_id", input.schoolId)
      .gte("school_date", termStart)
      .lte("school_date", termEnd),
  ]);
  if (impactError || enrolmentError || currentError || overrideError) throw new Error("Unable to load register-teacher attendance evidence.");

  const impactByDate = new Map<string, string>();
  for (const row of (impactRows ?? []) as { target_date: string; teaching_impact: string }[]) {
    impactByDate.set(String(row.target_date).slice(0, 10), String(row.teaching_impact));
  }
  const reasonByDate = new Map<string, string>();
  for (const row of (overrideRows ?? []) as { school_date: string; reason: string | null }[]) {
    if (row.reason) reasonByDate.set(String(row.school_date).slice(0, 10), row.reason);
  }

  const termDates = rangeDates(termStart, termEnd).filter((date) => {
    const day = new Date(`${date}T12:00:00`).getDay();
    return day >= 1 && day <= 5;
  });
  const termActualDates = rangeDates(termStart, termActualEnd).filter((date) => {
    const day = new Date(`${date}T12:00:00`).getDay();
    return day >= 1 && day <= 5 && impactByDate.get(date) !== "NO_TEACHING";
  });
  const termTeachingDayCount = termDates.filter((date) => impactByDate.get(date) !== "NO_TEACHING").length;

  const dayModels: RegisterTeacherDay[] = dates.map((date) => ({
    date,
    weekday: compactWeekday(date),
    dayNumber: compactDay(date),
    teaching: impactByDate.get(date) !== "NO_TEACHING",
    reason: reasonByDate.get(date) ?? null,
    weekId: mondayFor(date),
    weekEnding: fridayFor(date),
  }));

  const weekMap = new Map<string, RegisterTeacherWeek>();
  for (const day of dayModels) {
    const existing = weekMap.get(day.weekId) ?? { weekId: day.weekId, weekEnding: day.weekEnding, dates: [] };
    existing.dates.push(day);
    weekMap.set(day.weekId, existing);
  }
  const weeks = [...weekMap.values()];

  const currentByKey = new Map<string, { status: string; reasonId: string | null; note: string | null }>();
  for (const row of (currentRows ?? []) as { enrolment_id: string; attendance_date: string; status: string; reason_id: string | null; note: string | null }[]) {
    currentByKey.set(`${row.enrolment_id}:${String(row.attendance_date).slice(0, 10)}`, {
      status: String(row.status),
      reasonId: row.reason_id ? String(row.reason_id) : null,
      note: row.note ? String(row.note) : null,
    });
  }

  const sections: RegisterTeacherSection[] = (["male", "female"] as RegisterTeacherSex[]).map((sex) => {
    const learners: RegisterTeacherLearner[] = [];
    for (const item of enrolments ?? []) {
      const learner = relation(item.learners);
      if (!learner || validSex(learner.sex) !== sex) continue;
      const marks: Record<string, RegisterTeacherMark> = {};
      const reasonedAbsenceDates: Record<string, boolean> = {};
      let attended = 0;
      let absent = 0;
      let possible = 0;
      for (const day of dayModels) {
        const active = day.teaching && isActiveOn(String(item.enrolled_from).slice(0, 10), item.enrolled_to ? String(item.enrolled_to).slice(0, 10) : null, day.date);
        if (!active) {
          marks[day.date] = "";
          continue;
        }
        possible += 1;
        const current = currentByKey.get(`${item.id}:${day.date}`);
        if (current?.status === "absent") {
          marks[day.date] = "a";
          reasonedAbsenceDates[day.date] = Boolean(current.reasonId || current.note?.trim());
          absent += 1;
        } else {
          marks[day.date] = "I";
          attended += 1;
        }
      }
      let termAttended = 0;
      let termAbsent = 0;
      for (const date of termActualDates) {
        if (!isActiveOn(String(item.enrolled_from).slice(0, 10), item.enrolled_to ? String(item.enrolled_to).slice(0, 10) : null, date)) continue;
        const current = currentByKey.get(`${item.id}:${date}`);
        if (current?.status === "absent") termAbsent += 1;
        else termAttended += 1;
      }

      learners.push({
        enrolmentId: String(item.id),
        learnerId: String(item.learner_id),
        admissionNumber: item.admission_number ? String(item.admission_number) : null,
        surname: String(learner.surname ?? "").trim(),
        givenNames: String(learner.first_names ?? "").trim(),
        dateOfBirth: learner.date_of_birth ? String(learner.date_of_birth).slice(0, 10) : null,
        sex,
        enrolledFrom: String(item.enrolled_from).slice(0, 10),
        enrolledTo: item.enrolled_to ? String(item.enrolled_to).slice(0, 10) : null,
        marks,
        reasonedAbsenceDates,
        attended,
        absent,
        possible,
        termAttended,
        termAbsent,
        termDays: termTeachingDayCount,
      });
    }

    learners.sort((a, b) => a.surname.localeCompare(b.surname, "en", { sensitivity: "base" }) || a.givenNames.localeCompare(b.givenNames, "en", { sensitivity: "base" }));

    const attendanceByDate: Record<string, number> = {};
    const absenceByDate: Record<string, number> = {};
    const possibleByDate: Record<string, number> = {};
    for (const day of dayModels) {
      attendanceByDate[day.date] = learners.filter((learner) => learner.marks[day.date] === "I").length;
      absenceByDate[day.date] = learners.filter((learner) => learner.marks[day.date] === "a").length;
      possibleByDate[day.date] = learners.filter((learner) => learner.marks[day.date] !== "").length;
    }

    return {
      sex,
      label: sex === "male" ? "BOYS" : "GIRLS",
      learners,
      attendanceByDate,
      absenceByDate,
      possibleByDate,
      attendanceTotal: learners.reduce((sum, learner) => sum + learner.attended, 0),
      absenceTotal: learners.reduce((sum, learner) => sum + learner.absent, 0),
      possibleTotal: learners.reduce((sum, learner) => sum + learner.possible, 0),
      termAttendanceTotal: learners.reduce((sum, learner) => sum + learner.termAttended, 0),
      termAbsenceTotal: learners.reduce((sum, learner) => sum + learner.termAbsent, 0),
      termPossibleTotal: learners.length * termTeachingDayCount,
    };
  });

  return {
    mode: input.mode,
    academicYear: input.academicYear,
    classId: String(classRow.id),
    className: String(classRow.display_name),
    gradeName: relation(classRow.grades)?.display_name ?? "Grade",
    registerTeacherName,
    termId: term?.id ?? null,
    termName: term?.displayName ?? "Term",
    scopeStart,
    scopeEnd,
    selectedDate: input.selectedDate,
    teachingDayCount: termTeachingDayCount,
    weeks,
    sections,
  };
}


export async function getRegisterTeacherTermOptions(
  schoolId: string,
  academicYear: number,
): Promise<RegisterTeacherTermOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("academic_terms")
    .select("id,term_number,display_name,starts_on,ends_on,academic_years!inner(school_id,year)")
    .eq("academic_years.school_id", schoolId)
    .eq("academic_years.year", academicYear)
    .order("term_number");
  if (error) throw new Error("Unable to load register-teacher term options.");
  return (data ?? []).map((row) => ({
    id: String(row.id),
    displayName: String(row.display_name),
    termNumber: Number(row.term_number),
    startsOn: row.starts_on ? String(row.starts_on).slice(0, 10) : null,
    endsOn: row.ends_on ? String(row.ends_on).slice(0, 10) : null,
  }));
}
