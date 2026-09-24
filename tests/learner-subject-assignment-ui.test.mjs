import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bulk = readFileSync("src/features/learners/subject-assignment-workspace.tsx", "utf8");
const individual = readFileSync("src/features/learners/learner-subject-workspace.tsx", "utf8");
const actions = readFileSync("src/features/learners/server/subject-assignment-actions.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260924130000_learner_subject_bulk_assignment_preview.sql", "utf8");

test("bulk UX requires an explicit current preview before apply", () => {
  assert.match(bulk, /Preview changes/);
  assert.match(bulk, /Apply reviewed changes/);
  assert.match(bulk, /preview\.preview_fingerprint/);
  assert.match(bulk, /setPreview\(null\)/);
  assert.doesNotMatch(bulk, /\bconfirm\s*\(/);
});

test("bulk preview presents every required outcome and bounded scope", () => {
  for (const label of ["Additions", "Reactivations", "Unchanged", "Withdrawals", "Conflicts", "Scope being applied"]) assert.match(bulk, new RegExp(label));
  assert.match(migration, /500 learner safety limit/);
  assert.match(migration, /50 subject safety limit/);
  assert.match(migration, /status='current'/);
});

test("bulk apply remains one server RPC and reuses canonical lifecycle", () => {
  assert.match(actions, /db\.rpc\("apply_learner_subject_bulk_assignment"/);
  assert.match(migration, /public\.sync_learner_subject_registrations/);
  assert.doesNotMatch(actions, /for \(.*enrolment/i);
  assert.doesNotMatch(migration, /delete from public\.learner_subject_registrations/i);
});

test("individual UX exposes add, withdraw, reactivation and history states", () => {
  assert.match(individual, /Add subject/);
  assert.match(individual, /Withdraw/);
  assert.match(individual, /Reactivate/);
  assert.match(individual, /Historical registration preserved/);
  assert.match(individual, /marks and academic history/);
});

test("assignment surfaces use searchable Pickers and semantic tokens", () => {
  assert.match(bulk, /<Picker/);
  assert.match(bulk, /searchable/);
  assert.doesNotMatch(`${bulk}\n${individual}`, /#[0-9a-f]{3,8}/i);
  assert.doesNotMatch(`${bulk}\n${individual}`, /<select\b/i);
});
