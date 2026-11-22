import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { DEMO, SYNTHETIC_ACCOUNTS, syntheticPassword } from "./support/accounts.mjs";
import { signIn } from "./support/session";
import { localSupabaseStatus } from "./support/local-supabase.mjs";
import { resolveE2EEnvironment } from "./support/env-guard.mjs";
import { mergedProjectEnv } from "../scripts/env-file.mjs";

test("assigned teacher saves and submits a mark, then scoped HOD verifies it", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const target = resolveE2EEnvironment(mergedProjectEnv(process.cwd())).target;
  test.skip(target !== "local", "Assessment mutation is restricted to isolated local Supabase.");

  const status = localSupabaseStatus({ projectRoot: process.cwd() });
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The DB's term-array CHECK helper is callable by authenticated actors,
  // not the service-role REST client. Establish the fixture through the real
  // school-admin identity rather than bypassing database permissions.
  if (!status.ANON_KEY) throw new Error("Local Supabase publishable key is missing.");
  const admin = createClient(status.API_URL, status.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: authError } = await admin.auth.signInWithPassword({
    email: SYNTHETIC_ACCOUNTS.admin.email,
    password: syntheticPassword(),
  });
  expect(authError).toBeNull();

  async function insertAsAdmin(table: string, record: Record<string, unknown>) {
    const { data: existing, error: existingError } = await admin
      .from(table).select("id").eq("id", record.id).maybeSingle();
    if (existingError) throw new Error(`Cannot inspect ${table}: ${existingError.message}`);
    if (existing) return;
    const { error } = await admin.from(table).insert(record);
    if (error) throw new Error(`Cannot configure ${table} as school admin: ${error.message}`);
  }

  const offeringId = "e2eb0000-0000-4000-8000-000000000006";
  const subjectId = "e2ea0000-0000-4000-8000-000000000006";
  await insertAsAdmin("assessment_schemes", {
    id: DEMO.assessmentSchemeId,
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    subject_offering_id: offeringId,
    scheme_key: "E2E_TERM3_MARK_CAPTURE",
    version: "v1",
    capture_mode: "detailed",
    effective_from: "2026-01-05",
    status: "active",
    created_by_user_id: SYNTHETIC_ACCOUNTS.admin.userId,
  });
  await insertAsAdmin("assessment_components", {
    id: DEMO.assessmentComponentId,
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    assessment_scheme_id: DEMO.assessmentSchemeId,
    component_code: "TASK",
    display_name: "E2E Term Three Task",
    component_type: "task",
    raw_max: 100,
    weight: 100,
    contributes_to_report: true,
    required: true,
    sort_order: 1,
  });
  await insertAsAdmin("teacher_allocations", {
    id: DEMO.assessmentTeacherAllocationId,
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    academic_year: 2026,
    subject_offering_id: offeringId,
    register_class_id: DEMO.registerClass10B,
    staff_member_id: SYNTHETIC_ACCOUNTS.registerTeacher.staffMemberId,
    active_from: "2026-01-05",
  });
  await insertAsAdmin("subject_department_responsibilities", {
    id: DEMO.assessmentHodResponsibilityId,
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    subject_id: subjectId,
    department_head_staff_assignment_id: SYNTHETIC_ACCOUNTS.hod.assignmentId,
    department_label: "E2E Science",
    effective_from: "2026-01-05",
    created_by_user_id: SYNTHETIC_ACCOUNTS.admin.userId,
  });

  const { error: registerError } = await admin.rpc("register_learner_subject", {
    p_enrolment_id: DEMO.learnerTomasEnrolmentId,
    p_subject_offering_id: offeringId,
    p_source: "e2e_synthetic",
  });
  expect(registerError).toBeNull();

  await insertAsAdmin("assessment_instances", {
    id: DEMO.assessmentInstanceId,
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    academic_year: 2026,
    assessment_scheme_id: DEMO.assessmentSchemeId,
    assessment_component_id: DEMO.assessmentComponentId,
    subject_offering_id: offeringId,
    register_class_id: DEMO.registerClass10B,
    teacher_allocation_id: DEMO.assessmentTeacherAllocationId,
    term_number: 3,
    display_name: "E2E Term Three Science Task",
    raw_max: 100,
    status: "open",
    created_by_user_id: SYNTHETIC_ACCOUNTS.admin.userId,
  });

  await signIn(page, "registerTeacher");
  await page.goto(`/assessment/marks/${DEMO.assessmentInstanceId}`);
  await expect(page.getByRole("heading", { name: "Mark grid" })).toBeVisible();

  const mark = page.locator('input[aria-label^="Mark for "]');
  await expect(mark).toHaveCount(1);
  await expect(mark).toBeEnabled();
  await mark.fill("76");
  await mark.blur();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await expect.poll(async () => {
    const { data, error } = await service.from("learner_marks_current")
      .select("numeric_mark").eq("assessment_instance_id", DEMO.assessmentInstanceId)
      .eq("enrolment_id", DEMO.learnerTomasEnrolmentId).maybeSingle();
    if (error) throw new Error("Could not inspect synthetic mark");
    return Number(data?.numeric_mark ?? -1);
  }).toBe(76);

  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(page.getByText(/Validation passed: 1 eligible learner complete/)).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText(/Assessment submitted for HOD\/leadership review/)).toBeVisible();

  const hodContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const hodPage = await hodContext.newPage();
    await signIn(hodPage, "hod");
    await hodPage.goto(`/assessment/marks/${DEMO.assessmentInstanceId}`);
    await expect(hodPage.getByRole("heading", { name: "HOD / leadership review" })).toBeVisible();
    await hodPage.getByRole("button", { name: "Verify", exact: true }).click();
    // The review section unmounts on successful revalidation; the transient
    // action-state message is not a durable completion signal.
    await expect.poll(async () => {
      const { data, error } = await service.from("assessment_instances")
        .select("status").eq("id", DEMO.assessmentInstanceId).single();
      if (error) throw new Error("Could not verify assessment status");
      return data?.status;
    }).toBe("verified");
  } finally {
    await hodContext.close();
  }

  const { data: finalInstance, error: finalError } = await service.from("assessment_instances")
    .select("status").eq("id", DEMO.assessmentInstanceId).single();
  expect(finalError).toBeNull();
  expect(finalInstance?.status).toBe("verified");
});
