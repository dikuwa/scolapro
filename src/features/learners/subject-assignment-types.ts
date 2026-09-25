export type SubjectAssignmentScopeType = "grade" | "register_class" | "field_group";

export type SubjectAssignmentScopeOption = {
  id: string;
  label: string;
  helper: string;
  gradeId: string;
};

export type SubjectAssignmentOffering = {
  id: string;
  gradeId: string;
  subjectCode: string;
  subjectName: string;
  status: string;
};

export type SubjectAssignmentWorkspaceData = {
  academicYear: number;
  schoolName: string;
  scopes: Record<SubjectAssignmentScopeType, SubjectAssignmentScopeOption[]>;
  offerings: SubjectAssignmentOffering[];
};

export type SubjectAssignmentConflict = {
  subject_offering_id: string;
  code: "wrong_grade" | "inactive_offering";
  message: string;
};

export type SubjectAssignmentPreview = {
  scope: { type: SubjectAssignmentScopeType; id: string; label: string; grade_id: string; grade_label: string };
  subject_offering_ids: string[];
  enrolment_ids: string[];
  affected_learner_count: number;
  affected_subject_count: number;
  addition_count: number;
  reactivation_count: number;
  unchanged_count: number;
  withdrawal_count: number;
  conflict_count: number;
  conflicts: SubjectAssignmentConflict[];
  preview_fingerprint: string;
};

export type SubjectAssignmentActionResult = {
  success: boolean;
  message: string;
  preview?: SubjectAssignmentPreview;
};

export type LearnerSubjectRow = SubjectAssignmentOffering & {
  registrationId: string | null;
  registrationStatus: "active" | "withdrawn" | null;
  registeredAt: string | null;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
};

export type LearnerSubjectWorkspaceData = {
  learnerId: string;
  learnerName: string;
  enrolmentId: string;
  academicYear: number;
  gradeLabel: string;
  registerClassLabel: string;
  subjects: LearnerSubjectRow[];
};
