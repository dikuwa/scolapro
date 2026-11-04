import type { ClassListColumnId, ClassListLearnerRow } from "@/features/learners/class-list-types";
import { classListColumnLabels } from "@/features/learners/class-list-types";

export type OfficialClassListColumn = {
  key: "number" | "learner" | ClassListColumnId | `blank-${number}`;
  label: string;
  weight: number;
  value: (row: ClassListLearnerRow, index: number) => string;
};

const columnWeights: Record<ClassListColumnId, number> = {
  admissionNumber: 1.05,
  sex: 0.9,
  dateOfBirth: 1.35,
  registerClass: 0.85,
  status: 0.7,
  guardianName: 1.25,
  guardianPhone: 1,
  guardianAddress: 1.35,
  emergencyContact: 1.5,
};

function sexInitial(value: string | null): string {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "male" || normalized === "m") return "M";
  if (normalized === "female" || normalized === "f") return "F";
  return value?.trim() || "—";
}

function formatClassListBirthDate(value: string | null | undefined): string {
  const parts = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return "—";

  const [, year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

function optionalColumn(key: ClassListColumnId): OfficialClassListColumn {
  return {
    key,
    label: classListColumnLabels[key],
    weight: columnWeights[key],
    value: (row) => {
      if (key === "sex") return sexInitial(row.sex);
      if (key === "dateOfBirth") return formatClassListBirthDate(row.dateOfBirth);
      return row[key] || "—";
    },
  };
}

export function buildOfficialClassListColumns(columns: ClassListColumnId[], blankColumns: number): OfficialClassListColumn[] {
  const hasAdmissionNumber = columns.includes("admissionNumber");
  const remainingColumns = columns.filter((key) => key !== "admissionNumber");
  return [
    { key: "number", label: "No.", weight: 0.38, value: (_row, index) => String(index + 1) },
    ...(hasAdmissionNumber ? [optionalColumn("admissionNumber")] : []),
    { key: "learner", label: "Learner", weight: 2.4, value: (row) => row.learnerName },
    ...remainingColumns.map(optionalColumn),
    ...Array.from({ length: blankColumns }, (_, index): OfficialClassListColumn => ({
      key: `blank-${index + 1}`,
      label: "",
      weight: 0.9,
      value: () => "",
    })),
  ];
}

export function classListColumnPercentages(columns: OfficialClassListColumn[]) {
  const total = columns.reduce((sum, column) => sum + column.weight, 0);
  return columns.map((column) => (column.weight / total) * 100);
}



export function classListDocumentName(registerClass: string, rosterTitle?: string | null): string {
  const classValue = registerClass?.trim() ?? "";
  const rosterValue = rosterTitle?.trim() ?? "";
  const usableClass = classValue && classValue !== "—" && classValue !== "Multiple classes";
  const rosterIsSameClass = rosterValue && usableClass && rosterValue.localeCompare(classValue, undefined, { sensitivity: "base" }) === 0;
  const preferred = rosterValue && !rosterIsSameClass ? rosterValue : usableClass ? classValue : rosterValue || "Class";
  const concise = preferred.replace(/^Grade\s+/i, "").trim();
  return `${concise || "Class"}: Class List`;
}
