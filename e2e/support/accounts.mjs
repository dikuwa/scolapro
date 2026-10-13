// Shared synthetic world for authenticated E2E runs.
//
// Every identifier here is fake and local-only. None of these accounts, staff
// members, tenants or learners exist in production, and the seed script that
// creates them refuses to run outside the local Supabase stack.
//
// Plain JavaScript so `node --test`, the seed script and the TypeScript specs
// can all import the same source of truth.

/** Demo tenant / school / structure created by supabase/seed.sql. */
export const DEMO = Object.freeze({
  tenantId: "11111111-1111-4111-8111-111111111111",
  schoolId: "22222222-2222-4222-8222-222222222222",
  schoolName: "Namib High School",
  gradeTenId: "30000000-0000-4000-8000-000000000010",
  registerClass10A: "40000000-0000-4000-8000-00000000001a",
  registerClass10B: "40000000-0000-4000-8000-00000000001b",
  registerClass10AName: "Grade 10/A",
  registerClass10BName: "Grade 10/B",
  learnerAmaraEnrolmentId: "60000000-0000-4000-8000-000000000001",
  learnerTomasEnrolmentId: "60000000-0000-4000-8000-000000000002",
  registerBoyLearnerId: "e2e50000-0000-4000-8000-000000000001",
  registerBoyEnrolmentId: "e2e60000-0000-4000-8000-000000000001",
  registerVisualSubmissionId: "e2e70000-0000-4000-8000-000000000001",
  registerVisualAbsenceEventId: "e2e80000-0000-4000-8000-000000000001",
  /** Weekday deliberately overridden to a non-teaching day by the E2E seed. */
  nonTeachingDate: "2026-10-14",
  /** Weekday deliberately forced open as a teaching day by the E2E seed. */
  teachingDate: "2026-10-13",
  /** Weekday forced open for draft-protection tests; never submitted by the suite. */
  draftDate: "2026-10-15",
});

/** Synthetic second tenant used to prove tenant isolation in the browser. */
export const OUTSIDER_TENANT = Object.freeze({
  tenantId: "e2e90000-0000-4000-8000-000000000001",
  tenantName: "ScolaPro E2E Isolation Group",
  schoolId: "e2e90000-0000-4000-8000-000000000002",
  schoolName: "E2E Isolation Secondary School",
});

/**
 * Synthetic authenticated accounts. `role` documents the membership the seed
 * grants; `expectCapture` documents the intended allow/deny outcome for the
 * demo school's register classes.
 */
export const SYNTHETIC_ACCOUNTS = Object.freeze({
  admin: {
    key: "admin",
    userId: "70000000-0000-4000-8000-000000000001",
    email: "local-admin@scolapro.test",
    displayName: "Local School Admin",
    roleKey: "school_admin",
    tenant: "demo",
    membershipId: "70000000-0000-4000-8000-000000000002",
    expectCapture: true,
    reason: "school leadership retains governed capture authority",
  },
  registerTeacher: {
    key: "registerTeacher",
    userId: "e2e00000-0000-4000-8000-000000000001",
    email: "e2e-teacher@scolapro.test",
    displayName: "E2E Register Teacher",
    // A register teacher is a class teacher: `can_record_register_class` accepts
    // class_teacher, and the scoped learner/enrolment read policies only grant a
    // register teacher the roster when the membership is class_teacher.
    roleKey: "class_teacher",
    tenant: "demo",
    staffMemberId: "e2e10000-0000-4000-8000-000000000001",
    membershipId: "e2e20000-0000-4000-8000-000000000001",
    assignmentId: "e2e30000-0000-4000-8000-000000000001",
    expectCapture: true,
    reason: "assigned register teacher of Grade 10/A",
  },
  unassignedTeacher: {
    key: "unassignedTeacher",
    userId: "e2e00000-0000-4000-8000-000000000002",
    email: "e2e-teacher-unassigned@scolapro.test",
    displayName: "E2E Unassigned Teacher",
    roleKey: "teacher",
    tenant: "demo",
    staffMemberId: "e2e10000-0000-4000-8000-000000000002",
    membershipId: "e2e20000-0000-4000-8000-000000000002",
    assignmentId: "e2e30000-0000-4000-8000-000000000002",
    expectCapture: false,
    reason: "teacher with no register-class assignment must not capture",
  },
  hod: {
    key: "hod",
    userId: "e2e00000-0000-4000-8000-000000000003",
    email: "e2e-hod@scolapro.test",
    displayName: "E2E Head of Department",
    roleKey: "hod",
    tenant: "demo",
    staffMemberId: "e2e10000-0000-4000-8000-000000000003",
    membershipId: "e2e20000-0000-4000-8000-000000000003",
    assignmentId: "e2e30000-0000-4000-8000-000000000003",
    expectCapture: false,
    reason: "HOD review authority does not imply register capture after the #1214 narrowing",
  },
  outsider: {
    key: "outsider",
    userId: "e2e00000-0000-4000-8000-000000000004",
    email: "e2e-outsider@scolapro.test",
    displayName: "E2E Isolation Admin",
    roleKey: "school_admin",
    tenant: "isolation",
    membershipId: "e2e20000-0000-4000-8000-000000000004",
    expectCapture: false,
    reason: "a second-tenant administrator must never reach the demo school's registers",
  },
});

export const SYNTHETIC_ACCOUNT_LIST = Object.freeze(Object.values(SYNTHETIC_ACCOUNTS));

/** Password shared by every synthetic account. Local-only; never a production secret. */
export function syntheticPassword(env = process.env) {
  const password = (env.SCOLAPRO_E2E_PASSWORD ?? "").trim();
  if (password.length < 12) {
    throw new Error(
      "Set SCOLAPRO_E2E_PASSWORD to at least 12 characters before seeding or running the E2E suite.",
    );
  }
  return password;
}

export const E2E_EMAILS = Object.freeze(
  Object.fromEntries(SYNTHETIC_ACCOUNT_LIST.map((account) => [account.key, account.email])),
);
