import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = "supabase/migrations/20261003070000_assessment_mark_entry_governance.sql";
const read = (path) => readFile(path, "utf8");

test("mark-entry governance keeps timing separate from moderation state", async () => {
  const sql = await read(migrationPath);
  assert.match(sql, /assessment_mark_entry_windows/);
  assert.match(sql, /policy_mode in \('manual','deadline','verification','deadline_and_verification'\)/);
  assert.match(sql, /closing_soon/);
  assert.match(sql, /locked_again/);
  assert.match(sql, /correction_pending/);
  assert.match(sql, /workflowStatus/);
});

test("online and offline mark writes share the governed mutation boundary", async () => {
  const sql = await read(migrationPath);
  assert.match(sql, /can_edit_assessment_mark/);
  assert.match(sql, /enforce_learner_mark_recorder_integrity/);
  assert.match(sql, /submit_offline_assessment_mark/);
  assert.match(sql, /assessment_not_editable/);
  assert.match(sql, /correction_authorization_id/);
  assert.match(sql, /stale_version/);
  assert.match(sql, /client_mutation_id/);
});

test("correction authorization is bounded, expiring, scoped and audited", async () => {
  const sql = await read(migrationPath);
  assert.match(sql, /scope_kind in \('learner','component','subject_class'\)/);
  assert.match(sql, /expires_at > starts_at/);
  assert.match(sql, /Subject-class correction requires school leadership authority/);
  assert.match(sql, /assessment\.mark_corrected/);
  assert.match(sql, /old_numeric_mark/);
  assert.match(sql, /new_numeric_mark/);
  assert.match(sql, /requires_reverification/);
});

test("official result correction preserves history and reuses report snapshot supersession", async () => {
  const sql = await read(migrationPath);
  assert.match(sql, /supersedes_result_id/);
  assert.match(sql, /superseded_by_result_id/);
  assert.match(sql, /official_results_current_subject_term_uidx/);
  assert.match(sql, /official_results_current/);
  assert.match(sql, /report_card\.reissue_required/);
  assert.match(sql, /build_report_card_snapshot_management_internal/);
  assert.match(sql, /Published report cards remain immutable/);
});

test("legacy unbounded correction path can no longer reopen marks", async () => {
  const sql = await read(migrationPath);
  const marker = "Use authorize_assessment_mark_correction with explicit scope, start, and expiry";
  assert.match(sql, new RegExp(marker));
});


test("legacy pre-window lifecycle stays editable until an explicit timing policy is configured", async () => {
  const sql = await read(migrationPath);
  assert.match(sql, /v_opened:=v_instance\.status in \('not_open','open','returned'\)/);
  assert.match(sql, /v_instance\.status in \('not_open','open','returned'\)/);
  assert.match(sql, /Assessment is not open for mark editing/);
});


test("correction re-verification cannot be disabled by RPC callers", async () => {
  const sql = await read(migrationPath);
  assert.match(sql, /requires_reverification boolean not null default true check \(requires_reverification=true\)/);
  assert.match(sql, /Correction authorization requires re-verification/);
  assert.match(sql, /v_reason,p_starts_at,p_expires_at,true,auth\.uid\(\)/);
});


test("effective locks can be reopened without granting HOD school-wide correction reads", async () => {
  const sql = await read(migrationPath);
  assert.match(sql, /v_effective_window:=app_private\.resolve_assessment_mark_entry_window/);
  assert.match(sql, /coalesce\(v_effective_window->>'state',''\) in \('locked','locked_again'\)/);
  assert.match(sql, /hod_responsible_for_subject[\s\S]*assessment_mark_reopen_authorizations\.subject_offering_id/);
});
