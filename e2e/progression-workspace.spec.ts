import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { DEMO, SYNTHETIC_ACCOUNTS } from "./support/accounts.mjs";
import { localSupabaseStatus } from "./support/local-supabase.mjs";
import { resolveE2EEnvironment } from "./support/env-guard.mjs";
import { mergedProjectEnv } from "../scripts/env-file.mjs";
import { signIn } from "./support/session";

const target = resolveE2EEnvironment(mergedProjectEnv(process.cwd())).target;
test.skip(target !== "local", "Progression lifecycle acceptance is restricted to isolated local Supabase.");

const NEXT_YEAR = 2027;
const RESULT_SUBJECT_ID = "e2e93000-0000-4000-8000-000000000001";
const RESULT_OFFERING_ID = "e2e94000-0000-4000-8000-000000000001";
const DESTINATION_GRADE_ID = "e2e91000-0000-4000-8000-000000000001";
const DESTINATION_CLASS_ID = "e2e92000-0000-4000-8000-000000000001";

function serviceClient() {
  const local = localSupabaseStatus({ projectRoot: process.cwd() });
  return createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function ensureNextYear(service: ReturnType<typeof serviceClient>) {
  const { error: yearError } = await service.from("academic_years").upsert({
    school_id: DEMO.schoolId,
    tenant_id: DEMO.tenantId,
    year: NEXT_YEAR,
    starts_on: `${NEXT_YEAR}-01-01`,
    ends_on: `${NEXT_YEAR}-12-31`,
    status: "setup",
  }, { onConflict: "school_id,year" });
  expect(yearError).toBeNull();

  const { error: gradeError } = await service.from("grades").upsert({
    id: DESTINATION_GRADE_ID,
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    academic_year: NEXT_YEAR,
    grade_code: "11",
    display_name: "Grade 11",
  }, { onConflict: "id" });
  expect(gradeError).toBeNull();

  const { error: classError } = await service.from("register_classes").upsert({
    id: DESTINATION_CLASS_ID,
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    academic_year: NEXT_YEAR,
    grade_id: DESTINATION_GRADE_ID,
    class_code: "11A",
    display_name: "Grade 11/A",
  }, { onConflict: "id" });
  expect(classError).toBeNull();
}

test("school leadership completes generate, override, approve, lock and publish", async ({ page }) => {
  test.setTimeout(180_000);
  const service = serviceClient();
  await ensureNextYear(service);

  const run = crypto.randomUUID().slice(0, 8);
  const learnerId = crypto.randomUUID();
  const enrolmentId = crypto.randomUUID();
  const ruleSetId = crypto.randomUUID();
  const adminUserId = SYNTHETIC_ACCOUNTS.admin.userId;

  const { error: learnerError } = await service.from("learners").insert({
    id: learnerId,
    tenant_id: DEMO.tenantId,
    first_names: "Progression",
    surname: run.toUpperCase(),
  });
  expect(learnerError).toBeNull();

  const { error: enrolmentError } = await service.from("enrolments").insert({
    id: enrolmentId,
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    learner_id: learnerId,
    academic_year: 2026,
    grade_id: DEMO.gradeTenId,
    register_class_id: DEMO.registerClass10A,
    admission_number: `PROG-${run}`,
    enrolled_from: new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10),
    status: "current",
  });
  expect(enrolmentError).toBeNull();

  // A canonical approved result supplies the engine's evidence term. Create the
  // subject and offering in this spec so it does not depend on QA-only fixtures.
  const { error: subjectError } = await service.from("subjects").upsert({
    id: RESULT_SUBJECT_ID,
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    subject_code: `PROG${run}`,
    display_name: "E2E Progression Evidence",
    status: "active",
  }, { onConflict: "id" });
  expect(subjectError).toBeNull();
  const { error: offeringError } = await service.from("subject_offerings").upsert({
    id: RESULT_OFFERING_ID,
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    academic_year: 2026,
    subject_id: RESULT_SUBJECT_ID,
    grade_id: DEMO.gradeTenId,
    periods_per_cycle: 4,
    status: "active",
  }, { onConflict: "id" });
  expect(offeringError).toBeNull();

  const { error: resultError } = await service.from("official_results").insert({
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    academic_year: 2026,
    enrolment_id: enrolmentId,
    learner_id: learnerId,
    subject_offering_id: RESULT_OFFERING_ID,
    term_number: 1,
    result_value: 82,
    symbol: "A",
    assessment_scheme_key: "E2E_PROGRESSION_FIXTURE",
    assessment_scheme_version: "v1",
    calculation_snapshot: { synthetic_fixture_only: true },
    approved_by_user_id: adminUserId,
  });
  expect(resultError).toBeNull();

  const { error: ruleSetError } = await service.from("promotion_rule_sets").insert({
    id: ruleSetId,
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    academic_year: 2026,
    grade_id: DEMO.gradeTenId,
    rule_set_key: `E2E_PROGRESSION_${run}`,
    version: "v1",
    result_term_number: 1,
    pass_outcome: "promoted",
    fail_outcome: "not_promoted",
    effective_from: "2026-01-01",
    status: "draft",
    created_by_user_id: adminUserId,
  });
  expect(ruleSetError).toBeNull();
  const { error: conditionError } = await service.from("promotion_rule_conditions").insert({
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    promotion_rule_set_id: ruleSetId,
    condition_code: "MIN_AVERAGE",
    condition_type: "minimum_overall_average",
    threshold: 50,
    required: true,
    sort_order: 10,
  });
  expect(conditionError).toBeNull();
  // Conditions are editable only while the version is draft; activate afterwards.
  const { error: activateError } = await service.from("promotion_rule_sets")
    .update({ status: "active" }).eq("id", ruleSetId);
  expect(activateError).toBeNull();

  await signIn(page, "admin");
  await page.goto(`/school/progression?grade=${DEMO.gradeTenId}`);
  await expect(page.getByRole("heading", { name: "Year-end progression" })).toBeVisible();

  // Display formatting title-cases uniform-lowercase words, so anchor on the
  // unformatted admission number instead of the composed display name.
  const row = page.locator("article", { hasText: `PROG-${run}` }).first();
  await expect(row).toBeVisible();

  // Generate
  await row.getByRole("button", { name: "Generate recommendation" }).click();
  await expect(page.getByText("Recommendation generated for review.")).toBeVisible();

  // Reasoned override: promoted into Grade 11.
  await row.getByRole("button", { name: "Override outcome" }).click();
  await row.getByRole("button", { name: "Outcome" }).click();
  await row.getByRole("option", { name: "Promoted" }).click();
  await row.getByRole("button", { name: /Destination grade/ }).click();
  await row.getByRole("option", { name: "11" }).click();
  await row.getByLabel("Reason for override").fill("Synthetic approved promotion");
  await row.getByRole("button", { name: "Save override" }).click();
  await expect(page.getByText("Progression override recorded with its reason.")).toBeVisible();

  // Approve and lock.
  await row.getByRole("button", { name: "Approve decision" }).click();
  await expect(page.getByText("Progression approved.")).toBeVisible();
  await row.getByRole("button", { name: "Lock decision" }).click();
  await expect(page.getByText("Progression locked. It can now be published.")).toBeVisible();

  // Publish to the next year's class with explicit confirmation.
  await row.getByRole("button", { name: /Destination class/ }).click();
  await row.getByRole("option", { name: "Grade 11/A" }).click();
  await row.getByRole("checkbox").check();
  await row.getByRole("button", { name: "Publish rollover" }).click();
  await expect(page.getByText("Rollover published.", { exact: false })).toBeVisible();
  await expect(row.getByText(`Published into ${NEXT_YEAR}`, { exact: false })).toBeVisible();

  // Canonical evidence: source closed, one destination enrolment, append-only receipt.
  const { data: source, error: sourceError } = await service.from("enrolments")
    .select("status,enrolled_to").eq("id", enrolmentId).single();
  expect(sourceError).toBeNull();
  expect(source?.status).toBe("completed");
  const { data: destination, error: destinationError } = await service.from("enrolments")
    .select("id,status,academic_year,grade_id,register_class_id").eq("learner_id", learnerId)
    .eq("academic_year", NEXT_YEAR).maybeSingle();
  expect(destinationError).toBeNull();
  expect(destination?.status).toBe("current");
  expect(destination?.grade_id).toBe(DESTINATION_GRADE_ID);
  expect(destination?.register_class_id).toBe(DESTINATION_CLASS_ID);
  const { data: progression, error: progressionError } = await service.from("year_end_progressions")
    .select("id,status,outcome,destination_grade_code,override_reason").eq("enrolment_id", enrolmentId).single();
  expect(progressionError).toBeNull();
  expect(progression?.status).toBe("locked");
  expect(progression?.outcome).toBe("promoted");
  expect(progression?.destination_grade_code).toBe("11");
  expect(progression?.override_reason).toContain("Synthetic approved promotion");
  const { count: receipts } = await service.from("year_end_progression_publications")
    .select("id", { count: "exact", head: true }).eq("progression_id", progression?.id);
  expect(receipts).toBe(1);
});

test("progression workspace has no horizontal overflow at 390, 768 and 1440 in both themes", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await signIn(page, "admin");
  await page.goto(`/school/progression?grade=${DEMO.gradeTenId}`);
  await expect(page.getByRole("heading", { name: "Year-end progression" })).toBeVisible();
  const surface = page.getByRole("region", { name: "Progression summary" }).locator("..");
  for (const width of [390, 768, 1440]) {
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: 950 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      const overflow = await surface.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
      expect(overflow).toBe(false);
      await testInfo.attach(`progression-${width}-${theme}.png`, { body: await surface.screenshot(), contentType: "image/png" });
    }
  }
});
