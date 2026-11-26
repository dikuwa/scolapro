import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const query = read("src/features/communications/server/diagnostics.ts");
const panel = read("src/features/communications/delivery-diagnostics-panel.tsx");
const page = read("src/app/correspondence/page.tsx");
const migration = read("supabase/migrations/20260919083000_communications_current_scope_privacy_hardening.sql");

test("delivery diagnostics use the existing current-school authorized RPC", () => {
  assert.match(query, /rpc\("list_communication_delivery_diagnostics"/);
  assert.match(query, /p_school_id: schoolId/);
  assert.match(query, /p_limit: 100/);
  assert.match(migration, /app_private\.is_current_school\(p_school_id\)/);
  assert.match(migration, /role_key in \('school_admin','principal','deputy_principal'\)/);
  assert.match(migration, /app_private\.has_platform_role\(array\['platform_support'\]\)/);
});

test("correspondence surfaces failed, retrying and completed delivery state without recipient data", () => {
  assert.match(page, /getCommunicationDeliveryDiagnostics\(membership\.schoolId\)/);
  assert.match(page, /DeliveryDiagnosticsPanel jobs=\{deliveryJobs\}/);
  assert.match(panel, /status === "dead"/);
  assert.match(panel, /status === "retry"/);
  assert.match(panel, /Completed/);
  assert.doesNotMatch(panel, /recipientId|messageId|destination/);
});
