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
  "Home Language",
  "Admission Number",
]);

const METRIC_WIDTHS: Record<string, number> = {
  Age: 4.5,
  "Days Absent": 5.5,
  "Years in Grade": 5.5,
  "Years in Phase": 5.5,
  "Average %": 5.5,
  "Overall %": 5.5,
  Rank: 4.5,
  Cycle: 6,
  Recommendation: 7,
  Ruling: 6,
  Remarks: 7,
  "Support comments": 11,
};

const HORIZONTAL_METRIC_HEADINGS = new Set(["Support comments"]);

const IDENTITY_WIDTHS: Record<string, number> = {
  "No.": 4,
  No: 4,
  Learner: 20,
  Student: 20,
  Sex: 5,
  Gender: 5,
  DOB: 9,
  "Birth Date": 9,
  "Home Language": 9,
  "Admission Number": 9,
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
  if (kind === "subject") return column.endsWith(" Symbol") ? 5 : 6;
  return METRIC_WIDTHS[column] ?? Math.min(12, Math.max(7, Math.ceil(column.length / 2)));
}


export function academicScheduleHeadingOrientation(
  column: string,
  subjectNames: readonly string[] = [],
): "horizontal" | "vertical" {
  const kind = academicScheduleColumnKind(column, subjectNames);
  if (column === "Admission Number") return "vertical";
  if (kind === "identity" || HORIZONTAL_METRIC_HEADINGS.has(column)) return "horizontal";
  return "vertical";
}

export function academicScheduleCellAlignment(
  column: string,
  subjectNames: readonly string[] = [],
): "left" | "center" {
  if (["Learner", "Student", "Home Language", "Support comments"].includes(column)) return "left";
  const kind = academicScheduleColumnKind(column, subjectNames);
  return kind === "subject" || kind === "metric" || ["No.", "No", "Admission Number", "Sex", "Gender", "DOB", "Birth Date"].includes(column)
    ? "center"
    : "left";
}

export function academicScheduleColumnLabel(column: string): string {
  if (column === "Sex") return "Gender";
  if (column === "Birth Date") return "DOB";
  return column;
}
