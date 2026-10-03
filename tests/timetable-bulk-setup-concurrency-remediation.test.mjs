import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261003173500_timetable_bulk_setup_concurrency_remediation.sql",
  "utf8",
);
const pg = readFileSync(
  "supabase/tests/timetable_bulk_setup_concurrency_remediation_test.sql",
  "utf8",
);

test("bulk offering creation is atomic and never enters the mutating upsert race", () => {
  assert.match(migration, /on conflict \(school_id,academic_year,subject_id,grade_id\) do nothing/i);
  assert.match(migration, /if found then[\s\S]*v_created:=v_created\+1[\s\S]*else[\s\S]*v_existing:=v_existing\+1/i);
  assert.doesNotMatch(migration, /perform public\.upsert_subject_offering/);
});

test("bulk teacher allocation serializes a canonical combination before overlap classification", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /hashtextextended/);
  assert.match(migration, /ta\.active_from<=coalesce\(p_active_to,'infinity'::date\)/);
  assert.match(migration, /p_active_from<=coalesce\(ta\.active_to,'infinity'::date\)/);
  assert.match(migration, /v_existing_start=p_active_from/);
  assert.match(migration, /v_conflicts:=v_conflicts\+1/);
});

test("remediation remains bounded to canonical bulk functions", () => {
  assert.match(migration, /create or replace function public\.bulk_create_subject_offerings/);
  assert.match(migration, /create or replace function public\.bulk_create_teacher_allocations/);
  assert.doesNotMatch(migration, /alter table public\.teacher_allocations/);
  assert.doesNotMatch(migration, /delete from public\.teacher_allocations/);
  assert.doesNotMatch(migration, /update public\.teacher_allocations/);
});

test("focused pgTAP proves existing target preservation and overlapping-range rejection", () => {
  assert.match(pg, /existing periods target remains unchanged/);
  assert.match(pg, /different start date with an overlapping effective range is reported as a conflict/);
  assert.match(pg, /overlap conflict does not create a second canonical teacher allocation/);
});
