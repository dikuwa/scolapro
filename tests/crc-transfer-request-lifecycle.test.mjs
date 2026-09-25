import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/migrations/20260925223000_crc_transfer_request_lifecycle.sql");
const custodyPage = read("src/app/school/crc-custody/page.tsx");
const custodyWorkspace = read("src/features/crc/crc-custody-workspace.tsx");
const custodyQueries = read("src/features/crc/server/custody.ts");
const actions = read("src/features/crc/server/actions.ts");
const dutyMap = read("src/lib/permissions/school-duty-capabilities.ts");
const navigation = read("src/components/shell/navigation.tsx");
const networkPage = read("src/app/network/crc-escalations/page.tsx");
const networkWorkspace = read("src/features/crc/crc-network-escalations.tsx");

test("delegated CRC custody extends school duties without granting confidential support access", () => {
  assert.match(migration, /'crc_custodian'/);
  assert.match(dutyMap, /crc_custodian/);
  assert.match(dutyMap, /navigationKey: "crc_custody"/);
  assert.match(migration, /can_manage_custody/);
  assert.match(migration, /can_view_confidential_support/);
  assert.match(migration, /app_private\.is_support_role_member/);
  assert.match(migration, /platform_support/);
});

test("CRC request lifecycle reuses canonical custody and freezes origin history after close", () => {
  for (const contract of [
    "crc_custody_requests",
    "request_crc_custody",
    "accept_crc_custody_request",
    "finish_crc_request_from_closed_custody",
    "enforce_transferred_crc_history_read_only",
  ]) {
    assert.ok(migration.includes(contract), `missing ${contract}`);
  }
  assert.match(migration, /custody_record_id uuid references public\.crc_custody_records/);
  assert.match(migration, /Transferred origin CRC history is read-only/);
  assert.match(migration, /learner_cumulative_notes/);
  assert.doesNotMatch(migration, /create table .*crc_v2/i);
});

test("network escalation is metadata-only and follows effective circuit or region membership", () => {
  assert.match(migration, /response_due_on/);
  assert.match(migration, /CRC custody request is not overdue/);
  assert.match(migration, /school_network_assignments/);
  assert.match(migration, /education_network_memberships/);
  assert.match(migration, /list_my_crc_request_escalations/);

  const listStart = migration.indexOf("create or replace function public.list_my_crc_request_escalations");
  const listEnd = migration.indexOf("create or replace function public.acknowledge_crc_request_escalation", listStart);
  const listFunction = migration.slice(listStart, listEnd);
  assert.doesNotMatch(listFunction, /learner_name|admission_number|psychometric|counselling|health_history/);
});

test("school CRC workspace uses governed access context and exposes request queues", () => {
  assert.match(custodyPage, /getCrcCustodyAccessContext/);
  assert.match(custodyPage, /access\.canManageCustody/);
  assert.match(custodyPage, /getMyCrcCustodyRequests/);
  for (const queue of ["Incoming", "Outgoing", "Awaiting dispatch", "Awaiting acknowledgement", "Completed"]) {
    assert.ok(custodyWorkspace.includes(queue), `missing ${queue} queue`);
  }
  assert.match(custodyWorkspace, /Request a missing CRC/);
  assert.match(custodyWorkspace, /External school/);
  assert.match(custodyWorkspace, /Escalate to/);
  assert.doesNotMatch(custodyWorkspace, /<select/);
});

test("request and escalation mutations stay behind server actions and RPCs", () => {
  for (const action of [
    "requestCrcCustody",
    "acceptCrcCustodyRequest",
    "fulfillExternalCrcRequest",
    "escalateCrcCustodyRequest",
    "setCrcCustodyRequestPolicy",
    "acknowledgeCrcRequestEscalation",
  ]) {
    assert.ok(actions.includes(action), `missing ${action}`);
  }
  assert.match(custodyQueries, /get_crc_custody_access_context/);
  assert.match(custodyQueries, /get_my_crc_custody_requests/);
  assert.match(custodyQueries, /list_my_crc_request_escalations/);
});

test("circuit and regional officers receive a separate bounded referral surface", () => {
  assert.match(navigation, /crc_escalations/);
  assert.match(navigation, /circuit_officer:[^\n]*crc_escalations/);
  assert.match(navigation, /regional_officer:[^\n]*crc_escalations/);
  assert.match(networkPage, /networkMemberships/);
  assert.match(networkPage, /circuit_officer/);
  assert.match(networkPage, /regional_officer/);
  assert.match(networkWorkspace, /Referral metadata only/);
  assert.match(networkWorkspace, /Learner identity, confidential CRC content, counselling, health and psychometric records are not exposed/);
});
