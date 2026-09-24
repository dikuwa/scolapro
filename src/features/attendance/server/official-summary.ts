import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OfficialSexSplit = { boys: number; girls: number; total: number };

export type OfficialSummaryClass = { id: string; name: string; grade: string; gradeId: string | null };

export type OfficialSummaryClassRow = {
  classId: string;
  className: string;
  gradeId: string | null;
  gradeName: string;
  absences: OfficialSexSplit;
  weekly: { weekId: string; weekLabel: string; absences: OfficialSexSplit }[];
};

export type OfficialSummaryGradeRow = {
  gradeId: string | null;
  gradeName: string;
  absences: OfficialSexSplit;
  weekly: { weekId: string; weekLabel: string; absences: OfficialSexSplit }[];
};

export type OfficialSummarySchoolTotals = {
  possibleAttendances: number;
  absentLearnerDays: number;
  percentAbsence: number | null;
  weekly: { weekId: string; weekLabel: string; possibleAttendances: number; absentLearnerDays: number; percentAbsence: number | null }[];
};

export type OfficialSummaryReadiness = {
  complete: boolean;
  expectedRegisters: number;
  submittedRegisters: number;
  incomplete: { classId: string; className: string; gradeName: string; date: string }[];
};

export type OfficialSummaryWeek = {
  weekId: string;
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  weekEndingReportedOn: string | null;
  dates: string[];
  lastDate: string | null;
};

export type OfficialSummaryTerm = {
  id: string;
  displayName: string;
  termNumber: number;
  startsOn: string | null;
  endsOn: string | null;
  status: string;
};

export type OfficialAttendanceSummary = {
  mode: "week" | "term";
  scopeStart: string;
  scopeEnd: string;
  lastTeachingDate: string | null;
  dates: string[];
  teachingDates: string[];
  nonTeachingDates: string[];
  nonTeachingReasons: Record<string, string>;
  weeks: OfficialSummaryWeek[];
  classes: OfficialSummaryClass[];
  classRows: OfficialSummaryClassRow[];
  gradeRows: OfficialSummaryGradeRow[];
  schoolTotals: OfficialSummarySchoolTotals;
  readiness: OfficialSummaryReadiness;
  term: OfficialSummaryTerm | null;
  terms: OfficialSummaryTerm[];
};

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function relation<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function mondayFor(date: string) {
  const value = new Date(`${date}T12:00:00`);
  const day = value.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + offset);
  return isoDate(value);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return isoDate(value);
}

function rangeDates(scopeStart: string, scopeEnd: string) {
  const dates: string[] = [];
  for (let current = scopeStart; current <= scopeEnd; current = addDays(current, 1)) dates.push(current);
  return dates;
}

function emptySplit(): OfficialSexSplit {
  return { boys: 0, girls: 0, total: 0 };
}

function addSex(split: OfficialSexSplit, sex: string | null) {
  split.total += 1;
  if (sex === "male") split.boys += 1;
  else if (sex === "female") split.girls += 1;
}

/** Official absence = daily-register status "absent". Present/Late/Excused are not absence. */
function isOfficialAbsence(status: string | null | undefined) {
  return status === "absent";
}

