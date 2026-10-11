export type AttendanceNavigationView = "day" | "week";
export type AttendanceNavigationSort = "asc" | "desc";
export type AttendanceNavigationSex = "all" | "male" | "female";

function dateParts(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

function fromUtcDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function shiftAttendanceDate(value: string, days: number) {
  const parts = dateParts(value);
  if (!parts) return value;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
  return fromUtcDate(date);
}

export function attendanceWeekday(value: string) {
  const parts = dateParts(value);
  if (!parts) return -1;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)).getUTCDay();
}

export function schoolDayShift(value: string, direction: -1 | 1) {
  let next = value;
  do next = shiftAttendanceDate(next, direction);
  while (attendanceWeekday(next) === 0 || attendanceWeekday(next) === 6);
  return next;
}

export function mondayForAttendanceDate(value: string) {
  const weekday = attendanceWeekday(value);
  if (weekday < 0) return value;
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return shiftAttendanceDate(value, offset);
}

export function shiftAttendanceWeek(value: string, weeks: number) {
  return shiftAttendanceDate(value, weeks * 7);
}

export function formatAttendanceDate(
  value: string,
  options: Intl.DateTimeFormatOptions,
) {
  const parts = dateParts(value);
  if (!parts) return value;
  const instant = new Date(`${value}T12:00:00+02:00`);
  return new Intl.DateTimeFormat("en-NA", {
    ...options,
    timeZone: "Africa/Windhoek",
  }).format(instant);
}

export function buildAttendanceNavigationHref(input: {
  view: AttendanceNavigationView;
  date: string;
  classId?: string | null;
  sort?: AttendanceNavigationSort;
  sex?: AttendanceNavigationSex;
}) {
  const params = new URLSearchParams({ view: input.view });
  if (input.classId) params.set("class", input.classId);
  params.set("date", input.view === "week" ? mondayForAttendanceDate(input.date) : input.date);
  if (input.sort === "desc") params.set("sort", "desc");
  if (input.sex === "male" || input.sex === "female") params.set("sex", input.sex);
  return `/attendance?${params.toString()}`;
}
