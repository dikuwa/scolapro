import { expect, test } from "@playwright/test";
import { signInToAttendance } from "./support/session";

test("a validation-suppressed destructive replay never authorizes a later click", async ({ page }) => {
  await signInToAttendance(page, "admin");

  // Synthetic DOM only. The real AppShell DestructiveActionGuard receives the
  // native submit event. Never target or modify an actual school record.
  await page.evaluate(() => {
    const form = document.createElement("form");
    form.id = "synthetic-confirm-replay";
    const input = document.createElement("input");
    input.name = "confirmationProbe";
    input.required = true;
    input.value = "valid";
    const button = document.createElement("button");
    button.type = "submit";
    button.textContent = "Delete synthetic record";
    form.append(input, button);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      form.dataset.submitted = String(Number(form.dataset.submitted ?? "0") + 1);
    });
    document.body.append(form);
  });

  const form = page.locator("#synthetic-confirm-replay");
  const deleteButton = form.getByRole("button", { name: "Delete synthetic record" });
  const dialog = page.getByRole("alertdialog", { name: "Confirm destructive action" });

  // The guard attaches in a client effect. A server-rendered page can accept the
  // synthetic click before hydration, in which case the one-shot submit event is
  // never observed. Retry the click until the guard intercepts it instead of
  // assuming the first post-navigation click is hydrated.
  await expect(async () => {
    if (await dialog.isVisible().catch(() => false)) return;
    await deleteButton.click();
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await form.locator("input").fill(""); // becomes invalid while dialog is open
  await dialog.getByRole("button", { name: "Yes, continue" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(form).not.toHaveAttribute("data-submitted", /./);

  await form.locator("input").fill("valid");
  await deleteButton.click();
  await expect(dialog).toBeVisible(); // must not consume a stale bypass token
  await expect(form).not.toHaveAttribute("data-submitted", /./);

  await dialog.getByRole("button", { name: "Yes, continue" }).click();
  await expect(form).toHaveAttribute("data-submitted", "1");

  // A legitimate confirmed replay is one-shot.
  await deleteButton.click();
  await expect(dialog).toBeVisible();
  await expect(form).toHaveAttribute("data-submitted", "1");
  await dialog.getByRole("button", { name: "Keep current record" }).click();
  await expect(form).toHaveAttribute("data-submitted", "1");
});
