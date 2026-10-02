import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registry = readFileSync(
  "supabase/migrations/20261002100935_curriculum_time_allocation_registry.sql",
  "utf8",
);
const remediation = readFileSync(
  "supabase/migrations/20261002114500_curriculum_time_registry_postmerge_remediation.sql",
  "utf8",
);
test("time allocation registry models exact periods per cycle without a parallel subject catalogue", () => {
  assert.match(registry, /create table public\.curriculum_time_profiles/i);
  assert.match(registry, /create table public\.curriculum_time_allocations/i);
  assert.match(registry, /create table public\.curriculum_time_slot_subjects/i);
  assert.match(registry, /create table public\.curriculum_scheduling_constraints/i);
  assert.match(registry, /periods_per_cycle smallint not null/i);
  assert.match(registry, /cycle_kind text not null/i);
  assert.match(registry, /cycle_length smallint not null/i);
  assert.doesNotMatch(registry, /periods_per_week/i);
  assert.doesNotMatch(registry, /create table public\.(?:subjects_v2|curriculum_subject_catalogue)/i);
});

test("official allocation resolver uses exact cycle variants and explicit supersession", () => {
  assert.match(registry, /resolve_curriculum_time_allocation/);
  assert.match(registry, /resolved_cycle_kind=p_cycle_kind/);
  assert.match(registry, /resolved_cycle_length=p_cycle_length/);
  assert.match(registry, /replacement\.supersedes_allocation_id=c\.id/);
  assert.match(registry, /slot_subject\.allocation_id=previous\.id/);
  assert.match(registry, /slot_subject\.curriculum_subject_id=new\.curriculum_subject_id/);
  assert.match(registry, /'cycle_variant_missing'/);
  assert.match(registry, /'source_conflict'/);
  assert.doesNotMatch(registry, /p_cycle_length\s*[*/+-]\s*/);
  assert.doesNotMatch(registry, /period_minutes\s*[*/]\s*/);
});

test("national registry publication is draft-first, source-gated and final", () => {
  assert.match(registry, /Curriculum time profiles must begin in draft state/);
  assert.match(registry, /Curriculum time profile must be verified before publication/);
  assert.match(registry, /Curriculum time allocations must begin in draft state/);
  assert.match(registry, /Curriculum time allocation must be verified before publication/);
  assert.match(registry, /Curriculum scheduling constraints must begin in draft state/);
  assert.match(registry, /Curriculum scheduling constraint must be verified before publication/);
  assert.match(registry, /verified source with URL, checksum and provenance/);
  assert.match(registry, /Only draft curriculum time profiles may be deleted/);
  assert.match(registry, /Only draft curriculum time allocations may be deleted/);
  assert.match(registry, /Only draft curriculum scheduling constraints may be deleted/);
});


test("review remediation hardens provenance supersession eligibility and audit contracts", () => {
  assert.match(registry, /guard_curriculum_time_source_evidence/);
  assert.match(registry, /source evidence used by final national time rules is immutable/i);
  assert.match(registry, /guard_curriculum_time_registry_identity/);
  assert.match(registry, /supersession must remain within the same exact cycle variant/i);
  assert.match(registry, /supersession chain cannot contain a cycle/i);
  assert.match(registry, /Verified curriculum time slot eligibility is immutable/);
  assert.match(registry, /other\.target_kind<>'subject'[\s\S]*curriculum_time_slot_subjects/);
  assert.match(registry, /Published curriculum time conflict acknowledgement reason is immutable provenance/);
  for (const eventType of [
    "curriculum_time_profile_superseded",
    "curriculum_time_profile_withdrawn",
    "curriculum_time_allocation_superseded",
    "curriculum_time_allocation_withdrawn",
    "curriculum_time_constraint_superseded",
    "curriculum_time_constraint_withdrawn",
  ]) {
    assert.match(registry, new RegExp(eventType));
  }
});


test("post-merge remediation preserves exact profile and constraint semantics", () => {
  assert.match(remediation, /add column cycle_kind text/);
  assert.match(remediation, /Existing non-draft minimum-double-period constraints require explicit numeric reconciliation/);
  assert.match(remediation, /numeric_value is not null[\s\S]*numeric_value>=1[\s\S]*numeric_value=trunc\(numeric_value\)[\s\S]*not valid/i);
  assert.match(remediation, /Existing non-draft subject-level scheduling constraints require explicit exact-cycle reconciliation/);
  assert.match(remediation, /guard_curriculum_time_profile_supersession/);
  assert.match(remediation, /profile supersession chain cannot contain a cycle/i);
  assert.match(remediation, /same phase and exact cycle variant/i);
  assert.match(remediation, /guard_curriculum_scheduling_constraint_supersession/);
  assert.match(remediation, /constraint supersession chain cannot contain a cycle/i);
  assert.match(remediation, /c\.cycle_kind=p_cycle_kind/);
  assert.match(remediation, /c\.cycle_length=p_cycle_length/);
  assert.match(remediation, /replacement_profile\.supersedes_profile_id=c\.profile_id/);
  assert.match(remediation, /from public\.curriculum_time_allocations replacement/);
  assert.match(remediation, /constraint supersession must preserve its exact allocation and canonical subject\/version target/i);
  assert.match(remediation, /from public\.curriculum_scheduling_constraints replacement/);
  assert.match(remediation, /replacement\.curriculum_version_id is not distinct from c\.curriculum_version_id/);
  assert.match(remediation, /c\.allocation_id=sel\.id[\s\S]*p_curriculum_version_id is null and c\.curriculum_version_id is null/);
  assert.match(remediation, /security definer\s+set search_path=pg_catalog,public\s+as \$resolve_time\$/i);
  assert.match(remediation, /status in \('published','superseded','withdrawn'\)/);
  assert.match(remediation, /disable trigger curriculum_scheduling_constraint_guard_trg/);
  assert.match(remediation, /enable trigger curriculum_scheduling_constraint_guard_trg/);
});
