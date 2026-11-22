import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { DEMO, SYNTHETIC_ACCOUNTS } from "./support/accounts.mjs";
import { localSupabaseStatus } from "./support/local-supabase.mjs";
import { resolveE2EEnvironment } from "./support/env-guard.mjs";
import { mergedProjectEnv } from "../scripts/env-file.mjs";
import { signIn } from "./support/session";

const ids = {
  subject: "e2f10000-0000-4000-8000-000000000001",
  offering: "e2f20000-0000-4000-8000-000000000001",
  scheme: "e2f30000-0000-4000-8000-000000000001",
  component: "e2f40000-0000-4000-8000-000000000001",
  allocation: "e2f50000-0000-4000-8000-000000000001",
  instance: "e2f60000-0000-4000-8000-000000000001",
  registration: "e2f70000-0000-4000-8000-000000000001",
  scale: "e2f80000-0000-4000-8000-000000000001",
  band: "e2f90000-0000-4000-8000-000000000001",
  hodResponsibility: "e2fa0000-0000-4000-8000-000000000001",
};

test("assigned teacher mark, portfolio HOD verification and school-managed official approval", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const environment = resolveE2EEnvironment(mergedProjectEnv(process.cwd()));
  test.skip(environment.target !== "local", "Governed mark lifecycle changes require disposable local Supabase.");

  const local = localSupabaseStatus({ projectRoot: process.cwd() });
  const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const core = { tenant_id: DEMO.tenantId, school_id: DEMO.schoolId };
  const adminId = SYNTHETIC_ACCOUNTS.admin.userId;
  async function seed(table: string, row: Record<string, unknown>) {
    const { error } = await service.from(table).upsert(row);
    if (error) throw new Error(`Synthetic ${table} fixture rejected: ${error.message}`);
  }

  // Local-only synthetic curriculum and grading scale. Never national defaults.
  await seed("subjects", { id: ids.subject, ...core, subject_code: "E2E-APP", display_name: "E2E Approval Science", status: "active" });
  await seed("subject_offerings", { id: ids.offering, ...core, academic_year: 2026, subject_id: ids.subject, grade_id: DEMO.gradeTenId, periods_per_cycle: 4, status: "active" });
  await seed("assessment_schemes", { id: ids.scheme, ...core, subject_offering_id: ids.offering, scheme_key: "E2E-APP", version: "v1", capture_mode: "detailed", effective_from: "2026-01-05", status: "active", created_by_user_id: adminId });
  await seed("assessment_components", { id: ids.component, ...core, assessment_scheme_id: ids.scheme, component_code: "TASK", display_name: "E2E Approval Task", component_type: "task", raw_max: 100, weight: 100, required: true, contributes_to_report: true, sort_order: 1 });
  await seed("teacher_allocations", { id: ids.allocation, ...core, academic_year: 2026, subject_offering_id: ids.offering, register_class_id: DEMO.registerClass10B, staff_member_id: SYNTHETIC_ACCOUNTS.registerTeacher.staffMemberId, active_from: "2026-01-05" });
  await seed("learner_subject_registrations", { id: ids.registration, ...core, academic_year: 2026, enrolment_id: DEMO.learnerTomasEnrolmentId, learner_id: "50000000-0000-4000-8000-000000000002", subject_offering_id: ids.offering, status: "active", source: "test", registered_by_user_id: adminId });
  await seed("assessment_instances", { id: ids.instance, ...core, academic_year: 2026, assessment_scheme_id: ids.scheme, assessment_component_id: ids.component, subject_offering_id: ids.offering, register_class_id: DEMO.registerClass10B, teacher_allocation_id: ids.allocation, term_number: 1, display_name: "E2E Approval Task", raw_max: 100, status: "open", created_by_user_id: adminId });
  await seed("subject_department_responsibilities", { id: ids.hodResponsibility, ...core, subject_id: ids.subject, department_head_staff_assignment_id: SYNTHETIC_ACCOUNTS.hod.assignmentId, effective_from: "2026-01-05", created_by_user_id: adminId });
  await seed("grading_scales", { id: ids.scale, ...core, scale_key: "E2E-ONLY", version: "v1", display_name: "E2E Synthetic Approval Scale", effective_from: "2026-01-05", status: "active", created_by_user_id: adminId });
  await seed("grading_scale_bands", { id: ids.band, ...core, grading_scale_id: ids.scale, minimum_value: 0, maximum_value: 100, symbol: "A", sort_order: 1 });

  await signIn(page, "registerTeacher");
  await page.goto(`/assessment/marks/${ids.instance}`);
  await expect(page.getByRole("heading", { name: "Mark grid" })).toBeVisible();
  const mark = page.getByRole("textbox", { name: "Mark for Sample, Tomas" });
  await expect(mark).toBeEnabled();
  await mark.fill("82");
  await mark.blur();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Assessment submitted", { exact: false })).toBeVisible();

  const baseURL = new URL(page.url()).origin;
  const hodContext = await browser.newContext({ baseURL });
  const adminContext = await browser.newContext({ baseURL });
  try {
    const hodPage = await hodContext.newPage();
    await signIn(hodPage, "hod");
    await hodPage.goto(`/assessment/marks/${ids.instance}`);
    await expect(hodPage.getByRole("heading", { name: "HOD / leadership review" })).toBeVisible();
    await hodPage.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(hodPage.getByText("verified", { exact: false }).first()).toBeVisible();

    const adminPage = await adminContext.newPage();
    await signIn(adminPage, "admin");
    await adminPage.goto(`/assessment/results?offering=${ids.offering}&scheme=${ids.scheme}&class=${DEMO.registerClass10B}&term=1`);
    await expect(adminPage.getByRole("heading", { name: "Official result approval" })).toBeVisible();
    await expect(adminPage.getByText("Verified — learner completeness checked on approval")).toBeVisible();
    await adminPage.getByRole("button", { name: "Grading scale and version" }).click();
    await adminPage.getByRole("option", { name: /E2E Synthetic Approval Scale/ }).click();
    await adminPage.getByLabel("I confirm these verified results may become official and locked").check();
    await adminPage.getByRole("button", { name: "Approve result" }).click();
    await expect(adminPage.getByText("Official subject result approved and locked.", { exact: false })).toBeVisible();

    const { data: result, error } = await service.from("official_results_current")
      .select("result_value,symbol").eq("enrolment_id", DEMO.learnerTomasEnrolmentId)
      .eq("subject_offering_id", ids.offering).eq("term_number", 1).single();
    expect(error).toBeNull();
    expect(Number(result?.result_value)).toBe(82);
    expect(result?.symbol).toBe("A");
  } finally {
    await Promise.all([hodContext.close(), adminContext.close()]);
  }
});
