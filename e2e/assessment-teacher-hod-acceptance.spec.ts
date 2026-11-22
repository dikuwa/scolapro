import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { DEMO } from "./support/accounts.mjs";
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
    await expect(hodPage.getByText(/Marks verified/)).toBeVisible();
  } finally {
    await hodContext.close();
  }

  const { data: finalInstance, error: finalError } = await service.from("assessment_instances")
    .select("status").eq("id", DEMO.assessmentInstanceId).single();
  expect(finalError).toBeNull();
  expect(finalInstance?.status).toBe("verified");
});
