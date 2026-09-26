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
  sex: 0.55,
  registerClass: 0.85,
  status: 0.7,
  guardianName: 1.25,
  guardianPhone: 1,
  emergencyContact: 1.5,
};

function sexInitial(value: string | null): string {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "male" || normalized === "m") return "M";
  if (normalized === "female" || normalized === "f") return "F";
  return value?.trim() || "—";
}

function optionalColumn(key: ClassListColumnId): OfficialClassListColumn {
  return {
    key,
    label: classListColumnLabels[key],
    weight: columnWeights[key],
    value: (row) => key === "sex" ? sexInitial(row.sex) : row[key] || "—",
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

