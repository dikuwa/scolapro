import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mondayFor } from "@/features/attendance/server/week";
import {
  calculateLearnerRegisterBalance,
  resolveGovernedSchoolDays,
  type GovernedTeachingImpactRow,
  type RegisterAttendanceMark,
} from "@/features/attendance/server/governed-school-day";
import { assertRegisterTeacherDocumentTotals } from "@/features/attendance/server/register-teacher-layout";

export type RegisterTeacherMode = "week" | "range" | "term";
export type RegisterTeacherSex = "male" | "female";
export type RegisterTeacherMark = RegisterAttendanceMark;

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
  governanceAlerts: {
    invalidSubmissionCount: number;
    invalidSubmissionDates: string[];
  };
  weeks: RegisterTeacherWeek[];
  sections: RegisterTeacherSection[];
};

/**
 * Raw evidence row shapes. The document builder consumes these directly so the
 * same aggregation path can be exercised against fixtures without a database.
 */
export type RegisterTeacherEnrolmentRow = {
  id: string;
  learner_id: string;
  admission_number: string | null;
  enrolled_from: string;
  enrolled_to: string | null;
  learners: { first_names: string | null; surname: string | null; date_of_birth: string | null; sex: string | null } | { first_names: string | null; surname: string | null; date_of_birth: string | null; sex: string | null }[] | null;
};

export type RegisterTeacherCurrentRow = {
  enrolment_id: string;
  attendance_date: string;
  status: string;
  reason_id: string | null;
  note: string | null;
};

export type RegisterTeacherOverrideRow = { school_date: string; reason: string | null };

export type RegisterTeacherCalendarEventRow = {
  event_scope: string;
  title: string;
  starts_on: string;
  ends_on: string;
  created_at: string;
};

export type RegisterTeacherSubmissionRow = { attendance_date: string };

export type RegisterTeacherScope = {
  scopeStart: string;
  scopeEnd: string;
  queryEnd: string;
  termActualEnd: string;
};

