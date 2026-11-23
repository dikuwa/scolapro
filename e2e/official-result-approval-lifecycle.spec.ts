import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { DEMO, SYNTHETIC_ACCOUNTS, syntheticPassword } from "./support/accounts.mjs";
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
  test.setTimeout(240_000);
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

  // Fixture setup is allowed only after the local-status loopback guard.
  execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-f",
    resolve(process.cwd(), "e2e/support/official-result-term-grading-negative-local-fixture.sql")], {
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
    const anonKey = local.ANON_KEY;
    if (!anonKey) throw new Error("Local synthetic Supabase anon key is required.");
    const approver = createClient(local.API_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signedIn = await approver.auth.signInWithPassword({
      email: SYNTHETIC_ACCOUNTS.admin.email,
      password: syntheticPassword(),
    });
    expect(signedIn.error).toBeNull();
    for (const invalidScale of [
      "e2f80000-0000-4000-8000-000000000009",
      "e2f80000-0000-4000-8000-00000000000a",
    ]) {
      const { error: periodError } = await approver.rpc("approve_official_subject_result", {
        p_assessment_scheme_id: ids.scheme,
        p_enrolment_id: DEMO.learnerTomasEnrolmentId,
        p_term_number: 1,
        p_grading_scale_id: invalidScale,
      });
      expect(periodError?.message).toContain(
        "The selected grading scale does not cover the academic term end date",
      );
    }
    const { count: deniedCount, error: deniedCountError } = await service
      .from("official_results").select("id", { count: "exact", head: true })
      .eq("enrolment_id", DEMO.learnerTomasEnrolmentId)
      .eq("subject_offering_id", ids.offering).eq("term_number", 1);
    expect(deniedCountError).toBeNull();
    expect(deniedCount).toBe(0);
    await adminPage.goto(`/assessment/results?offering=${ids.offering}&scheme=${ids.scheme}&class=${DEMO.registerClass10B}&term=1`);
    await expect(adminPage.getByRole("heading", { name: "Official result approval" })).toBeVisible();
    await expect(adminPage.getByText("Verified — learner completeness checked on approval")).toBeVisible();
    await adminPage.getByRole("button", { name: "Grading scale and version" }).click();
    await expect(adminPage.getByRole("option", { name: "Synthetic Future Grading" })).toHaveCount(0);
    await expect(adminPage.getByRole("option", { name: "Synthetic Expired Grading" })).toHaveCount(0);
    await adminPage.getByRole("option", { name: /E2E Synthetic Approval Scale/ }).click();
    await adminPage.getByLabel("I confirm these verified results may become official and locked").check();
    await adminPage.getByRole("button", { name: "Approve result" }).click();
    await expect(adminPage.getByText("Official subject result approved and locked.", { exact: false })).toBeVisible();

    const { data: result, error } = await service.from("official_results_current")
      .select("result_value,symbol,calculation_snapshot").eq("enrolment_id", DEMO.learnerTomasEnrolmentId)
      .eq("subject_offering_id", ids.offering).eq("term_number", 1).single();
    expect(error).toBeNull();
    expect(Number(result?.result_value)).toBe(82);
    expect(result?.symbol).toBe("A");
    const gradingProvenance = result?.calculation_snapshot as Record<string, unknown> | null;
    expect(gradingProvenance?.grading_scale_reference_date).toBe("2026-04-28");
    expect(gradingProvenance?.grading_scale_reference_basis).toBe("academic_term_end");

    // The UI must expose the governed correction path without silently
    // changing an official result. No correction authorization exists here.
    await adminPage.reload();
    await adminPage.getByRole("button", { name: "Grading scale and version" }).click();
    await adminPage.getByRole("option", { name: /E2E Synthetic Approval Scale/ }).click();
    await adminPage.getByLabel("I confirm these verified results may become official and locked").check();
    // No authorized mark correction exists: the UI must not offer a
    // misleading submit path, and the immutable official row is unchanged.
    await expect(adminPage.getByRole("button", { name: "Reapprove corrected" })).toBeDisabled();
    await expect(adminPage.getByText("Reapproval requires an authorized corrected mark and completed re-verification.")).toBeVisible();
    const { count: officialCount, error: countError } = await service.from("official_results")
      .select("id", { count: "exact", head: true })
      .eq("enrolment_id", DEMO.learnerTomasEnrolmentId)
      .eq("subject_offering_id", ids.offering).eq("term_number", 1);
    expect(countError).toBeNull();
    expect(officialCount).toBe(1);
    
    // Governed correction: school management grants a bounded component
    // window, the assigned teacher corrects the mark, the portfolio HOD
    // re-verifies, and management can reapprove without erasing history.
    await adminPage.goto(`/assessment/marks/${ids.instance}`);
    await expect(adminPage.getByRole("heading", { name: "Governed correction" })).toBeVisible();
    const localDate = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Windhoek", day: "2-digit", month: "2-digit", year: "numeric",
    });
    const start = localDate.format(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const expiry = localDate.format(new Date(Date.now() + 24 * 60 * 60 * 1000));
    for (const [id, value] of [
      ["#startDate-typed", start], ["#startTime-typed", "00:01"],
      ["#expiryDate-typed", expiry], ["#expiryTime-typed", "23:59"],
    ]) {
      await adminPage.locator(id).fill(value);
      await adminPage.locator(id).blur();
    }
    await adminPage.getByPlaceholder("Why must these marks be corrected?").fill(
      "Synthetic verification of audited result reissue",
    );
    await adminPage.getByRole("button", { name: "Authorise correction" }).click();
    await expect.poll(async () => {
      const { data, error } = await service.from("assessment_instances")
        .select("correction_pending").eq("id", ids.instance).single();
      if (error) throw new Error("Unable to inspect correction authorization");
      return data?.correction_pending;
    }).toBe(true);

    await page.reload();
    const correctedMark = page.getByRole("textbox", { name: "Mark for Sample, Tomas" });
    await expect(correctedMark).toBeEnabled();
    await correctedMark.fill("94");
    await correctedMark.blur();
    await expect.poll(async () => {
      const { data, error } = await service.from("learner_marks_current")
        .select("numeric_mark").eq("assessment_instance_id", ids.instance)
        .eq("enrolment_id", DEMO.learnerTomasEnrolmentId).single();
      if (error) throw new Error("Could not verify the governed corrected mark");
      return Number(data?.numeric_mark);
    }).toBe(94);
    // The mark-insert trigger moves the instance from locked to returned;
    // the mark-grid UI refreshes its server workflow before submission.
    await expect(page.getByRole("button", { name: "Submit for review" })).toBeEnabled();
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect.poll(async () => {
      const { data, error } = await service.from("assessment_instances")
        .select("status").eq("id", ids.instance).single();
      if (error) throw new Error("Unable to inspect corrected assessment submission");
      return data?.status;
    }).toBe("review");

    await hodPage.reload();
    await hodPage.getByRole("button", { name: "Verify", exact: true }).click();
    await expect.poll(async () => {
      const { data, error } = await service.from("assessment_instances")
        .select("status,correction_pending").eq("id", ids.instance).single();
      if (error) throw new Error("Unable to inspect corrected assessment verification");
      return data?.status === "verified" && !data?.correction_pending;
    }).toBe(true);

    await adminPage.goto(`/assessment/results?offering=${ids.offering}&scheme=${ids.scheme}&class=${DEMO.registerClass10B}&term=1`);
    await adminPage.getByRole("button", { name: "Grading scale and version" }).click();
    await adminPage.getByRole("option", { name: /E2E Synthetic Approval Scale/ }).click();
    await adminPage.getByLabel("I confirm these verified results may become official and locked").check();
    const reapprove = adminPage.getByRole("button", { name: "Reapprove corrected" });
    await expect(reapprove).toBeEnabled();
    await reapprove.click();
    await expect.poll(async () => {
      const { data, error } = await service.from("official_results_current")
        .select("result_value").eq("enrolment_id", DEMO.learnerTomasEnrolmentId)
        .eq("subject_offering_id", ids.offering).eq("term_number", 1).single();
      if (error) throw new Error("Unable to inspect current corrected official result");
      return Number(data?.result_value);
    }).toBe(94);
    const { data: history, error: historyError } = await service.from("official_results")
      .select("id,result_value,superseded_at,supersedes_result_id,correction_authorization_id,calculation_snapshot")
      .eq("enrolment_id", DEMO.learnerTomasEnrolmentId)
      .eq("subject_offering_id", ids.offering).eq("term_number", 1);
    expect(historyError).toBeNull();
    expect(history).toHaveLength(2);
    const oldResult = history?.find((row) => Number(row.result_value) === 82);
    const replacementResult = history?.find((row) => Number(row.result_value) === 94);
    expect(oldResult?.superseded_at).toBeTruthy();
    expect(replacementResult?.supersedes_result_id).toBe(oldResult?.id);
    expect(replacementResult?.correction_authorization_id).toBeTruthy();
    for (const immutable of [oldResult, replacementResult]) {
      const snapshot = immutable?.calculation_snapshot as Record<string, unknown> | null;
      expect(snapshot?.grading_scale_reference_date).toBe("2026-04-28");
      expect(snapshot?.grading_scale_reference_basis).toBe("academic_term_end");
    }

  } finally {
    await Promise.all([hodContext.close(), adminContext.close()]);
  }
});
