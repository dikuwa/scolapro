export type ClassListColumnKey =
  | "learner"
  | "admissionNumber"
  | "grade"
  | "registerClass"
  | "status"
  | "sex"
  | "dateOfBirth"
  | "guardian"
  | "guardianPhone"
  | "emergencyContact"
  | "guardianAddress"
  | "candidateNumber";

export type ClassListColumn = {
  key: ClassListColumnKey;
  label: string;
  group: "Learner" | "Academic" | "Guardian" | "Examination";
};

export type ClassListRow = {
  enrolmentId: string;
  learnerId: string;
  learner: string;
  admissionNumber: string;
  gradeId: string | null;
  grade: string;
  registerClassId: string | null;
  registerClass: string;
  status: string;
  sex: string;
  dateOfBirth: string;
  guardian: string;
  guardianPhone: string;
  emergencyContact: string;
  guardianAddress: string;
  candidateNumbers: Record<string, string>;
};

