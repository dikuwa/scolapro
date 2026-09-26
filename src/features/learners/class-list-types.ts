export const classListColumnIds = [
  "admissionNumber",
  "sex",
  "registerClass",
  "status",
  "guardianName",
  "guardianPhone",
  "guardianAddress",
  "emergencyContact",
] as const;

export type ClassListColumnId = (typeof classListColumnIds)[number];
export type ClassListRosterType =
  | "register_class"
  | "grade"
  | "subject"
  | "teacher_subject"
  | "teaching_group"
  | "field_group";
export type ClassListScope = "my" | "all";

export type ClassListTarget = {
  rosterType: ClassListRosterType;
  rosterId: string;
};

export type ClassListConfiguration = {
  scope: ClassListScope;
  rosterType: ClassListRosterType;
  rosterId: string;
  columns: ClassListColumnId[];
  blankColumns: number;
};

export type ClassListRosterOption = {
  id: string;
  label: string;
  helper: string;
};

export type ClassListLearnerRow = {
  learnerId: string;
  learnerName: string;
  admissionNumber: string | null;
  sex: string | null;
  registerClass: string;
  status: string;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianAddress: string | null;
  emergencyContact: string | null;
};

export type ClassListWorkspaceData = {
  academicYear: number;
  schoolName: string;
  canUseAllScope: boolean;
  canViewGuardianFields: boolean;
  effectiveScope: ClassListScope;
  options: Record<ClassListRosterType, ClassListRosterOption[]>;
  configuration: ClassListConfiguration;
  title: string;
  grade: string;
  className: string;
  registerTeacherName: string | null;
  learners: ClassListLearnerRow[];
};

export type ClassListBatchWorkspaceData = {
  targets: ClassListTarget[];
  lists: ClassListWorkspaceData[];
  totalLearners: number;
};

export const classListColumnLabels: Record<ClassListColumnId, string> = {
  admissionNumber: "Admission No.",
  sex: "Sex",
  registerClass: "Register Class",
  status: "Status",
  guardianName: "Guardian name",
  guardianPhone: "Guardian phone",
  guardianAddress: "Guardian address",
  emergencyContact: "Emergency contact",
};

