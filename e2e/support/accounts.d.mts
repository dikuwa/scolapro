export type SyntheticAccount = {
  key: string;
  userId: string;
  email: string;
  displayName: string;
  roleKey: string;
  tenant: "demo" | "isolation";
  expectCapture: boolean;
  reason: string;
  staffMemberId?: string;
  membershipId?: string;
  assignmentId?: string;
};

export declare const DEMO: {
  readonly tenantId: string;
  readonly schoolId: string;
  readonly schoolName: string;
  readonly gradeTenId: string;
  readonly registerClass10A: string;
  readonly registerClass10B: string;
  readonly registerClass10AName: string;
  readonly registerClass10BName: string;
  readonly learnerAmaraEnrolmentId: string;
  readonly learnerTomasEnrolmentId: string;
  readonly registerBoyLearnerId: string;
  readonly registerBoyEnrolmentId: string;
  readonly registerVisualSubmissionId: string;
  readonly registerVisualAbsenceEventId: string;
  readonly nonTeachingDate: string;
  readonly teachingDate: string;
  readonly draftDate: string;
};

export declare const OUTSIDER_TENANT: {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly schoolId: string;
  readonly schoolName: string;
};

export declare const SYNTHETIC_ACCOUNTS: {
  readonly admin: SyntheticAccount;
  readonly registerTeacher: SyntheticAccount;
  readonly unassignedTeacher: SyntheticAccount;
  readonly hod: SyntheticAccount;
  readonly outsider: SyntheticAccount;
};

export declare const SYNTHETIC_ACCOUNT_LIST: readonly SyntheticAccount[];

export declare function syntheticPassword(
  env?: Record<string, string | undefined>,
): string;

export declare const E2E_EMAILS: Record<string, string>;
