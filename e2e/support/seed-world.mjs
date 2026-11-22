// Shared synthetic-world seeding core.
//
// Both the local seed (`scripts/seed-e2e-fixtures.mjs`) and the hosted-staging
// seed (`scripts/seed-staging-fixtures.mjs`) apply the same world through this
// module, so the two environments can never drift apart. It is deliberately
// transport-agnostic: it takes a Supabase client and writes only the
// deterministic fixtures defined in `./accounts.mjs`.
//
// It is idempotent: every write is an upsert keyed on a stable identifier (or a
// fixed composite key), so running it twice leaves the same world.

import { DEMO, OUTSIDER_TENANT, SYNTHETIC_ACCOUNTS } from "./accounts.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Applies the synthetic E2E world to a Supabase client.
 *
 * @param {object} options
 * @param {import("@supabase/supabase-js").SupabaseClient} options.client
 * @param {string} options.password shared synthetic password (>= 12 chars)
 * @param {(message: string) => void} [options.log]
 */
export async function seedSyntheticWorld({ client, password, log = () => {} }) {
  async function upsert(table, row, onConflict = "id") {
    const { error } = await client.from(table).upsert(row, { onConflict });
    if (error) throw new Error(`Failed to seed ${table}: ${error.message}`);
  }

  async function ensureAuthUser({ userId, email, displayName }) {
    const existing = await client.auth.admin.getUserById(userId);
    const result = existing.data?.user
      ? await client.auth.admin.updateUserById(userId, { email, password, email_confirm: true })
      : await client.auth.admin.createUser({ id: userId, email, password, email_confirm: true });
    if (result.error || !result.data?.user) {
      throw new Error(`Unable to seed Auth user ${email}: ${result.error?.message ?? "unknown error"}`);
    }
    await upsert("user_profiles", {
      user_id: userId,
      display_name: displayName,
      preferred_name: displayName,
      must_change_password: false,
    }, "user_id");
  }

  // 1. Confirm the base demo structure exists before layering fixtures on it.
  const { data: demoSchool, error: demoSchoolError } = await client
    .from("schools")
    .select("id,tenant_id,name")
    .eq("id", DEMO.schoolId)
    .maybeSingle();
  assert(
    !demoSchoolError && demoSchool?.tenant_id === DEMO.tenantId,
    "The demo school from supabase/seed.sql is missing. Run `supabase db reset` (or pnpm local:sync-db) first.",
  );

  // 2. Synthetic accounts + profiles.
  for (const account of Object.values(SYNTHETIC_ACCOUNTS)) {
    await ensureAuthUser({
      userId: account.userId,
      email: account.email,
      displayName: account.displayName,
    });
  }

  // Keep both register sex sections populated for document parity checks.
  await upsert("learners", {
    id: DEMO.registerBoyLearnerId,
    tenant_id: DEMO.tenantId,
    first_names: "Synthetic Boy",
    surname: "Register",
    preferred_name: "Synthetic",
    date_of_birth: "2010-06-18",
    sex: "male",
  });
  await upsert("enrolments", {
    id: DEMO.registerBoyEnrolmentId,
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    learner_id: DEMO.registerBoyLearnerId,
    academic_year: 2026,
    grade_id: DEMO.gradeTenId,
    register_class_id: DEMO.registerClass10A,
    admission_number: "E2E-REGISTER-BOY",
    enrolled_from: "2026-01-12",
  });

  // Synthetic guardian for published-report acceptance (#1309).
  // Linking to the local-only E2E learner avoids altering any production roster
  // and provides one deterministic family relationship for browser isolation.
  const guardian = SYNTHETIC_ACCOUNTS.guardian;
  await upsert("guardian_profiles", {
    id: guardian.guardianProfileId,
    tenant_id: DEMO.tenantId,
    first_names: "E2E Linked",
    surname: "Guardian",
    status: "active",
  });
  await upsert("learner_guardians", {
    id: guardian.learnerGuardianId,
    tenant_id: DEMO.tenantId,
    learner_id: DEMO.registerBoyLearnerId,
    guardian_id: guardian.guardianProfileId,
    relationship_type: "parent",
    is_legal_guardian: true,
    effective_from: "2026-01-05",
    effective_to: null,
  });
  // Separate guardian and existing synthetic learner used only for
  // published-read acceptance. This does not create or approve official marks.
  const publishedGuardian = SYNTHETIC_ACCOUNTS.publishedGuardian;
  await upsert("guardian_profiles", {
    id: publishedGuardian.guardianProfileId,
    tenant_id: DEMO.tenantId,
    first_names: "E2E Published",
    surname: "Guardian",
    status: "active",
  });
  await upsert("learner_guardians", {
    id: publishedGuardian.learnerGuardianId,
    tenant_id: DEMO.tenantId,
    learner_id: DEMO.publishedLearnerId,
    guardian_id: publishedGuardian.guardianProfileId,
    relationship_type: "parent",
    is_legal_guardian: true,
    effective_from: "2026-01-05",
    effective_to: null,
  });

  // 3. Isolation tenant + school (never contains learner data).
  await upsert("tenants", { id: OUTSIDER_TENANT.tenantId, name: OUTSIDER_TENANT.tenantName, slug: "e2e-isolation-group" });
  await upsert("schools", {
    id: OUTSIDER_TENANT.schoolId,
    tenant_id: OUTSIDER_TENANT.tenantId,
    name: OUTSIDER_TENANT.schoolName,
    emis_number: "E2EISO001",
    region: "Erongo",
    town: "Swakopmund",
  });

  // 4. Demo-tenant staff identities (linked to the synthetic auth accounts).
  //    Placements are created in step 6, after memberships, because the deferred
  //    placement-creator check needs the demo admin's membership to already exist
  //    (each upsert is its own transaction).
  const demoStaff = [
    { account: SYNTHETIC_ACCOUNTS.registerTeacher, employeeNumber: "E2E-TCH-001", firstName: "E2E", lastName: "Register" },
    { account: SYNTHETIC_ACCOUNTS.unassignedTeacher, employeeNumber: "E2E-TCH-002", firstName: "E2E", lastName: "Unassigned" },
    { account: SYNTHETIC_ACCOUNTS.hod, employeeNumber: "E2E-HOD-001", firstName: "E2E", lastName: "Head" },
  ];

  for (const { account, employeeNumber, firstName, lastName } of demoStaff) {
    await upsert("staff_members", {
      id: account.staffMemberId,
      tenant_id: DEMO.tenantId,
      user_id: account.userId,
      employee_number: employeeNumber,
      first_name: firstName,
      last_name: lastName,
      status: "active",
    });
  }

  // 5. Memberships: demo roles for the demo school, isolation admin for the second tenant.
  for (const account of [
    SYNTHETIC_ACCOUNTS.admin,
    SYNTHETIC_ACCOUNTS.registerTeacher,
    SYNTHETIC_ACCOUNTS.unassignedTeacher,
    SYNTHETIC_ACCOUNTS.hod,
  ]) {
    await upsert("school_memberships", {
      id: account.membershipId,
      tenant_id: DEMO.tenantId,
      school_id: DEMO.schoolId,
      user_id: account.userId,
      staff_member_id: account.staffMemberId ?? null,
      role_key: account.roleKey,
      active_from: "2026-01-05",
      active_to: null,
    });
  }
  await upsert("school_memberships", {
    id: SYNTHETIC_ACCOUNTS.outsider.membershipId,
    tenant_id: OUTSIDER_TENANT.tenantId,
    school_id: OUTSIDER_TENANT.schoolId,
    user_id: SYNTHETIC_ACCOUNTS.outsider.userId,
    staff_member_id: null,
    role_key: SYNTHETIC_ACCOUNTS.outsider.roleKey,
    active_from: "2026-01-05",
    active_to: null,
  });

  // Exercise the complete governed school header using synthetic values only.
  await upsert("school_settings", {
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    setting_key: "document_profile",
    setting_value: {
      former_name: "Synthetic Former School Name",
      physical_address: "123 Synthetic School Road",
      postal_address: "P.O. Box 12345",
      telephone: "+264 64 555 0100",
      fax: "+264 64 555 0101",
      email: "office@synthetic-school.test",
      town: "Swakopmund",
      school_name_font: "old_english",
    },
    updated_by_user_id: SYNTHETIC_ACCOUNTS.admin.userId,
  }, "school_id,setting_key");

  // 6. Staff-school placements, now that the demo admin's membership exists to
  //    satisfy the deferred placement-creator authorization check.
  for (const { account } of demoStaff) {
    await upsert("staff_school_assignments", {
      id: account.assignmentId,
      tenant_id: DEMO.tenantId,
      school_id: DEMO.schoolId,
      staff_member_id: account.staffMemberId,
      assignment_type: "teacher",
      position_title: "Teacher",
      effective_from: "2026-01-05",
      created_by_user_id: SYNTHETIC_ACCOUNTS.admin.userId,
    });
  }

  // Link after school membership is established: the deferred guardian actor
  // integrity trigger requires a current authorized manager of the learner's
  // school. Service-role access alone does not bypass provenance governance.
  await upsert("guardian_user_links", {
    id: guardian.guardianLinkId,
    tenant_id: DEMO.tenantId,
    guardian_id: guardian.guardianProfileId,
    user_id: guardian.userId,
    linked_by_user_id: SYNTHETIC_ACCOUNTS.admin.userId,
  });

  await upsert("guardian_user_links", {
    id: publishedGuardian.guardianLinkId,
    tenant_id: DEMO.tenantId,
    guardian_id: publishedGuardian.guardianProfileId,
    user_id: publishedGuardian.userId,
    linked_by_user_id: SYNTHETIC_ACCOUNTS.admin.userId,
  });

  // A frozen published artifact for *read-path* acceptance only. The lifecycle
  // transition and mark-approval path must be tested separately under #1309.
  // Certified/published snapshots are immutable: never upsert an existing row.
  const { data: publishedExisting, error: publishedReadError } = await client
    .from("report_card_snapshots")
    .select("id")
    .eq("id", DEMO.publishedSnapshotId)
    .maybeSingle();
  if (publishedReadError) throw new Error(`Unable to inspect synthetic published report: ${publishedReadError.message}`);
  if (!publishedExisting) {
    await upsert("report_card_snapshots", {
      id: DEMO.publishedSnapshotId,
      tenant_id: DEMO.tenantId,
      school_id: DEMO.schoolId,
      learner_id: DEMO.publishedLearnerId,
      enrolment_id: DEMO.learnerTomasEnrolmentId,
      academic_year: 2026,
      term_number: 1,
      template_version: "E2E_SYNTHETIC_PUBLISHED_V1",
      snapshot_version: 1,
      data_snapshot: {
        learner: { first_names: "Tomas K.", surname: "Sample", sex: "male" },
        enrolment: { admission_number: "DEMO-002", academic_year: 2026, grade: "Grade 10", register_class: "Grade 10/B" },
        term: { number: 1, name: "Term 1" },
        results: [{
          official_result_id: "synthetic-read-path-only",
          subject_code: "E2E-SCI",
          subject_name: "E2E Published Science",
          result_status: "numeric",
          result_value: 82,
          symbol: "A",
        }],
        attendance: { recorded_school_days: 20, present: 18, absent: 2, late: 0, excused: 0 },
      },
      status: "published",
      generated_by_user_id: SYNTHETIC_ACCOUNTS.admin.userId,
      certified_by_user_id: SYNTHETIC_ACCOUNTS.admin.userId,
      certified_at: "2026-10-20T12:00:00Z",
      published_at: "2026-10-20T12:10:00Z",
    });
  }

  // A certified-only version in the same family must remain private even
  // while the other term's published report is visible in the parent portal.
  const { data: certifiedExisting, error: certifiedReadError } = await client
    .from("report_card_snapshots")
    .select("id")
    .eq("id", DEMO.certifiedOnlySnapshotId)
    .maybeSingle();
  if (certifiedReadError) throw new Error(`Unable to inspect certified-only report: ${certifiedReadError.message}`);
  if (!certifiedExisting) {
    await upsert("report_card_snapshots", {
      id: DEMO.certifiedOnlySnapshotId,
      tenant_id: DEMO.tenantId,
      school_id: DEMO.schoolId,
      learner_id: DEMO.publishedLearnerId,
      enrolment_id: DEMO.learnerTomasEnrolmentId,
      academic_year: 2026,
      term_number: 2,
      template_version: "E2E_SYNTHETIC_CERTIFIED_V1",
      snapshot_version: 1,
      data_snapshot: {
        learner: { first_names: "Tomas K.", surname: "Sample", sex: "male" },
        enrolment: { admission_number: "DEMO-002", academic_year: 2026, grade: "Grade 10", register_class: "Grade 10/B" },
        term: { number: 2, name: "Term 2" },
        results: [{
          official_result_id: "synthetic-private-read-path-only",
          subject_code: "E2E-PRIVATE",
          subject_name: "E2E Confidential Science",
          result_status: "numeric",
          result_value: 13,
          symbol: "E",
        }],
        attendance: { recorded_school_days: 10, present: 7, absent: 3 },
      },
      status: "certified",
      generated_by_user_id: SYNTHETIC_ACCOUNTS.admin.userId,
      certified_by_user_id: SYNTHETIC_ACCOUNTS.admin.userId,
      certified_at: "2026-10-20T12:00:00Z",
    });
  }

  // 7. Bind Grade 10/A to the register teacher so allow/deny is meaningful.
  const { error: bindError } = await client
    .from("register_classes")
    .update({ register_teacher_staff_id: SYNTHETIC_ACCOUNTS.registerTeacher.staffMemberId })
    .eq("id", DEMO.registerClass10A);
  if (bindError) throw new Error(`Unable to assign the register teacher: ${bindError.message}`);

  // 8. Deterministic governed days, so capture and calendar assertions never
  //    depend on the real 2026 calendar or the day the suite happens to run.
  await upsert("school_day_overrides", {
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    school_date: DEMO.teachingDate,
    is_school_day: true,
    teaching_impact: "NORMAL",
    reason: "E2E synthetic teaching day",
    source: "school",
    created_by_user_id: SYNTHETIC_ACCOUNTS.admin.userId,
  }, "school_id,school_date");

  const { data: sickReason, error: sickReasonError } = await client
    .from("attendance_reasons")
    .select("id")
    .eq("reason_code", "sick")
    .single();
  assert(!sickReasonError && sickReason?.id, "Synthetic reasoned-absence reason is unavailable.");

  await upsert("attendance_register_submissions", {
    id: DEMO.registerVisualSubmissionId,
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    academic_year: 2026,
    register_class_id: DEMO.registerClass10A,
    attendance_date: "2026-10-12",
    default_status: "present",
    note: "Synthetic register visual acceptance",
    recorded_by_user_id: SYNTHETIC_ACCOUNTS.admin.userId,
    recorded_at: "2026-10-12T08:00:00Z",
    source: "import",
  });

  await upsert("attendance_events", {
    id: DEMO.registerVisualAbsenceEventId,
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    academic_year: 2026,
    learner_id: DEMO.registerBoyLearnerId,
    enrolment_id: DEMO.registerBoyEnrolmentId,
    register_class_id: DEMO.registerClass10A,
    attendance_date: "2026-10-12",
    observation_type: "daily_register",
    status: "absent",
    reason_id: sickReason.id,
    note: "Synthetic reason supplied",
    recorded_by_user_id: SYNTHETIC_ACCOUNTS.admin.userId,
    recorded_at: "2026-10-12T08:00:00Z",
    source: "import",
    register_submission_id: DEMO.registerVisualSubmissionId,
  });

  await upsert("school_day_overrides", {
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    school_date: DEMO.nonTeachingDate,
    is_school_day: false,
    teaching_impact: "NO_TEACHING",
    reason: "E2E synthetic non-teaching day",
    source: "school",
    created_by_user_id: SYNTHETIC_ACCOUNTS.admin.userId,
  }, "school_id,school_date");

  await upsert("school_day_overrides", {
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    school_date: DEMO.draftDate,
    is_school_day: true,
    teaching_impact: "NORMAL",
    reason: "E2E synthetic draft-protection day",
    source: "school",
    created_by_user_id: SYNTHETIC_ACCOUNTS.admin.userId,
  }, "school_id,school_date");

  // 9. Prove the world is what we think it is.
  const { data: boundClass, error: boundError } = await client
    .from("register_classes")
    .select("id,register_teacher_staff_id")
    .eq("id", DEMO.registerClass10A)
    .maybeSingle();
  assert(
    !boundError && boundClass?.register_teacher_staff_id === SYNTHETIC_ACCOUNTS.registerTeacher.staffMemberId,
    "Grade 10/A register teacher binding did not persist.",
  );

  const { count: outsiderLearners } = await client
    .from("learners")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", OUTSIDER_TENANT.tenantId);
  assert((outsiderLearners ?? 0) === 0, "The isolation tenant must never contain learner data.");

  log("Synthetic E2E world is ready:");
  for (const account of Object.values(SYNTHETIC_ACCOUNTS)) {
    log(`  - ${account.roleKey.padEnd(14)} ${account.email} (capture: ${account.expectCapture ? "allow" : "deny"})`);
  }
}
