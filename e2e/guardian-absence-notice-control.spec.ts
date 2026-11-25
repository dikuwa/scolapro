import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { DEMO, SYNTHETIC_ACCOUNTS } from "./support/accounts.mjs";
import { localSupabaseStatus } from "./support/local-supabase.mjs";
import { resolveE2EEnvironment } from "./support/env-guard.mjs";
import { mergedProjectEnv } from "../scripts/env-file.mjs";
import { signIn } from "./support/session";

const target = resolveE2EEnvironment(mergedProjectEnv(process.cwd())).target;
test.skip(target !== "local", "Guardian notice acceptance is restricted to isolated local Supabase.");

function serviceClient() {
  const local = localSupabaseStatus({ projectRoot: process.cwd() });
  return createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const GUARDIAN_ACCOUNT = Object.freeze({
  userId: "e2e00000-0000-4000-8000-0000000000c1",
  email: "e2e-absence-guardian@scolapro.test",
  password: process.env.SCOLAPRO_E2E_PASSWORD ?? "",
  guardianProfileId: "e2e10000-0000-4000-8000-0000000000c1",
  learnerGuardianId: "e2e20000-0000-4000-8000-0000000000c1",
  guardianLinkId: "e2e30000-0000-4000-8000-0000000000c1",
});

/**
 * This spec seeds its own guardian so it never depends on QA-only fixtures.
 * The account is local-only and uses the shared synthetic password.
 */
async function ensureGuardian(service: ReturnType<typeof serviceClient>) {
  const existing = await service.auth.admin.getUserById(GUARDIAN_ACCOUNT.userId);
  const authResult = existing.data?.user
    ? await service.auth.admin.updateUserById(GUARDIAN_ACCOUNT.userId, {
      email: GUARDIAN_ACCOUNT.email,
      password: GUARDIAN_ACCOUNT.password,
      email_confirm: true,
    })
    : await service.auth.admin.createUser({
      id: GUARDIAN_ACCOUNT.userId,
      email: GUARDIAN_ACCOUNT.email,
      password: GUARDIAN_ACCOUNT.password,
      email_confirm: true,
    });
  expect(authResult.error).toBeNull();

  // `must_change_password: true` routes the signed-in account to the governed
  // security-cleared workspace instead of the parent portal, so the profile must
  // be cleared exactly as the shared seed does for its synthetic accounts.
  const { error: profileError } = await service.from("user_profiles").upsert({
    user_id: GUARDIAN_ACCOUNT.userId,
    display_name: "E2E Absence Guardian",
    preferred_name: "E2E Absence Guardian",
    must_change_password: false,
    password_rotation_expires_at: null,
  }, { onConflict: "user_id" });
  expect(profileError).toBeNull();

  const { error: guardianProfileError } = await service.from("guardian_profiles").upsert({
    id: GUARDIAN_ACCOUNT.guardianProfileId,
    tenant_id: DEMO.tenantId,
    first_names: "E2E",
    surname: "Absence Guardian",
  }, { onConflict: "id" });
  expect(guardianProfileError).toBeNull();

  const { error: relationshipError } = await service.from("learner_guardians").upsert({
    id: GUARDIAN_ACCOUNT.learnerGuardianId,
    tenant_id: DEMO.tenantId,
    learner_id: DEMO.registerBoyLearnerId,
    guardian_id: GUARDIAN_ACCOUNT.guardianProfileId,
    priority: 1,
    effective_from: "2020-01-01",
  }, { onConflict: "id" });
  expect(relationshipError).toBeNull();

  const { error: linkError } = await service.from("guardian_user_links").upsert({
    id: GUARDIAN_ACCOUNT.guardianLinkId,
    tenant_id: DEMO.tenantId,
    guardian_id: GUARDIAN_ACCOUNT.guardianProfileId,
    user_id: GUARDIAN_ACCOUNT.userId,
    linked_by_user_id: SYNTHETIC_ACCOUNTS.admin.userId,
  }, { onConflict: "id" });
  expect(linkError).toBeNull();
}

async function signInGuardian(page: import("@playwright/test").Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(GUARDIAN_ACCOUNT.email);
  await page.locator("#password").fill(GUARDIAN_ACCOUNT.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function resetNotices(service: ReturnType<typeof serviceClient>) {
  // Deleting the notice cascades its attachments and events. Events are
  // append-only for direct deletes but yield to the FK cascade.
  const { error } = await service.from("guardian_absence_notices").delete().eq("learner_id", DEMO.registerBoyLearnerId);
  expect(error).toBeNull();
}

test("guardian submits evidence, reviewer returns it, guardian resubmits and reviewer accepts", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const service = serviceClient();
  await resetNotices(service);
  const run = crypto.randomUUID().slice(0, 8);
  const noteText = `E2E guardian acceptance ${run}`;

  // Guardian submits with a supporting document.
  await ensureGuardian(service);
  await signInGuardian(page);
  await page.goto("/parent");
  await expect(page.getByRole("heading", { name: "Absence notice history" })).toBeVisible();
  await page.getByRole("button", { name: "Reason", exact: true }).click();
  await page.getByRole("option", { name: "Illness" }).click();
  await page.locator("#absence-message").fill(noteText);
  await page.locator("#absence-file").setInputFiles({
    name: `evidence-${run}.pdf`,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% synthetic evidence\n%%EOF"),
  });
  await page.getByRole("button", { name: "Submit absence notice" }).click();
  await expect(page.getByText("supporting document submitted", { exact: false })).toBeVisible();
  // The action reports success without a client refresh, so reload to read the
  // server-rendered history (same pattern the product uses after a save).
  await page.reload();
  await expect(page.getByText(noteText)).toBeVisible();
  const evidenceLink = page.getByRole("link", { name: `evidence-${run}.pdf` });
  await expect(evidenceLink).toBeVisible();
  const evidenceHref = await evidenceLink.getAttribute("href");
  expect(evidenceHref).toContain("/api/guardian-absence-evidence/");
  const evidenceResponse = await page.request.get(evidenceHref ?? "");
  expect(evidenceResponse.status()).toBe(200);

  // Reviewer starts and returns the notice.
  const adminContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const adminPage = await adminContext.newPage();
  try {
    await signIn(adminPage, "admin");
    await adminPage.goto("/school/absence-reviews");
    await expect(adminPage.getByRole("heading", { name: "Absence reviews" })).toBeVisible();
    await adminPage.getByRole("button", { name: "Start review" }).first().click();
    await expect(adminPage.getByText("Notice under_review.")).toBeVisible();
    await adminPage.locator('input[name="reviewNote"]').first().fill("Please provide appointment evidence.");
    await adminPage.getByRole("button", { name: "Return" }).first().click();
    await expect(adminPage.getByText("Notice returned.")).toBeVisible();
  } finally {
    await adminContext.close();
  }

  // Guardian resubmits with a corrected reason.
  await page.reload();
  await expect(page.getByText("Please provide appointment evidence.")).toBeVisible();
  await page.getByRole("button", { name: "Edit and resubmit" }).click();
  const resubmitForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Resubmit for review" }) });
  await resubmitForm.getByRole("button", { name: "Reason", exact: true }).click();
  await page.getByRole("option", { name: "Medical appointment" }).click();
  await resubmitForm.locator('textarea[name="message"]').fill(`${noteText} — appointment letter attached`);
  await resubmitForm.getByRole("button", { name: "Resubmit for review" }).click();
  await expect(page.getByText("Absence notice resubmitted for review.")).toBeVisible();
  await expect(page.getByText("Notice history")).toBeVisible();

  // Reviewer accepts the corrected notice.
  const reviewerContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const reviewerPage = await reviewerContext.newPage();
  try {
    await signIn(reviewerPage, "admin");
    await reviewerPage.goto("/school/absence-reviews");
    await reviewerPage.locator('input[name="reviewNote"]').first().fill("Accepted after appointment evidence.");
    await reviewerPage.getByRole("button", { name: "Accept" }).first().click();
    await expect(reviewerPage.getByText("Notice accepted.")).toBeVisible();
    await expect(reviewerPage.getByText("Notice history ·", { exact: false }).first()).toBeVisible();
  } finally {
    await reviewerContext.close();
  }

  await page.reload();
  await page.getByText(noteText, { exact: false }).first().scrollIntoViewIfNeeded();
  await expect(page.getByText("Accepted after appointment evidence.")).toBeVisible();
  await expect(page.getByText("accepted", { exact: false }).first()).toBeVisible();
});

test("guardian withdraws a notice and the school can no longer review it", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const service = serviceClient();
  await resetNotices(service);
  const run = crypto.randomUUID().slice(0, 8);
  const noteText = `E2E withdrawal ${run}`;

  await ensureGuardian(service);
  await signInGuardian(page);
  await page.goto("/parent");
  await page.locator("#absence-message").fill(noteText);
  await page.getByRole("button", { name: "Submit absence notice" }).click();
  await expect(page.getByText("Absence notice submitted. The school will review it.")).toBeVisible();
  await page.reload();
  await expect(page.getByText(noteText)).toBeVisible();

  await page.getByRole("button", { name: "Withdraw notice" }).first().click();
  const dialog = page.getByRole("alertdialog", { name: "Confirm destructive action" });
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: "Yes, continue" }).click();
  }
  await expect(page.getByText("Absence notice withdrawn.", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByText("withdrawn", { exact: false }).first()).toBeVisible();

  const adminContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const adminPage = await adminContext.newPage();
  try {
    await signIn(adminPage, "admin");
    await adminPage.goto("/school/absence-reviews");
    await expect(adminPage.getByText(noteText)).toBeVisible();
    await expect(adminPage.getByText("withdrawn", { exact: false }).first()).toBeVisible();
    await expect(adminPage.getByRole("button", { name: "Accept" })).toHaveCount(0);
    await expect(adminPage.getByRole("button", { name: "Start review" })).toHaveCount(0);
  } finally {
    await adminContext.close();
  }
});