function percent(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

/**
 * Statutory % absence = total absent learner-days / total possible learner
 * attendances x 100, scoped to the effective teaching days of the reporting
 * period (NO_TEACHING days contribute zero possible attendances). The last
 * expected school day of the reporting week is the last non-NO_TEACHING date,
 * so a NO_TEACHING Friday is reported as at the preceding valid school day.
 */
export async function getOfficialAttendanceSummary(
  schoolId: string,
  academicYear: number,
  mode: "week" | "term",
  date: string,
  requestedTermId?: string | null,
): Promise<OfficialAttendanceSummary> {
  const supabase = await createSupabaseServerClient();
  let scopeStart: string | null = mode === "week" ? mondayFor(date) : null;

  // Wave 1: classes, term calendar (term mode) and the per-date teaching
  // impact for the whole range resolve together before any register data loads.
  const [classResult, termsResult, impactResult] = await Promise.all([
    supabase.from("register_classes").select("id,display_name,grade_id,grades(display_name)").eq("school_id", schoolId).eq("academic_year", academicYear).order("display_name"),
    mode === "term"
      ? supabase.from("academic_terms").select("id,term_number,display_name,starts_on,ends_on,status,academic_years!inner(school_id,year)").eq("academic_years.school_id", schoolId).eq("academic_years.year", academicYear).order("term_number")
      : Promise.resolve({ data: [], error: null as unknown }),
    supabase.rpc("resolve_school_teaching_impact_range", { p_school_id: schoolId, p_from: scopeStart ?? `${academicYear}-01-01`, p_to: date }),
  ]);
  if (classResult.error || termsResult.error || impactResult.error) throw new Error("Unable to load the official attendance summary.");

  const classes: OfficialSummaryClass[] = (classResult.data ?? []).map((item: Record<string, unknown>) => ({
    id: String(item.id),
    name: String(item.display_name),
    gradeId: item.grade_id ? String(item.grade_id) : null,
    grade: relation(item.grades as { display_name: string }[] | { display_name: string } | null)?.display_name ?? "Grade",
  }));

  const terms: OfficialSummaryTerm[] = (termsResult.data ?? []).map((item: Record<string, unknown>) => ({
    id: String(item.id),
    displayName: String(item.display_name),
    termNumber: Number(item.term_number),
    startsOn: (item.starts_on as string | null) ?? null,
    endsOn: (item.ends_on as string | null) ?? null,
    status: String(item.status),
  }));

  const impactByDate = new Map<string, string>();
  for (const row of (impactResult.data ?? []) as { target_date: string; teaching_impact: string }[]) {
    impactByDate.set(String(row.target_date).slice(0, 10), String(row.teaching_impact));
  }

  // Term mode scopes to one academic term; fall back to the latest term that
  // has started by the requested date, or the first term, when none is chosen.
  let term: OfficialSummaryTerm | null = null;
  if (mode === "term") {
    term = terms.find((item) => item.id === requestedTermId) ?? null;
    if (!term) {
      const started = terms.filter((item) => !item.startsOn || item.startsOn <= date);
      term = [...started].sort((left, right) => right.termNumber - left.termNumber)[0] ?? terms[0] ?? null;
    }
  }
  if (term?.startsOn && scopeStart) scopeStart = term.startsOn > scopeStart ? term.startsOn : scopeStart;
  if (!scopeStart) {
    const fallbackStart = term?.startsOn ?? terms[0]?.startsOn ?? null;
    if (!fallbackStart) {
      return {
        mode, scopeStart: date, scopeEnd: date, lastTeachingDate: null, dates: [], teachingDates: [], nonTeachingDates: [], nonTeachingReasons: {},
        weeks: [], classes, classRows: [], gradeRows: [],
        schoolTotals: { possibleAttendances: 0, absentLearnerDays: 0, percentAbsence: null, weekly: [] },
        readiness: { complete: false, expectedRegisters: 0, submittedRegisters: 0, incomplete: [] },
        term, terms,
      };
    }
    scopeStart = fallbackStart > date ? date : fallbackStart;
  }

  const scopeFromDate: string = scopeStart; // narrowed non-null by the fallback above
  const dates = rangeDates(scopeFromDate, date);
  const teachingDates = dates.filter((day) => impactByDate.get(day) !== "NO_TEACHING");
  const nonTeachingDates = dates.filter((day) => impactByDate.get(day) === "NO_TEACHING");
  // Last expected school day of the reporting period drives both the
  // denominator window and the "as at" identity of the summary.
  const lastTeachingDate = teachingDates.length ? teachingDates[teachingDates.length - 1] : null;

  // Chronological Monday-start weeks; a week's reported date is its last
  // expected school day (normally the Friday, or the preceding valid day).
  const weeks: OfficialSummaryWeek[] = [];
  const weekIdByDate = new Map<string, string>();
  for (const day of dates) {
    const weekId = mondayFor(day);
    if (!weekIdByDate.has(weekId)) {
      weekIdByDate.set(weekId, weekId);
      weeks.push({ weekId, weekLabel: `Week ${weeks.length + 1}`, weekStart: weekId, weekEnd: addDays(weekId, 4), weekEndingReportedOn: null, dates: [], lastDate: null });
    }
    const week = weeks[weeks.length - 1];
    week.dates.push(day);
  }
  for (const week of weeks) {
    const teaching = week.dates.filter((day) => impactByDate.get(day) !== "NO_TEACHING");
    week.lastDate = teaching.length ? teaching[teaching.length - 1] : null;
    week.weekEndingReportedOn = week.lastDate;
  }
  const weekLabelById = new Map(weeks.map((week) => [week.weekId, week.weekLabel]));

  const empty = {
    mode, scopeStart: scopeFromDate, scopeEnd: date, lastTeachingDate, dates, teachingDates, nonTeachingDates, nonTeachingReasons: {} as Record<string, string>,
    weeks, classes, classRows: [] as OfficialSummaryClassRow[], gradeRows: [] as OfficialSummaryGradeRow[],
    schoolTotals: { possibleAttendances: 0, absentLearnerDays: 0, percentAbsence: null, weekly: [] as OfficialSummarySchoolTotals["weekly"] },
    readiness: { complete: false, expectedRegisters: 0, submittedRegisters: 0, incomplete: [] as OfficialSummaryReadiness["incomplete"] },
    term, terms,
  };
  if (!teachingDates.length || !classes.length) return empty;

  // Wave 2: canonical register evidence for the scope. daily_register_current
  // supplies every effective-enrolment observation (present default + events);
  // absence events re-state official absences for the day, so the denominator
  // comes from effective enrolments and the numerator only from status
  // "absent". Subject-period rows never appear here: the view is daily-register
  // only and the absence query filters observation_type = 'daily_register'.
  const [{ data: currentRows, error: currentError }, { data: submissionRows, error: submissionError }, { data: absenceRows, error: absenceError }, { data: overrideRows, error: overrideError }] = await Promise.all([
    supabase.from("daily_register_current").select("register_class_id,attendance_date,status,learner_id,learners!inner(sex)").eq("school_id", schoolId).in("attendance_date", teachingDates),
    supabase
      .from("attendance_register_submissions")
      .select("id,register_class_id,attendance_date,recorded_at,created_at,register_classes!inner(school_id,academic_year)")
      .eq("school_id", schoolId)
      .eq("register_classes.academic_year", academicYear)
      .in("attendance_date", teachingDates)
      .order("recorded_at", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("attendance_events")
      .select("register_class_id,attendance_date,status,learner_id,learners!inner(sex)")
      .eq("school_id", schoolId)
      .eq("observation_type", "daily_register")
      .in("attendance_date", teachingDates),
    nonTeachingDates.length
      ? supabase.from("school_day_overrides").select("school_date,reason").eq("school_id", schoolId).in("school_date", nonTeachingDates).not("reason", "is", null)
      : Promise.resolve({ data: [], error: null as unknown }),
  ]);
  if (currentError || submissionError || absenceError || overrideError) throw new Error("Unable to load official attendance evidence.");

  const nonTeachingReasons: Record<string, string> = {};
  for (const row of (overrideRows ?? []) as { school_date: string; reason: string | null }[]) {
    if (row.reason) nonTeachingReasons[String(row.school_date).slice(0, 10)] = row.reason;
  }

  // Latest submission wins per (class, day) — replacements are supersets, so
  // readiness reflects the authoritative current register for each date.
  const submittedKeys = new Set<string>();
  for (const row of (submissionRows ?? []) as { register_class_id: string; attendance_date: string }[]) {
    const key = `${row.register_class_id}:${String(row.attendance_date).slice(0, 10)}`;
    if (!submittedKeys.has(key)) submittedKeys.add(key);
  }

  const classById = new Map(classes.map((item) => [item.id, item]));
  const absentByClassDate = new Map<string, OfficialSexSplit>();
  const possibleByClassDate = new Map<string, number>();

  for (const row of (currentRows ?? []) as { register_class_id: string; attendance_date: string; status: string; learner_id: string; learners: { sex: string | null }[] | { sex: string | null } }[]) {
    if (!classById.has(String(row.register_class_id))) continue;
    const attendanceDate = String(row.attendance_date).slice(0, 10);
    const key = `${row.register_class_id}:${attendanceDate}`;
    possibleByClassDate.set(key, (possibleByClassDate.get(key) ?? 0) + 1);
    if (isOfficialAbsence(row.status)) {
      const split = absentByClassDate.get(key) ?? emptySplit();
      addSex(split, relation(row.learners)?.sex ?? null);
      absentByClassDate.set(key, split);
    }
  }

  // Absent learner-days by sex, keyed by class/date and week.
  const absentWeekByClass = new Map<string, Map<string, OfficialSexSplit>>();
  for (const row of (absenceRows ?? []) as { register_class_id: string; attendance_date: string; status: string; learners: { sex: string | null }[] | { sex: string | null } }[]) {
    if (!classById.has(String(row.register_class_id)) || !isOfficialAbsence(row.status)) continue;
    const attendanceDate = String(row.attendance_date).slice(0, 10);
    const weekId = mondayFor(attendanceDate);
    const classWeeks = absentWeekByClass.get(String(row.register_class_id)) ?? new Map<string, OfficialSexSplit>();
    const split = classWeeks.get(weekId) ?? emptySplit();
    addSex(split, relation(row.learners)?.sex ?? null);
    classWeeks.set(weekId, split);
    absentWeekByClass.set(String(row.register_class_id), classWeeks);
  }

  // Per-class weekly cells come from the authoritative current-register
  // absence counts (not the event re-statement) so totals and weeklies agree.
  const classWeekly = new Map<string, Map<string, OfficialSexSplit>>();
  for (const [key, split] of absentByClassDate) {
    const [classId, attendanceDate] = key.split(":");
    const weekId = mondayFor(attendanceDate);
    const classWeeks = classWeekly.get(classId) ?? new Map<string, OfficialSexSplit>();
    const target = classWeeks.get(weekId) ?? emptySplit();
    target.boys += split.boys;
    target.girls += split.girls;
    target.total += split.total;
    classWeeks.set(weekId, target);
    classWeekly.set(classId, classWeeks);
  }

  const sortedClasses = [...classes].sort((left, right) => collator.compare(left.grade, right.grade) || collator.compare(left.name, right.name));
  const gradeById = new Map<string, string>();
  for (const item of classes) if (item.gradeId) gradeById.set(item.gradeId, item.grade);

  const classRows: OfficialSummaryClassRow[] = sortedClasses.map((item) => {
    const total = absentByClassDate.get(item.id) ?? emptySplit();
    const weekly = weeks
      .filter((week) => week.lastDate)
      .map((week) => ({ weekId: week.weekId, weekLabel: weekLabelById.get(week.weekId) ?? week.weekId, absences: classWeekly.get(item.id)?.get(week.weekId) ?? emptySplit() }));
    return { classId: item.id, className: item.name, gradeId: item.gradeId, gradeName: item.grade, absences: total, weekly };
  });

  const gradeTotals = new Map<string, { gradeId: string | null; gradeName: string; absences: OfficialSexSplit; weeks: Map<string, OfficialSexSplit> }>();
  for (const row of classRows) {
    const key = row.gradeId ?? "ungraded";
    const entry = gradeTotals.get(key) ?? { gradeId: row.gradeId, gradeName: row.gradeName, absences: emptySplit(), weeks: new Map<string, OfficialSexSplit>() };
    entry.absences.boys += row.absences.boys;
    entry.absences.girls += row.absences.girls;
    entry.absences.total += row.absences.total;
    for (const week of row.weekly) {
      const target = entry.weeks.get(week.weekId) ?? emptySplit();
      target.boys += week.absences.boys;
      target.girls += week.absences.girls;
      target.total += week.absences.total;
      entry.weeks.set(week.weekId, target);
    }
    gradeTotals.set(key, entry);
  }
  const gradeRows: OfficialSummaryGradeRow[] = [...gradeTotals.values()]
    .sort((left, right) => collator.compare(left.gradeName, right.gradeName))
    .map((entry) => ({ gradeId: entry.gradeId, gradeName: entry.gradeName, absences: entry.absences, weekly: weeks.filter((week) => week.lastDate).map((week) => ({ weekId: week.weekId, weekLabel: weekLabelById.get(week.weekId) ?? week.weekId, absences: entry.weeks.get(week.weekId) ?? emptySplit() })) }));

  // Per-date totals let weekly aggregates stay linear in dates.
  const possibleByDate = new Map<string, number>();
  for (const [key, count] of possibleByClassDate) {
    const attendanceDate = key.split(":")[1];
    possibleByDate.set(attendanceDate, (possibleByDate.get(attendanceDate) ?? 0) + count);
  }
  const absentByDate = new Map<string, number>();
  for (const [key, split] of absentByClassDate) {
    const attendanceDate = key.split(":")[1];
    absentByDate.set(attendanceDate, (absentByDate.get(attendanceDate) ?? 0) + split.total);
  }

  const possibleAttendances = [...possibleByClassDate.values()].reduce((total, count) => total + count, 0);
  const absentLearnerDays = [...absentByClassDate.values()].reduce((total, split) => total + split.total, 0);
  const weeklyTotals = weeks
    .filter((week) => week.lastDate)
    .map((week) => {
      const weekDates = week.dates.filter((day) => impactByDate.get(day) !== "NO_TEACHING");
      const possible = weekDates.reduce((total, day) => total + (possibleByDate.get(day) ?? 0), 0);
      const absent = weekDates.reduce((total, day) => total + (absentByDate.get(day) ?? 0), 0);
      return { weekId: week.weekId, weekLabel: weekLabelById.get(week.weekId) ?? week.weekId, possibleAttendances: possible, absentLearnerDays: absent, percentAbsence: percent(absent, possible) };
    });

  // Register-readiness: expected register submissions are every register
  // class for every expected teaching day up to the last expected school day.
  const incomplete: OfficialSummaryReadiness["incomplete"] = [];
  let expectedRegisters = 0;
  let submittedRegisters = 0;
  for (const day of teachingDates) {
    for (const item of sortedClasses) {
      expectedRegisters += 1;
      if (submittedKeys.has(`${item.id}:${day}`)) submittedRegisters += 1;
      else incomplete.push({ classId: item.id, className: item.name, gradeName: item.grade, date: day });
    }
  }
  incomplete.sort((left, right) => collator.compare(left.date, right.date) || collator.compare(left.className, right.className));

  return {
    mode,
    scopeStart: scopeFromDate,
    scopeEnd: date,
    lastTeachingDate,
    dates,
    teachingDates,
    nonTeachingDates,
    nonTeachingReasons,
    weeks,
    classes,
    classRows,
    gradeRows,
    schoolTotals: { possibleAttendances, absentLearnerDays, percentAbsence: percent(absentLearnerDays, possibleAttendances), weekly: weeklyTotals },
    readiness: { complete: submittedRegisters === expectedRegisters, expectedRegisters, submittedRegisters, incomplete },
    term,
    terms,
  };
}
