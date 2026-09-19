import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync('src/app/learners/[id]/page.tsx', 'utf8');
const ui = fs.readFileSync('src/features/learners/learner-exit-operations.tsx', 'utf8');
const actions = fs.readFileSync('src/features/learners/server/exit-operations.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260919160000_learner_exit_operations.sql', 'utf8');

 test('learner exit operations remain on the canonical learner surface', () => {
  assert.match(page, /LearnerExitOperations/);
  assert.match(page, /getLearnerExitOperations/);
  assert.doesNotMatch(page, /delete.*learner/i);
});

test('exit UI exposes bounded transfer, withdrawal, confirmation, and history states', () => {
  assert.match(ui, /Request transfer/);
  assert.match(ui, /Record exit/);
  assert.match(ui, /name="confirmation"/);
  assert.match(ui, /Lifecycle history/);
  assert.match(ui, /No transfer requests are recorded/);
  assert.match(ui, /disabled=\{exitPending \|\| currentStatus !== "current"\}/);
  assert.match(ui, /grid-cols-2/);
  assert.match(ui, /sm:grid-cols-2/);
});

test('server actions call the existing transfer and progression lifecycles', () => {
  assert.match(actions, /exit_learner_enrolment/);
  assert.match(actions, /approve_learner_transfer/);
  assert.match(actions, /complete_learner_transfer/);
  assert.match(actions, /cancel_learner_transfer/);
  assert.match(actions, /publish_year_end_progression/);
  assert.match(actions, /getNamibiaDateKey/);
  assert.match(actions, /initiated_by_user_id: user\.id/);
  assert.doesNotMatch(actions, /from\("learners"\)\.delete/);
});

test('exit RPC preserves governed current-school scope and audit provenance', () => {
  assert.match(migration, /can_manage_enrolment_workflow\(v_enrolment\.school_id\)/);
  assert.match(migration, /v_enrolment\.status<>'current'/);
  assert.match(migration, /learner\.enrolment\.exited/);
  assert.match(migration, /p_status not in \('left','withdrawn'\)/);
  assert.match(migration, /revoke all on function/);
});