export type RegisterTeacherBuildInput = {
  mode: RegisterTeacherMode;
  academicYear: number;
  classId: string;
  className: string;
  gradeName: string;
  registerTeacherName: string;
  termId: string | null;
  termName: string;
  selectedDate: string;
  termStart: string;
  termEnd: string;
  scope: RegisterTeacherScope;
  impactRows: readonly GovernedTeachingImpactRow[];
  enrolments: readonly RegisterTeacherEnrolmentRow[];
  currentRows: readonly RegisterTeacherCurrentRow[];
  overrideRows: readonly RegisterTeacherOverrideRow[];
  calendarEventRows: readonly RegisterTeacherCalendarEventRow[];
  submissionRows: readonly RegisterTeacherSubmissionRow[];
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

/**
 * Resolves and validates the printable register scope from a selection. This is
 * pure so scope/date-integrity rules can be tested without a database.
 */
export function resolveRegisterTeacherScope(input: {
  mode: RegisterTeacherMode;
  selectedDate: string;
  fromWeek?: string | null;
  toWeek?: string | null;
  termStart: string;
  termEnd: string;
}): RegisterTeacherScope {
  const { mode, termStart, termEnd } = input;
  const selectedWeekStart = input.fromWeek ?? mondayFor(input.selectedDate);
  const selectedWeekEnd = mode === "range" ? (input.toWeek ?? selectedWeekStart) : selectedWeekStart;
  const validWeekId = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && mondayFor(value) === value;
  const firstTermWeek = mondayFor(termStart);
  const lastTermWeek = mondayFor(termEnd);
  if (mode !== "term" && (!validWeekId(selectedWeekStart) || !validWeekId(selectedWeekEnd))) {
    throw new Error("Register week selection is invalid.");
  }
  if (mode === "range" && selectedWeekStart > selectedWeekEnd) {
    throw new Error("The From Week must not be after the To Week.");
  }
  if (mode !== "term" && (selectedWeekStart < firstTermWeek || selectedWeekEnd > lastTermWeek)) {
    throw new Error("The selected register week falls outside the learner term.");
  }

  const termActualEnd = input.selectedDate < termEnd ? input.selectedDate : termEnd;
  const scopeStart = mode === "term" ? termStart : (selectedWeekStart < termStart ? termStart : selectedWeekStart);
  const selectedRangeEnd = fridayFor(selectedWeekEnd);
  const scopeEnd = mode === "term" ? termActualEnd : (selectedRangeEnd > termEnd ? termEnd : selectedRangeEnd);
  const queryEnd = scopeEnd > termActualEnd ? scopeEnd : termActualEnd;
  return { scopeStart, scopeEnd, queryEnd, termActualEnd };
}

/**
 * Builds the authoritative register-teacher document from raw attendance
 * evidence. This is the single aggregation path for every renderer (HTML, PDF,
 * print). It is pure and deterministic: given the same raw rows it produces the
 * same marks, reasoned absences, denominators and totals, and it asserts those
 * totals before returning.
 */
export function buildRegisterTeacherDocument(input: RegisterTeacherBuildInput): RegisterTeacherDocument {
  const { scopeStart, scopeEnd, termActualEnd } = input.scope;

  const governedDays = resolveGovernedSchoolDays({
    start: input.termStart,
    end: input.termEnd,
    rows: input.impactRows,
  });
  // Preserve the normal Monday-Friday grid, exclude ordinary weekends, and
  // include an explicitly opened replacement weekend day. Scope boundaries
  // are clipped to the learner term before this list is built, so out-of-term
  // labels/columns can never leak into the printed register.
  const dates = governedDays.displayedDates(scopeStart, scopeEnd);
  const reasonByDate = new Map<string, string>();
  const calendarClosures = [...input.calendarEventRows].sort((a, b) => {
    const scopeOrder = (a.event_scope === "school" ? 1 : 0) - (b.event_scope === "school" ? 1 : 0);
    return scopeOrder || String(a.created_at).localeCompare(String(b.created_at));
  });
  for (const event of calendarClosures) {
    const startsOn = String(event.starts_on).slice(0, 10) < input.termStart ? input.termStart : String(event.starts_on).slice(0, 10);
    const endsOn = String(event.ends_on).slice(0, 10) > input.termEnd ? input.termEnd : String(event.ends_on).slice(0, 10);
    for (const date of rangeDates(startsOn, endsOn)) reasonByDate.set(date, String(event.title));
  }
  for (const row of input.overrideRows) {
    const date = String(row.school_date).slice(0, 10);
    reasonByDate.set(date, row.reason?.trim() || "School calendar adjustment");
  }

  const termActualDates = governedDays.eligibleDates(input.termStart, termActualEnd);
  const termTeachingDayCount = governedDays.eligibleDates(input.termStart, input.termEnd).length;

  const dayModels: RegisterTeacherDay[] = dates.map((date) => {
    const decision = governedDays.decisionFor(date);
    return {
      date,
      weekday: compactWeekday(date),
      dayNumber: compactDay(date),
      teaching: decision.eligible,
      reason: reasonByDate.get(date) ?? null,
      weekId: mondayFor(date),
      weekEnding: fridayFor(date),
    };
  });

  const weekMap = new Map<string, RegisterTeacherWeek>();
  for (const day of dayModels) {
    const existing = weekMap.get(day.weekId) ?? { weekId: day.weekId, weekEnding: day.weekEnding, dates: [] };
    existing.dates.push(day);
    weekMap.set(day.weekId, existing);
  }
  const weeks = [...weekMap.values()];

  const currentByKey = new Map<string, { status: string; reasonId: string | null; note: string | null }>();
  for (const row of input.currentRows) {
    const attendanceDate = String(row.attendance_date).slice(0, 10);
    if (!governedDays.decisionFor(attendanceDate).eligible) {
      continue;
    }
    currentByKey.set(`${row.enrolment_id}:${attendanceDate}`, {
      status: String(row.status),
      reasonId: row.reason_id ? String(row.reason_id) : null,
      note: row.note ? String(row.note) : null,
    });
  }
  const invalidSubmissionDates = new Set<string>();
  let invalidSubmissionCount = 0;
  for (const row of input.submissionRows) {
    const attendanceDate = String(row.attendance_date).slice(0, 10);
    if (governedDays.decisionFor(attendanceDate).eligible) continue;
    invalidSubmissionCount += 1;
    invalidSubmissionDates.add(attendanceDate);
  }

  const sections: RegisterTeacherSection[] = (["male", "female"] as RegisterTeacherSex[]).map((sex) => {
    const learners: RegisterTeacherLearner[] = [];
    for (const item of input.enrolments) {
      const learner = relation(item.learners);
      if (!learner || validSex(learner.sex) !== sex) continue;
      const balance = calculateLearnerRegisterBalance({
        scopeDays: dayModels.map((day) => ({ date: day.date, eligible: day.teaching })),
        termEligibleDates: termActualDates,
        enrolledFrom: String(item.enrolled_from).slice(0, 10),
        enrolledTo: item.enrolled_to ? String(item.enrolled_to).slice(0, 10) : null,
        evidenceForDate: (date) => currentByKey.get(`${item.id}:${date}`),
      });

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
        marks: balance.marks,
        reasonedAbsenceDates: balance.reasonedAbsenceDates,
        attended: balance.attended,
        absent: balance.absent,
        possible: balance.possible,
        termAttended: balance.termAttended,
        termAbsent: balance.termAbsent,
        termDays: balance.termDays,
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
      termPossibleTotal: learners.reduce((sum, learner) => sum + learner.termDays, 0),
    };
  });

  const document: RegisterTeacherDocument = {
    mode: input.mode,
    academicYear: input.academicYear,
    classId: input.classId,
    className: input.className,
    gradeName: input.gradeName,
    registerTeacherName: input.registerTeacherName,
    termId: input.termId,
    termName: input.termName,
    scopeStart,
    scopeEnd,
    selectedDate: input.selectedDate,
    teachingDayCount: termTeachingDayCount,
    governanceAlerts: {
      invalidSubmissionCount,
      invalidSubmissionDates: [...invalidSubmissionDates].sort(),
    },
    weeks,
    sections,
  };
  assertRegisterTeacherDocumentTotals(document);
  return document;
}

export async function getRegisterTeacherDocument(input: {
  schoolId: string;
  academicYear: number;
  classId: string;
  mode: RegisterTeacherMode;
  selectedDate: string;
  requestedTermId?: string | null;
  fromWeek?: string | null;
  toWeek?: string | null;
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

  // The official register uses learner opening/closing, never the broader
  // teacher planning dates. Missing or contradictory bounds stop generation.
  const { data: learnerCalendar, error: learnerCalendarError } = await supabase.rpc(
    "list_academic_term_calendar_summary",
    { p_school_id: input.schoolId, p_academic_year: input.academicYear },
  );
  const learnerTerm = !learnerCalendarError && term
    ? ((learnerCalendar ?? []) as Array<{ academic_term_id: string; learner_starts_on: string | null; learner_ends_on: string | null }>)
        .find((item) => item.academic_term_id === term.id)
    : null;
  const termStart = learnerTerm?.learner_starts_on ?? null;
  const termEnd = learnerTerm?.learner_ends_on ?? null;
  if (!term || !termStart || !termEnd || termStart > termEnd) {
    throw new Error("Learner calendar is not ready: configure valid learner opening and closing dates for the selected term.");
  }

  const scope = resolveRegisterTeacherScope({
    mode: input.mode,
    selectedDate: input.selectedDate,
    fromWeek: input.fromWeek,
    toWeek: input.toWeek,
    termStart,
    termEnd,
  });

  const queryEnd = scope.queryEnd;
  const [
    { data: impactRows, error: impactError },
    { data: enrolments, error: enrolmentError },
    { data: currentRows, error: currentError },
    { data: overrideRows, error: overrideError },
    { data: calendarEventRows, error: calendarEventError },
    { data: submissionRows, error: submissionError },
  ] = await Promise.all([
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
    supabase
      .from("effective_learner_calendar_events")
      .select("event_scope,school_id,title,starts_on,ends_on,teaching_impact,audience_scope,created_at")
      .eq("academic_year", input.academicYear)
      .eq("audience_scope", "all_learners")
      .eq("teaching_impact", "NO_TEACHING")
      .lte("starts_on", termEnd)
      .gte("ends_on", termStart)
      .or(`event_scope.eq.national,school_id.eq.${input.schoolId}`),
    supabase
      .from("attendance_register_submissions")
      .select("id,attendance_date,recorded_at,created_at")
      .eq("school_id", input.schoolId)
      .eq("register_class_id", input.classId)
      .gte("attendance_date", termStart)
      .lte("attendance_date", queryEnd)
      .order("recorded_at", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (impactError || enrolmentError || currentError || overrideError || calendarEventError || submissionError) {
    throw new Error("Unable to load register-teacher attendance evidence.");
  }

  return buildRegisterTeacherDocument({
    mode: input.mode,
    academicYear: input.academicYear,
    classId: String(classRow.id),
    className: String(classRow.display_name),
    gradeName: relation(classRow.grades)?.display_name ?? "Grade",
    registerTeacherName,
    termId: term.id,
    termName: term.displayName,
    selectedDate: input.selectedDate,
    termStart,
    termEnd,
    scope,
    impactRows: (impactRows ?? []) as GovernedTeachingImpactRow[],
    enrolments: (enrolments ?? []) as RegisterTeacherEnrolmentRow[],
    currentRows: (currentRows ?? []) as RegisterTeacherCurrentRow[],
    overrideRows: (overrideRows ?? []) as RegisterTeacherOverrideRow[],
    calendarEventRows: (calendarEventRows ?? []) as RegisterTeacherCalendarEventRow[],
    submissionRows: (submissionRows ?? []) as RegisterTeacherSubmissionRow[],
  });
}

export async function getRegisterTeacherTermOptions(
  schoolId: string,
  academicYear: number,
): Promise<RegisterTeacherTermOption[]> {
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: calendarRows, error: calendarError }] = await Promise.all([
    supabase
      .from("academic_terms")
      .select("id,term_number,display_name,starts_on,ends_on,academic_years!inner(school_id,year)")
      .eq("academic_years.school_id", schoolId)
      .eq("academic_years.year", academicYear)
      .order("term_number"),
    supabase.rpc("list_academic_term_calendar_summary", { p_school_id: schoolId, p_academic_year: academicYear }),
  ]);
  if (error || calendarError) throw new Error("Unable to load register-teacher term options.");
  const calendarByTerm = new Map(
    ((calendarRows ?? []) as Array<{ academic_term_id: string; learner_starts_on: string | null; learner_ends_on: string | null }>)
      .map((row) => [String(row.academic_term_id), row] as const),
  );
  return (data ?? []).map((row) => ({
    id: String(row.id),
    displayName: String(row.display_name),
    termNumber: Number(row.term_number),
    startsOn: calendarByTerm.get(String(row.id))?.learner_starts_on
      ? String(calendarByTerm.get(String(row.id))!.learner_starts_on).slice(0, 10)
      : null,
    endsOn: calendarByTerm.get(String(row.id))?.learner_ends_on
      ? String(calendarByTerm.get(String(row.id))!.learner_ends_on).slice(0, 10)
      : null,
  }));
}
