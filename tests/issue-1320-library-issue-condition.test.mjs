import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261124011000_library_issue_unlendable_condition_guard.sql","utf8");
const circulation = readFileSync("src/features/library/library-workspace.tsx","utf8");
const classOps = readFileSync("src/features/library/class-operations.tsx","utf8");
const offline = readFileSync("src/components/offline/offline-library-workspace.tsx","utf8");
const pgtap = readFileSync("supabase/tests/ltsm_issue_unlendable_condition_test.sql","utf8");

test("canonical issue refuses damaged and lost even when availability is available", () => {
  assert.ok(migration.includes("create or replace function public.issue_learning_resource("));
  assert.ok(migration.includes("for update;"));
  assert.ok(migration.includes("app_private.can_manage_ltsm(v_copy.school_id)"));
  assert.ok(migration.includes("v_copy.availability<>'available'"));
  assert.ok(migration.includes("v_copy.condition in ('damaged','lost')"));
  assert.ok(migration.includes("Damaged or lost resource copy cannot be issued"));
  assert.ok(migration.includes("public.learning_resource_loans"));
  assert.ok(migration.includes("ltsm.resource.issued"));
});

test("online class, single and offline issue selectors exclude physically unlendable copies", () => {
  for (const source of [circulation,classOps,offline]) {
    assert.ok(source.includes('!["damaged", "lost"].includes(copy.condition)'));
  }
  assert.ok(offline.includes("copy.availability === \"available\" && ![\"damaged\", \"lost\"].includes(copy.condition)"));
});

test("database regression tests direct, bulk and offline issue and failed receipt rollback", () => {
  assert.ok(pgtap.includes("select plan(10);"));
  assert.ok(pgtap.includes("public.bulk_issue_learning_resources("));
  assert.ok(pgtap.includes("public.issue_learning_resource_idempotent("));
  assert.ok(pgtap.includes("public.client_operation_receipts"));
  assert.ok(pgtap.includes("good available copy remains lendable"));
});
