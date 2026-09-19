import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const financePage = read("src/app/school/finance/page.tsx");
const financeWorkspace = read("src/features/finance/finance-workspace.tsx");
const financeQueries = read("src/features/finance/server/queries.ts");
const financeLoading = read("src/app/school/finance/loading.tsx");
const financeError = read("src/app/school/finance/error.tsx");
const contributionsPage = read("src/app/school/contributions/page.tsx");
const contributionsWorkspace = read("src/features/contributions/contribution-workspace.tsx");
const contributionsLoading = read("src/app/school/contributions/loading.tsx");
const contributionsError = read("src/app/school/contributions/error.tsx");

test("finance and contribution routes expose loading, empty and error states", () => {
  assert.match(financeLoading, /Loading finance workspace/);
  assert.match(financeLoading, /RouteLoadingIndicator/);
  assert.match(financeError, /Finance workspace could not load/);
  assert.match(financeError, /No payment, allocation, invoice or banking setting was changed/);
  assert.match(financeWorkspace, /No payments have been recorded yet/);

  assert.match(contributionsLoading, /Loading voluntary contributions/);
  assert.match(contributionsLoading, /RouteLoadingIndicator/);
  assert.match(contributionsError, /Voluntary contributions could not load/);
  assert.match(contributionsWorkspace, /No contributions recorded/);
});

test("finance page remains current-school role scoped and uses the canonical workspace", () => {
  assert.match(financePage, /school_admin/);
  assert.match(financePage, /principal/);
  assert.match(financePage, /finance_officer/);
  assert.match(financePage, /bursar/);
  assert.match(financePage, /getFinanceWorkspace\(membership\.schoolId\)/);
  assert.doesNotMatch(financePage, /platform_support/);
});

test("raw school payment settings remain server-side finance workspace data", () => {
  assert.match(financeQueries, /school_payment_settings/);
  assert.match(financeQueries, /account_number/);
  assert.doesNotMatch(financeWorkspace, /proof_path/);
  assert.doesNotMatch(financeWorkspace, /verified_by_user_id/);
});

test("finance and contribution source remains responsive from phone through desktop", () => {
  assert.match(financeWorkspace, /sm:grid-cols-2/);
  assert.match(financeWorkspace, /lg:grid-cols-2/);
  assert.match(financeWorkspace, /overflow-x-auto/);
  assert.match(contributionsWorkspace, /sm:flex-row/);
  assert.match(contributionsWorkspace, /lg:grid-cols-2/);
  assert.match(contributionsPage, /space-y-5/);
});
