import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261002103000_curriculum_postmerge_finality_remediation.sql",
  "utf8",
);

test("curriculum finality survives withdrawal", () => {
  assert.match(migration, /old\.approved_at is not null/);
  assert.match(migration, /v_approved_at is not null/);
});

test("verified curriculum mappings are terminal except archive", () => {
  assert.match(migration, /old\.status='verified'/);
  assert.match(migration, /new\.status not in \('verified','archived'\)/);
  assert.match(migration, /old\.status='archived'/);
  assert.match(migration, /new\.verified_by_user_id is distinct from old\.verified_by_user_id/);
});

test("first curriculum pins are restricted to governed resolution", () => {
  assert.match(migration, /Initial subject-offering curriculum pin must use the governed adoption workflow/);
  assert.match(migration, /Explicit curriculum pins are not accepted on subject-offering insert/);
  assert.match(migration, /set_config\('app\.curriculum_adoption_offering_id'/);
  assert.match(migration, /resolve_curriculum_version_for_offering_fields/);
});