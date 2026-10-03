import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration=readFileSync("supabase/migrations/20261003203000_calendar_timetable_intake_adapters.sql","utf8");
const actions=readFileSync("src/features/imports/server/operational-intake-actions.ts","utf8");
const page=readFileSync("src/app/school/imports/operations/page.tsx","utf8");

test("operational adapters reuse shared document intake and canonical engines",()=>{
  assert.match(migration,/document_intake_jobs/);
  assert.match(migration,/document_intake_adapter_rows/);
  assert.match(migration,/public\.create_school_learner_calendar_event/);
  assert.match(migration,/public\.create_timetable_slot/);
  assert.doesNotMatch(migration,/create table public\.(?:calendar|timetable)_/i);
});

test("calendar intake preserves source class and append-only revision semantics",()=>{
  assert.match(migration,/national','regional','school','local/);
  assert.match(migration,/effective_learner_calendar_events/);
  assert.match(migration,/Multiple active calendar events share this title/);
  assert.match(migration,/if v_count>1 then[\s\S]*v_resolution:='conflict'/);
  assert.match(migration,/p_supersedes_event_id|matched_entity_id/);
  assert.match(page,/Source class/);
});

test("timetable adapter requires explicit canonical mapping",()=>{
  assert.match(migration,/teacher_employee_number/);
  assert.match(migration,/subject_code/);
  assert.match(migration,/class_code/);
  assert.match(migration,/period_number/);
  assert.match(migration,/teacher_allocation_id/);
  assert.match(migration,/register_class_id/);
  assert.match(migration,/period_id/);
  assert.match(migration,/cycle_code/);
  assert.match(migration,/room_label/);
});

test("human review and correction are mandatory before commit",()=>{
  assert.match(migration,/Every operational intake row requires a human review decision/);
  assert.match(migration,/correct_operational_intake_row/);
  assert.match(migration,/review_operational_intake_row/);
  assert.match(page,/Save correction & re-check/);
  assert.match(page,/Approve create/);
  assert.match(page,/Ignore row/);
});

test("structured import is preferred while private scan fallback remains staged",()=>{
  assert.match(actions,/structured_import/);
  assert.match(actions,/document-intake-private/);
  assert.match(actions,/p_artifact_kind: "other"/);
  assert.match(actions,/p_document_type: adapter === "calendar" \? "calendar_source" : "printed_timetable"/);
  assert.match(page,/Structured import preferred/);
  assert.match(page,/Scan \/ OCR fallback/);
});
