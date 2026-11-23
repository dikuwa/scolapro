import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { DEMO } from "./support/accounts.mjs";
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
  const dbUrl = new URL(local.DB_URL);
  expect(["127.0.0.1", "localhost", "::1"]).toContain(dbUrl.hostname);
  // Trusted fixture setup uses the disposable local database owner, not an
  // application/service-role grant to private SQL validators. All user
  // operations below still execute through authenticated school roles.
  execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-f",
    resolve(process.cwd(), "e2e/support/official-result-approval-local-fixture.sql")], {
    cwd: process.cwd(),
    stdio: "pipe",
    env: {
      ...process.env,
      PGHOST: dbUrl.hostname,
      PGPORT: dbUrl.port,
      PGDATABASE: dbUrl.pathname.slice(1),
      PGUSER: decodeURIComponent(dbUrl.username),
      PGPASSWORD: decodeURIComponent(dbUrl.password),
    },
  });

  await signIn(page, "registerTeacher");
  await page.goto(`/assessment/marks/${ids.instance}`);
  await expect(page.getByRole("heading", { name: "Mark grid" }).first()).toBeVisible();
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
    // The review form unmounts on revalidation after verification; assert
    // the durable DB transition instead of an ephemeral action-state message.
    await expect.poll(async () => {
      const { data, error } = await service.from("assessment_instances")
        .select("status").eq("id", ids.instance).single();
      if (error) throw new Error("Could not inspect HOD-verified assessment");
      return data?.status;
    }).toBe("verified");

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

    // The UI must expose the governed correction path without silently
    // changing an official result. No correction authorization exists here.
    await adminPage.reload();
    await adminPage.getByRole("button", { name: "Grading scale and version" }).click();
    await adminPage.getByRole("option", { name: /E2E Synthetic Approval Scale/ }).click();
    await adminPage.getByLabel("I confirm these verified results may become official and locked").check();
    await adminPage.getByRole("button", { name: "Reapprove corrected" }).click();
    await expect(adminPage.getByText("This result is already official. A corrected mark and re-verification are required before replacement.")).toBeVisible();
    const { count: officialCount, error: countError } = await service.from("official_results")
      .select("id", { count: "exact", head: true })
      .eq("enrolment_id", DEMO.learnerTomasEnrolmentId)
      .eq("subject_offering_id", ids.offering).eq("term_number", 1);
    expect(countError).toBeNull();
    expect(officialCount).toBe(1);
  } finally {
    await Promise.all([hodContext.close(), adminContext.close()]);
  }
});
