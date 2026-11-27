import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20261126150000_academic_rollover_configuration.sql", import.meta.url), "utf8");
const readiness = await readFile(new URL("../src/features/progression/server/rollover-readiness.ts", import.meta.url), "utf8");

test("rollover readiness is derived from canonical next-year structure and active rules", () => {
  assert.match(migration, /create or replace function public\.get_academic_rollover_readiness/);
  assert.match(migration, /academic_years ay/);
  assert.match(migration, /register_classes rc/);
  assert.match(migration, /promotion_rule_sets prs/);
  assert.match(migration, /missing_next_register_class/);
  assert.match(migration, /missing_active_promotion_rule_set/);
  assert.match(migration, /'source_grade_id',sg\.id/);
  assert.match(readiness, /rpc\("get_academic_rollover_readiness"/);
});

test("promotion rule version changes are governed and audited", () => {
  assert.match(migration, /create or replace function public\.create_promotion_rule_set_version/);
  assert.match(migration, /create or replace function public\.add_promotion_rule_condition/);
  assert.match(migration, /create or replace function public\.activate_promotion_rule_set/);
  assert.match(migration, /status='superseded'/);
  assert.match(migration, /promotion_rule_set\.activated/);
  assert.match(migration, /drop policy if exists "academic leaders can manage promotion rule sets"/);
});
