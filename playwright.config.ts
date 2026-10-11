import { defineConfig, devices } from "@playwright/test";
import { resolveE2EEnvironment } from "./e2e/support/env-guard.mjs";

// Fail closed before a single browser is launched. If the resolved target could
// touch production, `resolveE2EEnvironment` throws and Playwright never starts.
const environment = resolveE2EEnvironment();

const channel = process.env.PLAYWRIGHT_CHANNEL?.trim() || undefined;
const manageWebServer = process.env.PLAYWRIGHT_MANAGE_WEBSERVER !== "0";

console.log(
  `[e2e] target=${environment.target} baseURL=${environment.baseUrl} ` +
    `supabaseRef=${environment.supabaseProjectRef ?? "(local)"}`,
);

export default defineConfig({
  testDir: "./e2e",
  // The suite shares one synthetic database, so runs are serialised to keep
  // capture/revision assertions deterministic.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: environment.baseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: process.env.CI ? "retain-on-failure" : "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(channel ? { channel } : {}),
      },
    },
  ],
  webServer: manageWebServer
    ? {
        command: "pnpm dev:configured",
        url: environment.baseUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
});
