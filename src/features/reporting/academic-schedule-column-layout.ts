export type AcademicScheduleColumnKind = "identity" | "metric" | "subject";

const IDENTITY_COLUMNS = new Set([
  "No.",
  "No",
  "Learner",
  "Student",
  "Sex",
  "Gender",
  "DOB",
  "Birth Date",
  "Admission Number",
]);

const METRIC_WIDTHS: Record<string, number> = {
  "Home Language": 9,
  Age: 6,
  "Days Absent": 7,
  "Years in Grade": 7,
  "Years in Phase": 7,
  "Average %": 7,
  "Overall %": 7,
  Rank: 6,
  Cycle: 7,
  Recommendation: 8,
  Ruling: 7,
  Remarks: 10,
  "Support comments": 12,
};

const IDENTITY_WIDTHS: Record<string, number> = {
  "No.": 5,
  No: 5,
  Learner: 22,
  Student: 22,
  Sex: 6,
  Gender: 7,
  DOB: 10,
  "Birth Date": 10,
  "Admission Number": 14,
};

export function academicScheduleColumnKind(
  column: string,
  subjectNames: readonly string[] = [],
): AcademicScheduleColumnKind {
  if (IDENTITY_COLUMNS.has(column)) return "identity";
  if (METRIC_WIDTHS[column]) return "metric";
  if (subjectNames.some((subject) => column === subject || column.startsWith(subject + " "))) {
    return "subject";
  }
  return "metric";
}

export function academicScheduleColumnWidth(
  column: string,
  subjectNames: readonly string[] = [],
): number {
  const kind = academicScheduleColumnKind(column, subjectNames);
  if (kind === "identity") return IDENTITY_WIDTHS[column] ?? 10;
  if (kind === "subject") return 8;
  return METRIC_WIDTHS[column] ?? Math.min(12, Math.max(7, Math.ceil(column.length / 2)));
}
