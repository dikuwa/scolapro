import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
const workspace=await read("src/features/assessment/mark-grid-workspace.tsx");
const server=await read("src/features/assessment/server/mark-grid.ts");
const queue=await read("src/features/assessment/offline/marks-draft-queue.ts");
const route=await read("src/app/api/offline/assessment/marks/route.ts");
const migration=await read("supabase/migrations/20260926090000_mark_grid_hod_correction.sql");

test("desktop mark entry keeps learner identity frozen and exposes configured maximum",()=>{
  assert.match(workspace,/sticky left-0/);
  assert.match(workspace,/Mark \/ \{selected\.rawMax/);
  assert.match(workspace,/Maximum/);
});

test("mark grid supports keyboard flow and bounded numeric spreadsheet paste",()=>{
  assert.match(workspace,/ArrowDown/);
  assert.match(workspace,/ArrowUp/);
  assert.match(workspace,/Enter/);
  assert.match(workspace,/clipboardData\.getData\("text\/plain"\)/);
  assert.match(workspace,/selected\.rawMax/);
});

test("absent and other statuses remain distinct from zero",()=>{
  assert.match(workspace,/Absent/);
  assert.match(workspace,/Exempt/);
  assert.match(workspace,/Incomplete/);
  assert.match(workspace,/Withheld/);
  assert.match(workspace,/numericMark:value,status:""/);
  assert.match(workspace,/status:value,numericMark:""/);
});

test("autosave reuses the existing offline queue and optimistic version contract",()=>{
  assert.match(workspace,/queueAssessmentMarkDraft/);
  assert.match(workspace,/expectedVersion:next\.version/);
  assert.match(queue,/expectedVersion: string \| null/);
  assert.match(route,/submit_offline_assessment_mark/);
  assert.match(route,/expectedVersion/);
});

test("calculated scheme total is read-only and batch derived",()=>{
  assert.match(server,/schemeComponents/);
  assert.match(server,/relatedMarks/);
  assert.match(server,/calculatedTotal/);
  assert.match(workspace,/Calculated total/);
  assert.doesNotMatch(workspace,/name="calculatedTotal"/);
});

test("mobile falls back to per-learner editing",()=>{
  assert.match(workspace,/md:hidden/);
  assert.match(workspace,/visible\.map/);
  assert.match(workspace,/Mark for/);
});

test("lifecycle remains explicit and submitted records are not ordinarily editable",()=>{
  assert.match(workspace,/Draft → Validate → Submit/);
  assert.match(workspace,/\["open","returned"\]/);
  assert.match(workspace,/read-only in its current lifecycle state/);
  assert.match(server,/submit_assessment_for_review/);
});

test("HOD review authority is narrowed to assigned subject portfolio",()=>{
  assert.match(migration,/hod_responsible_for_subject/);
  assert.match(migration,/can_review_assessment_subject/);
  assert.match(migration,/review_mark_submission/);
});

test("correction requires reason and audit while locked records fail closed",()=>{
  assert.match(migration,/assessment_correction_requests/);
  assert.match(migration,/A correction reason is required/);
  assert.match(migration,/assessment\.correction_requested/);
  assert.match(migration,/Locked assessment requires the governed official-result correction workflow/);
  assert.match(migration,/assessment\.reopened_for_correction/);
});
