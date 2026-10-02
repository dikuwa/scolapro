import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261002210000_curriculum_time_governance_ui.sql","utf8");
const page = readFileSync("src/app/platform/curriculum-policy/page.tsx","utf8");
const workspace = readFileSync("src/features/platform/curriculum-time-governance-workspace.tsx","utf8");
const actions = readFileSync("src/features/platform/server/curriculum-time-governance-actions.ts","utf8");
const navigation = readFileSync("src/components/shell/navigation.tsx","utf8");

test("governance publication remains source-backed and human-verified at the database boundary", () => {
  assert.match(migration,/require_verified_curriculum_time_source/);
  assert.match(migration,/profile publication requires profile provenance/i);
  assert.match(migration,/every contained allocation to be verified with a source locator/i);
  assert.match(migration,/every linked scheduling constraint to be verified with a source locator/i);
  assert.match(migration,/unresolved official allocation conflict/i);
  assert.match(migration,/Platform administrator authority is required/);
  assert.match(migration,/Source verification requires URL, checksum and provenance/);
  assert.match(migration,/resolve_conflict/);
  assert.match(migration,/curriculum_time_source_conflict_resolved/);
  assert.match(migration,/curriculum_time_supersession_linked/);
});

test("governance UI is platform-admin-only and fits existing platform navigation", () => {
  assert.match(page,/roleKey === "platform_admin"/);
  assert.match(navigation,/curriculum_policy/);
  assert.match(navigation,/\\/platform\\/curriculum-policy/);
  assert.match(navigation,/platform_admin:[\s\S]*"curriculum_policy"/);
  assert.doesNotMatch(navigation,/school_admin:[^\n]*"curriculum_policy"/);
});

test("governance UI is summary-first, provenance-visible and avoids native selects", () => {
  assert.match(workspace,/Verified sources/);
  assert.match(workspace,/Published profiles/);
  assert.match(workspace,/Source conflicts/);
  assert.match(workspace,/Publication safeguards/);
  assert.match(workspace,/Checksum:/);
  assert.match(workspace,/Locator:/);
  assert.match(workspace,/Explicit supersession/);
  assert.match(workspace,/Resolution reason/);
  assert.match(workspace,/AI-assisted extraction remains staged; human verification is mandatory/);
  assert.doesNotMatch(workspace,/<select\b/i);
});

test("governance server action is bounded to the platform-admin RPC", () => {
  assert.match(actions,/roleKey === "platform_admin"/);
  assert.match(actions,/govern_curriculum_time_registry/);
  assert.match(actions,/p_related_id/);
  assert.match(actions,/p_reason/);
  assert.match(actions,/revalidatePath\("\\/platform\\/curriculum-policy"\)/);
});