test("review queue paginates over the date-overlapping set", async ({ page }) => {
  test.setTimeout(120_000);
  const service = serviceClient();
  await resetNotices(service);

  await ensureGuardian(service);
  const guardianUserId = GUARDIAN_ACCOUNT.userId;
  const { data: link, error: linkError } = await service.from("guardian_user_links")
    .select("guardian_id").eq("user_id", guardianUserId).single();
  expect(linkError).toBeNull();
  const { data: enrolment, error: enrolmentError } = await service.from("enrolments")
    .select("id").eq("learner_id", DEMO.registerBoyLearnerId).eq("status", "current").single();
  expect(enrolmentError).toBeNull();
  const guardianId = link?.guardian_id;
  const enrolmentId = enrolment?.id;
  expect(guardianId).toBeTruthy();
  expect(enrolmentId).toBeTruthy();
  if (!guardianId || !enrolmentId) throw new Error("Guardian pagination fixture is incomplete.");

  const today = new Date();
  const rows = Array.from({ length: 55 }, (_, index) => {
    const date = new Date(today.getTime() - (index + 1) * 86_400_000).toISOString().slice(0, 10);
    return {
      tenant_id: DEMO.tenantId,
      school_id: DEMO.schoolId,
      learner_id: DEMO.registerBoyLearnerId,
      enrolment_id: enrolmentId,
      guardian_id: guardianId,
      submitted_by_user_id: guardianUserId,
      absence_from: date,
      absence_to: date,
      reason_category: "other",
      message: `Pagination fixture ${index + 1}`,
      status: "submitted",
    };
  });
  const { error: insertError } = await service.from("guardian_absence_notices").insert(rows);
  expect(insertError).toBeNull();

  await signIn(page, "admin");
  const from = new Date(today.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);
  await page.goto(`/school/absence-reviews?from=${from}&to=${new Date(today).toISOString().slice(0, 10)}`);
  await expect(page.getByRole("link", { name: "Older notices" })).toBeVisible();
  expect(await page.getByRole("button", { name: "Start review" }).count()).toBe(50);
  await page.getByRole("link", { name: "Older notices" }).click();
  await expect(page.getByText("Page 2")).toBeVisible();
  await expect(page.getByRole("link", { name: "Newer notices" })).toBeVisible();
  expect(await page.getByRole("button", { name: "Start review" }).count()).toBe(5);
});

