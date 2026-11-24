import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { DEMO, OUTSIDER_TENANT } from "./support/accounts.mjs";
import { localSupabaseStatus } from "./support/local-supabase.mjs";
import { signIn } from "./support/session";

const APPLICATION_ID = "f1324000-0000-4000-8000-000000000001";
const APPLICANT_SURNAME = "DecisionNotesSynthetic";
const firstNote = "Reviewed evidence: awaiting document follow-up";
const amendedNote = "Placement accepted after reviewed documents";

function localService() {
  const local = localSupabaseStatus({ projectRoot: process.cwd() });
  return createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

test.describe("admissions decision note integrity (#1324)", () => {
  test.beforeAll(async () => {
    const { error } = await localService().from("admission_applications").upsert({
      id: APPLICATION_ID,
      tenant_id: DEMO.tenantId,
      school_id: DEMO.schoolId,
      academic_year: 2026,
      applicant_first_names: "E2E Admission",
      applicant_surname: APPLICANT_SURNAME,
      source: "school",
      status: "received",
      decision_note: null,
      submitted_at: new Date().toISOString(),
    }, { onConflict: "id" });
    expect(error).toBeNull();
  });

  test("manager can record, retain, revise and clear an audited decision note; Cancel never saves", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/school/admissions");
    const row = page.getByTestId(`admission-application-${APPLICATION_ID}`);
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Review decision" }).click();
    const picker = row.getByRole("button", { name: "Admission decision" });
    await picker.click();
    await row.getByRole("option", { name: "Waitlisted" }).click();
    await row.getByRole("textbox", { name: "Reviewer note (optional)" }).fill(firstNote);
    await row.getByRole("button", { name: "Save decision" }).click();
    await expect(page).toHaveURL(/success=Admission\+decision\+saved/);
    await expect(row.getByText(firstNote)).toBeVisible();

    let { data: saved, error } = await localService().from("admission_applications")
      .select("status,decision_note,reviewed_by_user_id,reviewed_at").eq("id", APPLICATION_ID).single();
    expect(error).toBeNull();
    expect(saved?.status).toBe("waitlisted");
    expect(saved?.decision_note).toBe(firstNote);
    expect(saved?.reviewed_by_user_id).toBeTruthy();
    expect(saved?.reviewed_at).toBeTruthy();

    await row.getByRole("button", { name: "Edit decision" }).click();
    await expect(row.getByRole("textbox", { name: "Reviewer note (optional)" })).toHaveValue(firstNote);
    await row.getByRole("textbox", { name: "Reviewer note (optional)" }).fill("UNSAVED-CANCELLED");
    await row.getByRole("button", { name: "Cancel" }).click();
    await expect(row.getByText(firstNote)).toBeVisible();
    await page.reload();
    await expect(row.getByText("UNSAVED-CANCELLED")).toHaveCount(0);

    await row.getByRole("button", { name: "Edit decision" }).click();
    await row.getByRole("button", { name: "Admission decision" }).click();
    await row.getByRole("option", { name: "Accepted" }).click();
    await row.getByRole("textbox", { name: "Reviewer note (optional)" }).fill(amendedNote);
    await row.getByRole("button", { name: "Save decision" }).click();
    await expect(row.getByText(amendedNote)).toBeVisible();

    ({ data: saved, error } = await localService().from("admission_applications")
      .select("status,decision_note,reviewed_by_user_id,reviewed_at").eq("id", APPLICATION_ID).single());
    expect(error).toBeNull();
    expect(saved?.status).toBe("accepted");
    expect(saved?.decision_note).toBe(amendedNote);

    await row.getByRole("button", { name: "Edit decision" }).click();
    await row.getByRole("textbox", { name: "Reviewer note (optional)" }).fill("");
    await row.getByRole("button", { name: "Save decision" }).click();
    // The submit button can resolve before the server action's redirect commits.
    // Unlike replacement, clearing a note has no new text to await.
    await expect(row.getByText(amendedNote)).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Edit decision" })).toBeVisible();
    ({ data: saved, error } = await localService().from("admission_applications")
      .select("status,decision_note").eq("id", APPLICATION_ID).single());
    expect(error).toBeNull();
    expect(saved?.status).toBe("accepted");
    expect(saved?.decision_note).toBeNull();
  });

  test("other school's manager cannot see decision notes or mutate a foreign application", async ({ page }) => {
    await signIn(page, "outsider");
    await page.goto("/school/admissions");
    await expect(page.getByText(OUTSIDER_TENANT.schoolName).first()).toBeVisible();
    await expect(page.getByTestId(`admission-application-${APPLICATION_ID}`)).toHaveCount(0);
    await expect(page.getByText(APPLICANT_SURNAME)).toHaveCount(0);
  });
});
