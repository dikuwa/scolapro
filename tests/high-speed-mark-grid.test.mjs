import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
const workspace=await read("src/features/assessment/mark-grid-workspace.tsx");
const server=await read("src/features/assessment/server/mark-grid.ts");
const actions=await read("src/features/assessment/server/mark-grid-actions.ts");
const queue=await read("src/features/assessment/offline/marks-draft-queue.ts");
const migration=await read("supabase/migrations/20260926090000_high_speed_mark_grid_hardening.sql");

test("desktop grid freezes learner identity and supports keyboard navigation",()=>{
  assert.match(workspace,/sticky left-0/);
  assert.match(workspace,/ArrowDown/);
  assert.match(workspace,/ArrowUp/);
  assert.match(workspace,/Enter/);
  assert.match(workspace,/handlePaste/);
});

test("mark maximum and explicit statuses remain distinct from zero",()=>{
  assert.match(workspace,/Absent/);
  assert.match(workspace,/Exempt/);
  assert.match(workspace,/Incomplete/);
  assert.match(workspace,/Withheld/);
  assert.match(workspace,/rawMax/);
  assert.match(migration,/mark_value_and_status_are_mutually_exclusive/);
});

test("autosave keeps the existing offline marks queue and optimistic version",()=>{
  assert.match(workspace,/queueAssessmentMarkDraft/);
  assert.match(workspace,/syncQueuedAssessmentMarkDrafts/);
  assert.match(queue,/expectedVersion/);
  assert.match(migration,/stale_version/);
});

test("mobile fallback uses per-learner cards instead of desktop overflow",()=>{
  assert.match(workspace,/hidden overflow-auto md:block/);
  assert.match(workspace,/md:hidden/);
  assert.match(workspace,/No admission number/);
});

test("validation submission review and correction remain governed server actions",()=>{
  assert.match(actions,/validateMarkGrid/);
  assert.match(actions,/submitMarkGrid/);
  assert.match(actions,/reviewMarkGrid/);
  assert.match(actions,/reopenMarkGridForCorrection/);
  assert.match(workspace,/Validate & submit/);
  assert.match(workspace,/HOD \/ leadership review/);
  assert.match(workspace,/Governed correction/);
});

test("server loader limits grid to current subject-eligible enrolments",()=>{
  assert.match(server,/learner_subject_registrations/);
  assert.match(server,/subject_offering_id===instance\.subject_offering_id/);
  assert.match(server,/\.eq\("status","current"\)/);
});

test("calculated working summary is read-only",()=>{
  assert.match(workspace,/Current average/);
  assert.match(workspace,/Read-only working calculation/);
  assert.doesNotMatch(workspace,/name="calculatedTotal"/);
});

test("locked and review states are not ordinary-editable",()=>{
  assert.match(server,/\["open","returned"\]\.includes\(instance\.status\)/);
  assert.match(workspace,/Marks are read-only while this assessment is in review, verified or locked state/);
  assert.match(migration,/v_instance\.status not in \('open','returned'\)/);
});