test("guardian evidence and review surfaces have no horizontal overflow at 390, 768 and 1440 in both themes", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const service = serviceClient();
  await resetNotices(service);
  await ensureGuardian(service);
  await signInGuardian(page);
  await page.goto("/parent");
  await page.locator("#absence-message").fill(`Visual acceptance ${crypto.randomUUID().slice(0, 6)}`);
  await page.getByRole("button", { name: "Submit absence notice" }).click();
  await expect(page.getByText("Absence notice submitted.")).toBeVisible();
  await page.reload();
  const history = page.locator("section").filter({ hasText: "Absence notice history" }).first();
  for (const width of [390, 768, 1440]) {
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: 950 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      const overflow = await history.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
      expect(overflow).toBe(false);
      await testInfo.attach(`guardian-history-${width}-${theme}.png`, { body: await history.screenshot(), contentType: "image/png" });
    }
  }
  await signIn(page, "admin");
  await page.goto("/school/absence-reviews");
  const list = page.locator("section").filter({ hasText: "Absence notices" }).first();
  for (const width of [390, 768, 1440]) {
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: 950 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      const overflow = await list.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
      expect(overflow).toBe(false);
      await testInfo.attach(`absence-review-${width}-${theme}.png`, { body: await list.screenshot(), contentType: "image/png" });
    }
  }
});
