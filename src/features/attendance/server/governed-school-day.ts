export const GOVERNED_TEACHING_IMPACTS = [
  "NORMAL",
  "NO_TEACHING",
  "PARTIAL_DAY",
  "ALTERED_TIMETABLE",
  "EXAM_TIMETABLE",
] as const;

export type GovernedTeachingImpact = (typeof GOVERNED_TEACHING_IMPACTS)[number];

export type GovernedTeachingImpactRow = {
  target_date: unknown;
  teaching_impact: unknown;
};

export type GovernedSchoolDay = {
  date: string;
  impact: GovernedTeachingImpact | null;
  eligible: boolean;
  displayed: boolean;
};

const governedImpactSet = new Set<string>(GOVERNED_TEACHING_IMPACTS);
const eligibleImpactSet = new Set<GovernedTeachingImpact>([
  "NORMAL",
  "PARTIAL_DAY",
  "ALTERED_TIMETABLE",
  "EXAM_TIMETABLE",
]);

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return isoDate(value);
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && isoDate(parsed) === value;
}

function isWeekday(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

function rangeDates(start: string, end: string) {
  const dates: string[] = [];
  for (let current = start; current <= end; current = addDays(current, 1)) dates.push(current);
  return dates;
}

function readinessError(detail: string) {
  return new Error(`Learner calendar is not ready: ${detail}`);
}

/**
 * Converts the governed range resolver response into one affirmative school-day
 * decision used by every attendance denominator. The resolver contract is one
 * row per date. A missing weekend is safe only as a closed day; a missing
 * weekday is ambiguous (it could hide an official closure) and fails closed.
 */
export function resolveGovernedSchoolDays(input: {
  start: string;
  end: string;
  rows: readonly GovernedTeachingImpactRow[];
}) {
  if (!isIsoDate(input.start) || !isIsoDate(input.end) || input.start > input.end) {
    throw readinessError("the governed school-day range is invalid.");
  }

  const impactByDate = new Map<string, GovernedTeachingImpact>();
  for (const row of input.rows) {
    const rawDate = typeof row.target_date === "string" ? row.target_date.slice(0, 10) : "";
    const rawImpact = typeof row.teaching_impact === "string" ? row.teaching_impact : "";
    if (!isIsoDate(rawDate) || !governedImpactSet.has(rawImpact)) {
      throw readinessError("the governed school-day resolver returned malformed evidence.");
    }
    if (rawDate < input.start || rawDate > input.end) continue;
    if (impactByDate.has(rawDate)) {
      throw readinessError(`the governed school-day resolver returned duplicate evidence for ${rawDate}.`);
    }
    impactByDate.set(rawDate, rawImpact as GovernedTeachingImpact);
  }

  const dates = rangeDates(input.start, input.end);
  for (const date of dates) {
    if (isWeekday(date) && !impactByDate.has(date)) {
      throw readinessError(`the governed school-day resolver has no authoritative result for ${date}.`);
    }
  }

  const decisionFor = (date: string): GovernedSchoolDay => {
    if (!isIsoDate(date) || date < input.start || date > input.end) {
      return { date, impact: null, eligible: false, displayed: false };
    }
    const impact = impactByDate.get(date) ?? null;
    const eligible = impact !== null && eligibleImpactSet.has(impact);
    return {
      date,
      impact,
      eligible,
      displayed: isWeekday(date) || eligible,
    };
  };

  return {
    decisionFor,
    displayedDates: (start = input.start, end = input.end) =>
      rangeDates(start, end).filter((date) => decisionFor(date).displayed),
    eligibleDates: (start = input.start, end = input.end) =>
      rangeDates(start, end).filter((date) => decisionFor(date).eligible),
  };
}

export type RegisterAttendanceEvidence = {
  status: string;
  reasonId: string | null;
  note: string | null;
};

export type RegisterAttendanceMark = "I" | "a" | "";

export function calculateLearnerRegisterBalance(input: {
  scopeDays: readonly { date: string; eligible: boolean }[];
  termEligibleDates: readonly string[];
  enrolledFrom: string;
  enrolledTo: string | null;
  evidenceForDate: (date: string) => RegisterAttendanceEvidence | undefined;
}) {
  const activeOn = (date: string) =>
    input.enrolledFrom <= date && (!input.enrolledTo || input.enrolledTo >= date);
  const marks: Record<string, RegisterAttendanceMark> = {};
  const reasonedAbsenceDates: Record<string, boolean> = {};
  let attended = 0;
  let absent = 0;

  for (const day of input.scopeDays) {
    if (!day.eligible || !activeOn(day.date)) {
      marks[day.date] = "";
      continue;
    }
    const evidence = input.evidenceForDate(day.date);
    if (evidence?.status === "absent") {
      marks[day.date] = "a";
      reasonedAbsenceDates[day.date] = Boolean(evidence.reasonId || evidence.note?.trim());
      absent += 1;
    } else {
      marks[day.date] = "I";
      attended += 1;
    }
  }

  let termAbsent = 0;
  let termDays = 0;
  for (const date of input.termEligibleDates) {
    if (!activeOn(date)) continue;
    termDays += 1;
    if (input.evidenceForDate(date)?.status === "absent") termAbsent += 1;
  }

  const possible = attended + absent;
  const termAttended = termDays - termAbsent;
  return {
    marks,
    reasonedAbsenceDates,
    attended,
    absent,
    possible,
    termAttended,
    termAbsent,
    termDays,
  };
}
