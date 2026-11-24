import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { DEMO, SYNTHETIC_ACCOUNTS, OUTSIDER_TENANT } from "./support/accounts.mjs";
import { localSupabaseStatus } from "./support/local-supabase.mjs";
import { signIn } from "./support/session";

// Every write is limited to the loopback-only disposable synthetic E2E world.
const HISTORICAL_GRADE_ID = "f1322000-0000-4000-8000-000000000001";
const HISTORICAL_JOB_ID = "f1322000-0000-4000-8000-000000000002";
const HISTORICAL_LABEL = "Historical Grade 10 · 2025 E2E";

test.describe("admission intake academic-year context (#1322)", () => {
  test.beforeAll(async () => {
    const local = localSupabaseStatus({ projectRoot: process.cwd() });
    const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: gradeError } = await service.from("grades").upsert({
      id: HISTORICAL_GRADE_ID,
      tenant_id: DEMO.tenantId,
      school_id: DEMO.schoolId,
      academic_year: 2025,
      grade_code: "10",
      display_name: HISTORICAL_LABEL,
    }, { onConflict: "id" });
    expect(gradeError).toBeNull();

    const { error: jobError } = await service.from("document_intake_jobs").upsert({
      id: HISTORICAL_JOB_ID,
      tenant_id: DEMO.tenantId,
      school_id: DEMO.schoolId,
      academic_year: 2025,
      intake_type: "admission",
      document_type: "application_form",
      source_kind: "online_form",
      status: "staged",
      extraction_status: "not_required",
      created_by_user_id: SYNTHETIC_ACCOUNTS.admin.userId,
      candidate_payload: { first_names: "Historic", surname: "Synthetic" },
    }, { onConflict: "id" });
    expect(jobError).toBeNull();
  });

  test("school admin sees and persists a grade from the intake job year", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto(`/school/admissions?job=${HISTORICAL_JOB_ID}`);

    await expect(page.getByRole("heading", { name: "Admissions & document intake" })).toBeVisible();
    await expect(page.getByText(`Job ${HISTORICAL_JOB_ID.slice(0, 8)} · 2025`, { exact: false })).toBeVisible();
    const gradePicker = page.getByRole("button", { name: "Intended grade · 2025" });
    await expect(gradePicker).toBeVisible();
    await expect(gradePicker).toContainText("Choose intended grade");
    await gradePicker.click();
    await expect(page.getByRole("option", { name: HISTORICAL_LABEL })).toBeVisible();
    await page.getByRole("option", { name: HISTORICAL_LABEL }).click();

    await page.getByRole("button", { name: "Save candidate for review" }).click();
    await expect(page).toHaveURL(/job=f1322000-0000-4000-8000-000000000002/);
    await expect(page.getByText("Candidate saved. Review possible matches before commit")).toBeVisible();

    const local = localSupabaseStatus({ projectRoot: process.cwd() });
    const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await service.from("document_intake_jobs")
      .select("school_id,academic_year,candidate_payload")
      .eq("id", HISTORICAL_JOB_ID)
      .single();
    expect(error).toBeNull();
    expect(data?.school_id).toBe(DEMO.schoolId);
    expect(data?.academic_year).toBe(2025);
    expect(data?.candidate_payload?.requested_grade_id).toBe(HISTORICAL_GRADE_ID);
  });

  test("another school's admin cannot select a foreign historical job or its grade", async ({ page }) => {
    await signIn(page, "outsider");
    await page.goto(`/school/admissions?job=${HISTORICAL_JOB_ID}`);
    await expect(page.getByRole("heading", { name: "Admissions & document intake" })).toBeVisible();
    await expect(page.getByText("Review staged application", { exact: true })).toHaveCount(0);
    await expect(page.getByText(HISTORICAL_LABEL)).toHaveCount(0);
    await expect(page.getByText(OUTSIDER_TENANT.schoolName).first()).toBeVisible();
  });
});
