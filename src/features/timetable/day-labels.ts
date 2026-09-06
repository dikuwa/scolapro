export type TimetableCycleMode = "weekday" | "rotating";

const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function getTimetableDayNames(mode: TimetableCycleMode, cycleLength: number): string[] {
  const safeLength = Math.max(1, Math.min(mode === "weekday" ? 7 : 10, Math.trunc(cycleLength || 1)));
  return mode === "weekday"
    ? weekdayNames.slice(0, safeLength)
    : Array.from({ length: safeLength }, (_, index) => `Day ${index + 1}`);
}

export function getTimetableDayLabel(mode: TimetableCycleMode, cycleLength: number, dayIndex: number): string {
  return getTimetableDayNames(mode, cycleLength)[dayIndex - 1] ?? `Day ${dayIndex}`;
}
