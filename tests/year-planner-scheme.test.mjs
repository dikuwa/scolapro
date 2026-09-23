import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const migration = await read("supabase/migrations/20260923120000_year_planner_scheme_workspace.sql");
const actions = await read("src/features/teaching/server/planning-actions.ts");
const queries = await read("src/features/teaching/server/queries.ts");
const workspace = await read("src/features/teaching/planning-workspace.tsx");
const documentQuery = await read("src/features/teaching/server/teaching-plan-document.ts");
const html = await read("src/features/teaching/server/render-teaching-plan-html.ts");
const pdf = await read("src/features/teaching/server/render-teaching-plan-pdf.ts");
const route = await read("src/app/api/official-documents/teaching-plan/route.ts");

test("the canonical plan identity stays subject + grade + academic year", () => {
  assert.match(migration, /shared subject\/grade\/year plan/i);
  assert.match(migration, /pacing_plans_one_live_department_plan_idx/);
  assert.match(migration, /where plan_level = 'department' and status in \('draft', 'active'\)/);
  assert.match(migration, /p_plan_level = 'department'/);
  assert.match(migration, /teacher_allocations ta[\s\S]*ta\.subject_offering_id = p_subject_offering_id/);
  assert.doesNotMatch(migration, /create table if not exists public\.(year_plans|schemes_of_work)/);
  assert.match(workspace, /Shared subject\/grade plan/);
  assert.match(workspace, /Explicit class pacing variant/);
});

test("current allocation authority is enforced at database and application boundaries", () => {
  assert.match(migration, /user_current_school_matches/);
  assert.match(migration, /staff_member_has_school_assignment/);
  assert.match(migration, /ta\.active_from <= current_date/);
  assert.match(migration, /ta\.active_to is null or ta\.active_to >= current_date/);
  assert.match(migration, /not app_private\.has_platform_role\(array\['platform_support'\]\)/);
  assert.match(queries, /row\.staff_member_id === input\.staffMemberId/);
  assert.match(queries, /teacherOfferingIds/);
  assert.match(actions, /Teachers author the shared subject and grade plan/);
});

test("curriculum text remains read-only while teacher planning fields are mutable", () => {
  assert.doesNotMatch(actions, /curriculum_(units|objectives|competencies)"\)\.(insert|update|delete|upsert)/);
  assert.match(actions, /academic_term_id/);
  assert.match(actions, /completed_on/);
  assert.match(actions, /sequence_number/);
  assert.match(actions, /planned_start_on/);
  assert.match(actions, /planned_end_on/);
});

test("local events are plan annotations and do not duplicate calendar impact", () => {
  assert.match(migration, /create table if not exists public\.pacing_plan_events/);
  assert.match(migration, /do not alter the authoritative school calendar/i);
  assert.doesNotMatch(actions, /school_day_overrides/);
  assert.doesNotMatch(migration, /insert into public\.school_day_overrides/);
  assert.match(queries, /Unable to load local planning events/);
});

test("year planner and scheme expose the required columns from one read model", () => {
  for (const label of ["Term", "Week", "Date range", "Topic / Topic No.", "General Objective", "Teacher planning note / event", "Specific Objectives / Basic Competencies", "Planned Date", "Completed Date"]) {
    assert.match(html, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(documentQuery, /curriculum_objectives/);
  assert.match(documentQuery, /curriculum_competencies/);
  assert.match(documentQuery, /pacing_plan_events/);
  assert.match(documentQuery, /teacher_allocations/);
});

test("preview print and PDF use dedicated A4 output with repeated headers", () => {
  assert.match(workspace, /> Preview</);
  assert.match(workspace, /> Print</);
  assert.match(workspace, /> PDF</);
  assert.match(html, /OFFICIAL_DOCUMENT_A4_PAGE_RULE/);
  assert.match(html, /OFFICIAL_DOCUMENT_PRINT_RULE/);
  assert.match(html, /window\.print/);
  assert.match(pdf, /addPage/);
  assert.match(pdf, /Page/);
  assert.match(pdf, /input\.document\.events/);
  assert.match(pdf, /Planning events and notes/);
  assert.match(route, /Content-Type": "application\/pdf"/);
  assert.match(route, /Cache-Control": "private, no-store/);
  assert.doesNotMatch(html, /AppShell|TeachingWorkspace|PlanningWorkspace/);
});

test("the output route refuses platform context and resolves plans per current school", () => {
  assert.match(route, /context\.platformMemberships\.length/);
  assert.match(route, /getTeachingPlanDocument\(membership\.schoolId, planId\)/);
  assert.match(documentQuery, /\.eq\("school_id", schoolId\)/);
  assert.match(route, /not found in your current governed scope/);
});
