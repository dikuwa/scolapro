import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261002175000_teaching_planning_capacity.sql", "utf8");
const queries = readFileSync("src/features/teaching/server/queries.ts", "utf8");
const workspace = readFileSync("src/features/teaching/planning-workspace.tsx", "utf8");
const component = readFileSync("src/features/teaching/planning-capacity-summary.tsx", "utf8");

test("planning capacity uses the canonical date-to-timetable-day resolver", () => {
  assert.match(migration, /public\.resolve_timetable_day\(/);
  assert.match(migration, /from generate_series\(\s*v_year_start,\s*v_year_end/);
  assert.match(migration, /cd\.timetable_day=ts\.weekday/);
  assert.match(migration, /cd\.school_date>=ta\.active_from/);
  assert.doesNotMatch(migration, /periods_per_cycle\s*\*\s*weeks/i);
  assert.doesNotMatch(migration, /school_target_periods_per_cycle\s*\*/i);
});

test("planning capacity remains a read model over existing timetable and pacing stores", () => {
  assert.match(migration, /from public\.pacing_plans pp/);
  assert.match(migration, /from public\.pacing_plan_items ppi/);
  assert.match(migration, /join public\.timetable_slots ts/);
  assert.match(migration, /tp\.is_teaching_period/);
  assert.doesNotMatch(migration, /create table/i);
  assert.doesNotMatch(migration, /insert into public\.(pacing|teaching|timetable)/i);
});

test("capacity separates expected, planned and remaining opportunities", () => {
  assert.match(migration, /year_expected_opportunities/);
  assert.match(migration, /year_planned_periods/);
  assert.match(migration, /year_remaining_capacity/);
  assert.match(migration, /future_expected_opportunities/);
  assert.match(migration, /outstanding_planned_periods/);
  assert.match(migration, /future_remaining_capacity/);
  assert.match(migration, /term_capacity/);
});

test("planning server combines capacity with existing timetable demand for leadership exceptions", () => {
  assert.match(queries, /get_teaching_planning_capacity/);
  assert.match(queries, /get_timetable_curriculum_demand_matrix/);
  assert.match(queries, /hodExceptions/);
  assert.match(queries, /planningOfferings/);
  assert.match(queries, /No teacher ranking or productivity score/i);
});

test("planning workspace is summary-first and shows no productivity score", () => {
  assert.match(workspace, /PlanningCapacitySummary/);
  assert.match(workspace, /data\.capacityRows/);
  assert.match(component, /Planning capacity/);
  assert.match(component, /Expected year/);
  assert.match(component, /Year remaining/);
  assert.match(component, /Future remaining/);
  assert.match(component, /HOD \/ leadership exceptions/);
  assert.match(component, /no teacher ranking or productivity score/i);
  assert.match(component, /periods per cycle × weeks/);
});
