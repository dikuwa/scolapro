import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

const action = await read("src/features/library/server/actions.ts");
const route = await read("src/app/api/offline/library/route.ts");
const migration = await read("supabase/migrations/20260920113000_library_issue_offline_idempotency.sql");

test("offline library issue forwards stable client mutation id", () => {
  assert.match(route, /formData\.set\("clientMutationId", payload\.clientMutationId\)/);
  assert.match(action, /clientMutationId: uuidOrEmpty/);
  assert.match(action, /issue_learning_resource_idempotent/);
  assert.match(action, /p_client_operation_id: parsed\.data\.clientMutationId/);
});

test("online library issue keeps the existing non-idempotent RPC path", () => {
  assert.match(action, /: await supabase\.rpc\("issue_learning_resource", borrower\)/);
});

test("library issue idempotency uses the existing operation receipt foundation", () => {
  assert.match(migration, /client_operation_receipts/);
  assert.match(migration, /operation_type='ltsm\.resource\.issue'/);
  assert.match(migration, /payload_fingerprint<>v_fingerprint/);
  assert.match(migration, /return \(v_existing\.result_payload->>'loan_id'\)::uuid/);
  assert.match(migration, /v_loan_id:=public\.issue_learning_resource/);
});
