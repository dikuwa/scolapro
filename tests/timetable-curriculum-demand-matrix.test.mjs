import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261002153500_timetable_curriculum_demand_matrix.sql", "utf8");
const server = readFileSync("src/features/timetable/server/workspace.ts", "utf8");
const component = readFileSync("src/features/timetable/curriculum-demand-matrix.tsx", "utf8");
const workspace = readFileSync("src/features/timetable/timetable-workspace.tsx", "utf8");
const page = readFileSync("src/app/timetable/page.tsx", "utf8");

test("demand matrix derives scheduled counts from canonical active timetable slots", () => {
  assert.match(migration, /from public\.timetable_slots ts/);
  assert.match(migration, /join current_allocations ca[\s\S]*ca\.teacher_allocation_id=ts\.teacher_allocation_id/);
  assert.match(migration, /ts\.status='active'/);
  assert.match(migration, /ta\.active_from<=p_as_of/);
  assert.match(migration, /ta\.active_to is null or ta\.active_to>=p_as_of/);
  assert.doesNotMatch(migration, /add column scheduled_periods/i);
  assert.doesNotMatch(migration, /create table .*demand/i);
});

test("double-period validation uses actual ordered timetable structure and non-overlapping pairs", () => {
  assert.match(migration, /row_number\(\) over\([\s\S]*order by tp\.period_number,tp\.id/);
  assert.match(migration, /pp\.is_teaching_period/);
  assert.match(migration, /period_position[\s\S]*row_number\(\) over/);
  assert.match(migration, /floor\(cr\.run_length::numeric\/2\)/);
  assert.doesNotMatch(migration, /period_number\s*\+\s*1/);
});

test("demand matrix preserves exact-cycle official resolver states", () => {
  for (const state of ["aligned","under_scheduled","over_scheduled","school_override","source_missing","cycle_variant_missing","source_conflict","constraint_warning"]) {
    assert.match(migration, new RegExp(`'${state}'`));
  }
  assert.match(migration, /resolve_optional_curriculum_time_allocation/);
  assert.match(migration, /v_cycle_kind/);
  assert.match(migration, /v_cycle_length/);
  assert.match(migration, /No verified official allocation exists for this exact/);
  assert.match(migration, /Multiple applicable official allocations conflict; governance review is required/);
  assert.match(migration, /class_target_periods_per_cycle>pc\.class_capacity_periods_per_cycle/);
  assert.match(migration, /max_double_periods_per_cycle/);
  assert.match(migration, /pre_generation_warnings/);
  assert.match(migration, /allocation_origin<>'school_configured'/);
});

test("workspace loads the governed demand read model with the same school/year/as-of scope", () => {
  assert.match(server, /get_timetable_curriculum_demand_matrix/);
  assert.match(server, /p_school_id:\s*schoolId/);
  assert.match(server, /p_academic_year:\s*academicYear/);
  assert.match(server, /p_as_of:\s*today/);
  assert.match(server, /preGenerationWarnings/);
  assert.match(server, /classCapacityPeriodsPerCycle/);
  assert.match(server, /demand:/);
});

test("existing timetable workspace renders summary-first responsive demand UI", () => {
  assert.match(workspace, /CurriculumDemandMatrix/);
  assert.match(workspace, /workspace\.demand/);
  assert.match(component, /Curriculum demand/);
  assert.match(component, /Official\/source coverage/);
  assert.match(component, /Targets satisfied/);
  assert.match(component, /Rule warnings/);
  assert.match(component, /Official/);
  assert.match(component, /School target/);
  assert.match(component, /Scheduled/);
  assert.match(component, /Before generation/);
  assert.match(component, /lg:grid-cols-2/);
  assert.match(component, /Warnings inform planning; they do not silently rewrite or block the timetable/);
  assert.match(page, /context\.currentSchoolMembership/);
  assert.match(page, /primaryMembership && allowedRoles\.has\(primaryMembership\.roleKey\)/);
  assert.match(page, /"school_admin", "principal", "deputy_principal", "hod"/);
  assert.match(migration, /sm\.role_key in \('school_admin','principal','deputy_principal','hod'\)/);
  assert.match(migration, /raise exception 'Permission denied'/);
});
