import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const finance = read("src/features/finance/finance-workspace.tsx");
const page = read("src/app/school/settings/page.tsx");
const actions = read("src/features/finance/server/actions.ts");
const queries = read("src/features/finance/server/queries.ts");
const configuration = finance.slice(finance.indexOf("export function PaymentSettingsForm"), finance.indexOf("export function FinanceWorkspace"));
const operations = finance.slice(finance.indexOf("export function FinanceWorkspace"));

test("#1282 summary-first banking configuration is one gated same-card editor", () => {
  assert.match(configuration, /<ConfigurationCard/);
  assert.match(configuration, /panelId="school-payment-settings-editor"/);
  assert.ok(configuration.indexOf("summary={(") < configuration.indexOf("editor={("));
  assert.match(configuration, /published \? "Published to eligible payers" : "Not published"/);
  assert.match(configuration, /!settings \? "Not configured"/);
  assert.match(configuration, /role="status"/);
  assert.match(configuration, /router\.refresh\(\)/);
  assert.match(configuration, /aria-controls="school-payment-settings-editor"/);
  assert.match(configuration, />Cancel<\/Button>/);
  assert.match(configuration, /setOpen\(false\)/);
  assert.doesNotMatch(configuration, /RecordActionButton/);
  assert.doesNotMatch(configuration, /type="password"/);
  for (const key of ["bankName", "accountName", "accountNumber", "accountType", "branchName", "branchCode", "referenceInstructions", "paymentInstructions", "active"]) {
    assert.match(configuration, new RegExp(`settings\\?\\.${key}|settings\\.${key}`));
  }
});

test("#1282 the original payment and role boundaries are unchanged", () => {
  assert.match(page, /financeSettingsRoles = new Set\(\["school_admin", "principal"\]\)/);
  assert.match(page, /financeSettingsRoles\.has\(roleKey\)/);
  assert.match(page, /<PaymentSettingsForm schoolId=\{membership\.schoolId\} settings=\{paymentSettings\}/);
  assert.match(actions, /financeMembership\(parsed\.data\.schoolId\)/);
  assert.match(actions, /save_school_payment_settings/);
  assert.match(queries, /\.from\("school_payment_settings"\)/);
  assert.match(operations, /Recent payments/);
  assert.match(operations, /recordPayment/);
  assert.match(operations, /School payment instructions/);
});
