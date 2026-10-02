import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261002173000_curriculum_time_governance_ui_support.sql", "utf8");
const page = readFileSync("src/app/platform/curriculum-policy/page.tsx", "utf8");
const navigation = readFileSync("src/components/shell/navigation.tsx", "utf8");
const server = readFileSync("src/features/platform/server/curriculum-time-governance.ts", "utf8");
const actions = readFileSync("src/features/platform/server/curriculum-time-governance-actions.ts", "utf8");
const component = readFileSync("src/features/platform/curriculum-time-governance.tsx", "utf8");

test("platform curriculum governance stays inside existing platform navigation and authority", () => {
  assert.match(page, /platformMemberships\.some\(\(membership\) => membership\.roleKey === "platform_admin"\)/);
  assert.match(navigation, /curriculum_policy/);
  assert.match(navigation, /href: "\/platform\/curriculum-policy"/);
  assert.match(navigation, /platform_admin: \[[^\]]*"curriculum_policy"/);
  assert.doesNotMatch(navigation, /platform_support: \[[^\]]*"curriculum_policy"/);
});

test("withdrawn source evidence remains platform-admin reviewable without leaking to ordinary users", () => {
  assert.match(migration, /create policy "platform admins read all curriculum sources"/);
  assert.match(migration, /has_platform_role\(array\['platform_admin'\]\)/);
  assert.match(server, /curriculum_sources/);
});

test("governance workspace exposes provenance, exact-cycle scope, source locators, supersession and conflicts", () => {
  assert.match(server, /sourceDocumentDate/);
  assert.match(server, /sourceAuthority/);
  assert.match(server, /source_document_date/);
  assert.match(server, /checksum/);
  assert.match(server, /provenance/);
  assert.match(server, /cycleKind/);
  assert.match(server, /cycleLength/);
  assert.match(server, /sourceLocator/);
  assert.match(server, /supersedesAllocationId/);
  assert.match(server, /conflictPairs/);
  assert.match(server, /sameTarget/);
  assert.match(server, /slotSubjects/);
});

test("platform actions keep extraction staged until human review and reuse database finality guards", () => {
  assert.match(actions, /status: "imported"/);
  assert.match(actions, /action: z\.enum\(\["return_to_draft", "verify", "publish", "supersede", "withdraw"\]\)/);
  assert.match(actions, /conflict_acknowledgement_reason/);
  assert.match(actions, /Publish a valid successor that explicitly references this record before marking it superseded/);
  assert.match(actions, /current\.status !== "draft"/);
  assert.doesNotMatch(actions, /service_role|SUPABASE_SERVICE_ROLE/i);
});

test("UI is summary-first, uses ScolaPro Picker and contains no browser-native selects", () => {
  assert.match(component, /Publication safeguards/);
  assert.match(component, /Source conflicts/);
  assert.match(component, /Official sources/);
  assert.match(component, /Time allocation profiles/);
  assert.match(component, /Allocation review/);
  assert.match(component, /Scheduling constraints/);
  assert.match(component, /<Picker/);
  assert.match(component, /Supersedes:/);
  assert.match(component, /conflictReadinessMessage/);
  assert.match(component, /item !== conflictReadinessMessage/);
  assert.match(component, /name="conflictReason" required minLength=\{4\}/);
  assert.doesNotMatch(component, /<select\b/i);
  assert.match(component, /AI\/extraction output remains draft until a human reviewer explicitly verifies it/);
});
