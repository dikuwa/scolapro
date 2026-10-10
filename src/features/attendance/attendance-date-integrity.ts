type WeeklyDraftCell = {
  date: string;
  status: string;
  reasonId?: string | null;
  note?: string | null;
};

type WeeklyDraftRow = {
  enrolmentId: string;
  days: WeeklyDraftCell[];
};

type WeeklyPayloadOptions = {
  dates: readonly string[];
  rows: readonly WeeklyDraftRow[];
  nonTeachingDates: readonly string[];
  mutationIds: Readonly<Record<string, string>>;
  submissionIds: Readonly<Record<string, string>>;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(date: string) {
  if (!ISO_DATE.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date ? null : parsed;
}

function addDays(date: Date, days: number) {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function weeklyAttendanceViewIdentity(input: {
  registerClassId: string | null;
  weekStart: string;
  weekEnd: string;
  dates: readonly string[];
}) {
  return [input.registerClassId ?? "none", input.weekStart, input.weekEnd, input.dates.join(",")].join(":");
}

export function dailyAttendanceViewIdentity(input: {
  registerClassId: string | null;
  attendanceDate: string;
  submissionId: string | null;
}) {
  return [input.registerClassId ?? "none", input.attendanceDate, input.submissionId ?? "draft"].join(":");
}

export function weeklyCellForDate<T extends WeeklyDraftCell>(row: { days: readonly T[] }, date: string) {
  return row.days.find((cell) => cell.date === date) ?? null;
}

export function weeklyRowsMatchDates(rows: readonly WeeklyDraftRow[], dates: readonly string[]) {
  const expectedDates = new Set(dates);
  if (expectedDates.size !== dates.length) return false;

  return rows.every((row) => {
    const rowDates = new Set(row.days.map((cell) => cell.date));
    return rowDates.size === row.days.length
      && row.days.length === dates.length
      && dates.every((date) => rowDates.has(date));
  });
}

export function buildWeeklyAttendancePayload({
  dates,
  rows,
  nonTeachingDates,
  mutationIds,
  submissionIds,
}: WeeklyPayloadOptions) {
  if (!weeklyRowsMatchDates(rows, dates)) return null;
  const blockedDates = new Set(nonTeachingDates);

  const payload = dates
    .filter((date) => !blockedDates.has(date))
    .map((date) => ({
      date,
      client_mutation_id: mutationIds[date],
      replaces_submission_id: submissionIds[date] ?? null,
      exceptions: rows.flatMap((row) => {
        const cell = weeklyCellForDate(row, date);
        return cell && cell.status !== "present"
          ? [{
              enrolment_id: row.enrolmentId,
              status: cell.status,
              reason_id: cell.reasonId ?? null,
              note: cell.note ?? null,
            }]
          : [];
      }),
    }));

  return payload.every((day) => Boolean(day.client_mutation_id)) ? payload : null;
}

export function weeklySubmissionPeriodError(input: {
  weekStart: string;
  weekEnd: string;
  dates: readonly string[];
}) {
  const start = parseIsoDate(input.weekStart);
  const end = parseIsoDate(input.weekEnd);
  if (!start || !end || start.getUTCDay() !== 1 || addDays(start, 4) !== input.weekEnd) {
    return "The selected attendance week is invalid. Refresh and try again.";
  }

  if (input.dates.length < 1 || input.dates.length > 5 || new Set(input.dates).size !== input.dates.length) {
    return "The weekly attendance dates do not match the selected week. Refresh and try again.";
  }

  let previousDate = "";
  for (const date of input.dates) {
    const parsed = parseIsoDate(date);
    if (
      !parsed
      || parsed.getUTCDay() === 0
      || parsed.getUTCDay() === 6
      || date < input.weekStart
      || date > input.weekEnd
      || (previousDate && date <= previousDate)
    ) {
      return "The weekly attendance dates do not match the selected week. Refresh and try again.";
    }
    previousDate = date;
  }

  return null;
}

export function dailySubmissionViewError(input: {
  attendanceDate: string;
  viewAttendanceDate: string;
  registerClassId: string;
  viewRegisterClassId: string;
}) {
  if (!parseIsoDate(input.attendanceDate) || input.attendanceDate !== input.viewAttendanceDate) {
    return "The attendance date changed before this register was saved. Refresh and try again.";
  }
  if (input.registerClassId !== input.viewRegisterClassId) {
    return "The register class changed before this attendance was saved. Refresh and try again.";
  }
  return null;
}
