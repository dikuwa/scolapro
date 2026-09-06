const NAMIBIA_TIME_ZONE = "Africa/Windhoek";

const namibiaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: NAMIBIA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getNamibiaDateKey(date = new Date()): string {
  const parts = namibiaDateFormatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getNamibiaCalendarYear(date = new Date()): number {
  return Number(getNamibiaDateKey(date).slice(0, 4));
}
