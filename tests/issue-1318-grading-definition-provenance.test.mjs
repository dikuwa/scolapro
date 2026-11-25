import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20261125130000_official_result_grading_definition_provenance.sql", import.meta.url),
  "utf8",
);
const lifecycleSpec = readFileSync(
  new URL("../e2e/official-result-approval-lifecycle.spec.ts", import.meta.url),
  "utf8",
);

test("official results retain the exact grading definition used, not only its version text", () => {
  assert.match(migration, /add column if not exists grading_definition_snapshot jsonb/);
  assert.match(migration, /add column if not exists grading_definition_fingerprint text/);
  assert.match(migration, /official_results_grading_definition_pair/);
  assert.match(migration, /alter column result_value type numeric\(10,4\)/);
  assert.match(migration, /'decimal_places',v_scale\.decimal_places/);
  assert.match(migration, /'bands',coalesce\(/);
  assert.match(migration, /v_definition_fingerprint:=md5\(v_definition::text\)/);
  // The definition cannot be rewritten after approval.
  assert.match(migration, /or new\.grading_definition_snapshot is distinct from old\.grading_definition_snapshot/);
  assert.match(migration, /or new\.grading_definition_fingerprint is distinct from old\.grading_definition_fingerprint/);
});

test("a correction must reuse the superseded definition and legacy rows fail closed", () => {
  assert.match(migration, /if v_previous\.grading_definition_fingerprint is null then/);
  assert.match(migration, /historical official result predates grading-definition snapshots/);
  assert.match(migration, /if v_previous\.grading_definition_fingerprint is distinct from v_definition_fingerprint then/);
  assert.match(migration, /Corrected official result must use its original grading definition/);
  assert.match(migration, /Corrected official result must reuse its original grading scale version/);
});

test("a scale already used by approved results can never return to draft, change or be deleted", () => {
  assert.match(migration, /create or replace function app_private\.guard_grading_scale_usage_integrity/);
  assert.match(migration, /cannot return to draft/);
  assert.match(migration, /is immutable; create a new version/);
  assert.match(migration, /cannot be recreated as a draft/);
  assert.match(migration, /cannot be deleted/);
  assert.match(migration, /create trigger grading_scale_usage_guard/);
  assert.match(migration, /before insert or update or delete on public\.grading_scales/);
  assert.match(migration, /create trigger grading_band_usage_guard/);
  assert.match(migration, /Bands of a grading scale used by approved results are immutable/);
});

test("approval restores mark serialization and resolves the term from the enrolment year", () => {
  assert.match(migration, /for update of ai;/);
  assert.match(migration, /and y\.year=v_enrolment\.academic_year/);
  assert.doesNotMatch(migration, /and y\.year=v_scheme\.academic_year/);
  assert.match(migration, /Assessment scheme and enrolment academic year differ/);
});

test("authenticated lifecycle evidence covers the definition snapshot and draft-return denial", () => {
  assert.match(lifecycleSpec, /grading_definition_fingerprint/);
  assert.match(lifecycleSpec, /grading_definition_snapshot/);
  assert.match(lifecycleSpec, /expect\(oldResult\?\.grading_definition_fingerprint\)\.toBe\(replacementResult\?\.grading_definition_fingerprint\)/);
  assert.match(lifecycleSpec, /cannot return to draft/);
});

test("workspace readiness and management gates agree with the canonical approval boundary", () => {
  const approval = readFileSync(new URL("../src/features/assessment/server/official-result-approval.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/app/assessment/page.tsx", import.meta.url), "utf8");
  // A required component without an instance must make readiness false rather
  // than reporting ready and then failing inside the approval RPC.
  assert.match(approval, /required = relevant\.size;/);
  assert.doesNotMatch(approval, /required = requiredInstances\.length;/);
  // Management links follow the deterministic current-school role, not the raw
  // membership order.
  assert.match(page, /const roleKey = context\.currentSchoolMembership\?\.roleKey \?\? membership\.roleKey;/);
  assert.match(page, /const canApprove = \["school_admin", "principal", "deputy_principal"\]\.includes\(roleKey\);/);
});
