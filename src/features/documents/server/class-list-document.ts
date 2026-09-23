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

export function buildOfficialClassListColumns(columns: ClassListColumnId[], blankColumns: number): OfficialClassListColumn[] {
  return [
    { key: "number", label: "No.", weight: 0.38, value: (_row, index) => String(index + 1) },
    { key: "learner", label: "Learner", weight: 2.4, value: (row) => row.learnerName },
    ...columns.map((key): OfficialClassListColumn => ({
      key,
      label: classListColumnLabels[key],
      weight: columnWeights[key],
      value: (row) => row[key] || "—",
    })),
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

