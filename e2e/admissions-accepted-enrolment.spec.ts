import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { DEMO, OUTSIDER_TENANT, SYNTHETIC_ACCOUNTS, syntheticPassword } from "./support/accounts.mjs";
import { localSupabaseStatus } from "./support/local-supabase.mjs";
import { signIn } from "./support/session";

// Never rewind an audited, enrolled synthetic application on a repeated local run.
const APPLICATION_ID = randomUUID();
const SURNAME = "AcceptedEnrolmentSynthetic";
const ADMISSION_NUMBER = `E2E-ADM-1326-${APPLICATION_ID.slice(0, 8)}`;

function localService() {
  const local = localSupabaseStatus({ projectRoot: process.cwd() });
  return createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

test.describe("accepted admissions become governed enrolments (#1326)", () => {
  test.beforeAll(async () => {
    const { error } = await localService().from("admission_applications").insert({
      id: APPLICATION_ID,
      tenant_id: DEMO.tenantId,
      school_id: DEMO.schoolId,
      academic_year: 2026,
      requested_grade_id: DEMO.gradeTenId,
      applicant_first_names: "Hana E2E",
      applicant_surname: SURNAME,
      source: "school",
      status: "received",
      decision_note: null,
      submitted_at: new Date().toISOString(),
    });
    expect(error).toBeNull();
  });

  test("school admin accepts an application, selects a matching class and creates precisely one linked learner/enrolment", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/school/admissions");
    const row = page.getByTestId(`admission-application-${APPLICATION_ID}`);
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: "Complete enrolment" })).toHaveCount(0);

    await row.getByRole("button", { name: "Review decision" }).click();
    await row.getByRole("button", { name: "Admission decision" }).click();
    await row.getByRole("option", { name: "Accepted" }).click();
    await row.getByRole("button", { name: "Save decision" }).click();
    await expect(row.getByRole("button", { name: "Complete enrolment" })).toBeVisible();

    await row.getByRole("button", { name: "Complete enrolment" }).click();
    const submit = row.getByRole("button", { name: "Confirm enrolment" });
    await expect(submit).toBeDisabled();
    await row.getByRole("button", { name: "Register class" }).click();
    await row.getByRole("option", { name: DEMO.registerClass10AName }).click();
    await row.getByRole("textbox", { name: "Admission number (optional)" }).fill(ADMISSION_NUMBER);
    await row.getByRole("textbox", { name: "Preferred name (optional)" }).fill("Hana");
    await row.getByRole("button", { name: "Gender" }).click();
    await row.getByRole("option", { name: "Female" }).click();
    await row.getByRole("checkbox").check();
    await expect(submit).toBeEnabled();
    const dateInput = row.locator('input[id^="enrolledFrom-"][id$="-typed"]');
    const isoDate = await row.locator('input[name="enrolledFrom"]').inputValue();
    const [year, month, day] = isoDate.split("-");
    await dateInput.fill("99/99/2026");
    await dateInput.blur();
    await expect(submit).toBeDisabled();
    await expect(row.getByText("Use DD/MM/YYYY, for example 14/05/2010.")).toBeVisible();
    await dateInput.fill(`${day}/${month}/${year}`);
    await dateInput.blur();
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page).toHaveURL(/success=Accepted\+admission\+enrolled/);
    await expect(row.getByText("enrolled", { exact: true })).toBeVisible();
    await expect(row.getByRole("button", { name: "Complete enrolment" })).toHaveCount(0);

    const service = localService();
    const { data: application, error } = await service.from("admission_applications")
      .select("status,learner_id,enrolment_id,school_id,academic_year")
      .eq("id", APPLICATION_ID).single();
    expect(error).toBeNull();
    expect(application?.status).toBe("enrolled");
    expect(application?.learner_id).toBeTruthy();
    expect(application?.enrolment_id).toBeTruthy();
    expect(application?.school_id).toBe(DEMO.schoolId);
    expect(application?.academic_year).toBe(2026);

    const { data: enrolments, error: enrolmentError } = await service.from("enrolments")
      .select("learner_id,grade_id,register_class_id,school_id,academic_year,admission_number")
      .eq("id", application!.enrolment_id!);
    expect(enrolmentError).toBeNull();
    expect(enrolments).toHaveLength(1);
    expect(enrolments?.[0]).toMatchObject({
      learner_id: application?.learner_id,
      grade_id: DEMO.gradeTenId,
      register_class_id: DEMO.registerClass10A,
      school_id: DEMO.schoolId,
      academic_year: 2026,
      admission_number: ADMISSION_NUMBER,
    });

    const { data: learner, error: learnerError } = await service.from("learners")
      .select("preferred_name,sex").eq("id", application!.learner_id!).single();
    expect(learnerError).toBeNull();
    expect(learner).toMatchObject({ preferred_name: "Hana", sex: "female" });

    const client = createClient(localSupabaseStatus({ projectRoot: process.cwd() }).API_URL,
      localSupabaseStatus({ projectRoot: process.cwd() }).SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    const { error: signInError } = await client.auth.signInWithPassword({
      email: SYNTHETIC_ACCOUNTS.admin.email, password: syntheticPassword(),
    });
    expect(signInError).toBeNull();
    const { error: replayError } = await client.rpc("enrol_accepted_admission", {
      p_application_id: APPLICATION_ID,
      p_register_class_id: DEMO.registerClass10A,
      p_admission_number: "E2E-REPLAY-1326",
      p_preferred_name: null,
      p_sex: "female",
      p_enrolled_from: "2026-11-24",
    });
    expect(replayError?.message).toContain("Only accepted admission applications can be enrolled");

    const { count, error: countError } = await service.from("enrolments")
      .select("id", { head: true, count: "exact" })
      .eq("learner_id", application!.learner_id!)
      .eq("school_id", DEMO.schoolId)
      .eq("academic_year", 2026);
    expect(countError).toBeNull();
    expect(count).toBe(1);
  });

  test("other school's admin cannot see or enrol the application", async ({ page }) => {
    await signIn(page, "outsider");
    await page.goto("/school/admissions");
    await expect(page.getByText(OUTSIDER_TENANT.schoolName).first()).toBeVisible();
    await expect(page.getByTestId(`admission-application-${APPLICATION_ID}`)).toHaveCount(0);
  });
});
