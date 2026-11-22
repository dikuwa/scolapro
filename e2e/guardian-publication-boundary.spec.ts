import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { DEMO, SYNTHETIC_ACCOUNTS } from "./support/accounts.mjs";
import { localSupabaseStatus } from "./support/local-supabase.mjs";
import { resolveE2EEnvironment } from "./support/env-guard.mjs";
import { mergedProjectEnv } from "../scripts/env-file.mjs";
import { signIn } from "./support/session";

// #1309 Wave A: establish a real authenticated guardian and an effective,
// synthetic learner relationship. The later publication E2E slice will
// generate and certify an official report for this same learner.
test("linked guardian sees their own learner but no unpublished results", async ({ page }) => {
  await signIn(page, "guardian");
  await page.goto("/parent");
  await expect(page.getByRole("heading", { name: "My children" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Latest published results" })).toBeVisible();
  await expect(page.getByText("No published report results are available yet.")).toBeVisible();
  await expect(page.getByText("Connect your guardian profile")).toHaveCount(0);
  await expect(page.getByText("E2E Isolation Secondary School")).toHaveCount(0);
  await expect(page.getByText("Namib High School", { exact: true }).first()).toBeVisible();
});

test("unlinked outsider cannot view synthetic guardian's learner through parent portal", async ({ page }) => {
  await signIn(page, "outsider");
  await page.goto("/parent");
  // The outsider has no effective guardian_user_links to any demo learner.
  // A role redirect or the empty family state is acceptable, but no learner
  // name or demo school identity may be rendered from the parent's read model.
  await expect(page.getByText("Synthetic Boy", { exact: false })).toHaveCount(0);
  await expect(page.getByText("E2E Linked Guardian", { exact: false })).toHaveCount(0);
});

test("ending a guardian relationship immediately removes family and report access", async ({ page }) => {
  const target = resolveE2EEnvironment(mergedProjectEnv(process.cwd())).target;
  test.skip(target !== "local", "Mutable family fixture is restricted to isolated local Supabase.");

  const status = localSupabaseStatus({ projectRoot: process.cwd() });
  const client = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const relationshipId = SYNTHETIC_ACCOUNTS.guardian.learnerGuardianId;
  const { data: original, error: readError } = await client.from("learner_guardians")
    .select("id,effective_to").eq("id", relationshipId).eq("learner_id", DEMO.registerBoyLearnerId).single();
  expect(readError).toBeNull();
  expect(original?.id).toBe(relationshipId);
  const endedOn = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);

  try {
    const { data, error } = await client.from("learner_guardians").update({ effective_to: endedOn })
      .eq("id", relationshipId).eq("learner_id", DEMO.registerBoyLearnerId).select("id").single();
    expect(error).toBeNull();
    expect(data?.id).toBe(relationshipId);

    await signIn(page, "guardian");
    await page.goto("/parent");
    await expect(page.getByRole("heading", { name: "Connect your guardian profile" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Latest published results" })).toHaveCount(0);
    await expect(page.getByText("Synthetic Boy", { exact: false })).toHaveCount(0);
  } finally {
    const { data, error } = await client.from("learner_guardians")
      .update({ effective_to: original?.effective_to ?? null })
      .eq("id", relationshipId).eq("learner_id", DEMO.registerBoyLearnerId).select("id").single();
    expect(error).toBeNull();
    expect(data?.id).toBe(relationshipId);
  }
});

test("guardian cannot enter school report-card management", async ({ page }) => {
  await signIn(page, "guardian");
  await page.goto("/reports/report-cards");
  await expect(page).not.toHaveURL(/\/reports\/report-cards(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Report cards" })).toHaveCount(0);
});

test("HOD report-card access stays read-only without certification or publication", async ({ page }) => {
  await signIn(page, "hod");
  await page.goto("/reports/report-cards");
  await expect(page.getByRole("heading", { name: "Report cards" })).toBeVisible();
  await expect(page.getByText("Generation, certification, publishing and printing remain with School Administration and school management.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Certify" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);
});

test("published guardian sees one frozen result but not a certified-only term", async ({ page }) => {
  await signIn(page, "publishedGuardian");
  await page.goto("/parent");

  await expect(page.getByRole("heading", { name: "My children" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Latest published results" })).toBeVisible();
  await expect(page.getByText("E2E Published Science", { exact: true })).toBeVisible();
  await expect(page.getByText("82", { exact: true })).toBeVisible();
  await expect(page.getByText("E2E Confidential Science", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Synthetic Boy", { exact: false })).toHaveCount(0);
  await expect(page.getByText("E2E Isolation Secondary School")).toHaveCount(0);
});

test("school admin publishes certified report and linked guardian receives the official snapshot", async ({ page, browser }) => {
  // This modifies only the disposable local E2E school. Publication is an
  // irreversible governed action, so no test cleanup may unpublish history.
  const target = resolveE2EEnvironment(mergedProjectEnv(process.cwd())).target;
  test.skip(target !== "local", "Publication lifecycle is restricted to isolated local Supabase.");

  await signIn(page, "admin");
  await page.goto(`/reports/report-cards?individual=${DEMO.learnerTomasEnrolmentId}&term=2`);
  await expect(page.getByRole("heading", { name: "Report cards" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Report card published.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);

  const guardianContext = await browser.newContext();
  try {
    const guardianPage = await guardianContext.newPage();
    await signIn(guardianPage, "publishedGuardian");
    await guardianPage.goto("/parent");
    await expect(guardianPage.getByRole("heading", { name: "Latest published results" })).toBeVisible();
    await expect(guardianPage.getByText("E2E Confidential Science", { exact: true })).toBeVisible();
    await expect(guardianPage.getByText("13", { exact: true })).toBeVisible();
    await expect(guardianPage.getByText("Synthetic Boy", { exact: false })).toHaveCount(0);
  } finally {
    await guardianContext.close();
  }
});
