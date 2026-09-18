import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const route = await read("src/app/teaching/oversight/page.tsx");
const workspace = await read("src/features/teaching/hod-oversight-workspace.tsx");
const query = await read("src/features/teaching/server/hod-oversight.ts");
const migration = await read("supabase/migrations/20260918224000_hod_teaching_oversight_read_scope.sql");

test("HOD oversight is bounded to the governed HOD route and current review scope", () => {
  assert.match(route, /resolveReviewScope/);
  assert.match(route, /scope\.roleKey !== "hod"/);
  assert.match(route, /getGovernedAcademicYear/);
  assert.match(query, /scope\.roleKey !== "hod"/);
  assert.match(query, /resolve_hod_teaching_oversight/);
});

test("oversight reads canonical plan preparation submission and coverage stores only", () => {
  assert.match(migration, /public\.pacing_plans/);
  assert.match(migration, /public\.pacing_plan_items/);
  assert.match(migration, /public\.teaching_schedule_items/);
  assert.match(migration, /public\.preparation_submission_items/);
  assert.match(migration, /public\.preparation_submissions/);
  assert.match(migration, /public\.teaching_actuals/);
  assert.doesNotMatch(migration, /create table/i);
});

test("HOD role alone is no longer school-wide teaching-plan read authority", () => {
  assert.match(migration, /hod_responsible_for_subject/);
  const helper = migration.slice(
    migration.indexOf("create or replace function app_private.can_access_teaching_plan"),
    migration.indexOf("drop policy if exists \"scoped academic staff can read pacing plans\""),
  );
  assert.doesNotMatch(helper, /array\['school_admin','principal','deputy_principal','hod'\]/);
  assert.match(helper, /array\['school_admin','principal','deputy_principal'\]/);
});

test("workspace shows honest missing-data states and never scores or ranks teachers", () => {
  assert.match(workspace, /Missing evidence is shown as missing/);
  assert.match(workspace, /No connected plan items recorded/);
  assert.match(workspace, /No reviewed preparation evidence recorded/);
  assert.match(workspace, /No actual teaching evidence recorded/);
  assert.doesNotMatch(workspace, /score|ranking|ranked|productivity/i);
});

test("workspace is read-only and mobile-friendly", () => {
  assert.doesNotMatch(workspace, /<form|onClick|useActionState|\.update\(|\.insert\(|\.delete\(/);
  assert.match(workspace, /sm:grid-cols-2/);
  assert.match(workspace, /xl:grid-cols-4/);
  assert.doesNotMatch(workspace, /<table|overflow-x-auto/);
});
