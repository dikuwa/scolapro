/**
 * Compact read-only date range labels for operational/departmental activities.
 *
 * ScolaPro stores dates as `YYYY-MM-DD` school-local keys, so formatting is done
 * on a noon-anchored local date (the same convention used elsewhere) rather than
 * on a UTC instant. Repeated month/year components are collapsed so a range stays
 * scannable:
 *
 *   12 Oct 2026
 *   12–22 Oct 2026
 *   28 Oct – 3 Nov 2026
 *   28 Dec 2026 – 5 Jan 2027
 *
 * An unusable or missing end date never invents a range: only the start date is
 * shown.
 */

const dayFormatter = new Intl.DateTimeFormat("en-NA", { day: "numeric" });
const dayMonthFormatter = new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short" });
const dayMonthYearFormatter = new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" });

function parseDateKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}` === value ? parsed : null;
}

export function formatActivityDateRange(startsOn: string, endsOn?: string | null): string {
  const start = parseDateKey(startsOn);
  if (!start) return "Date not set";

  const end = endsOn ? parseDateKey(endsOn) : null;
  if (!end || end.getTime() === start.getTime()) return dayMonthYearFormatter.format(start);

  if (end.getTime() < start.getTime()) return dayMonthYearFormatter.format(start);

  if (start.getFullYear() !== end.getFullYear()) {
    return `${dayMonthYearFormatter.format(start)} – ${dayMonthYearFormatter.format(end)}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${dayMonthFormatter.format(start)} – ${dayMonthYearFormatter.format(end)}`;
  }
  return `${dayFormatter.format(start)}–${dayMonthYearFormatter.format(end)}`;
}
