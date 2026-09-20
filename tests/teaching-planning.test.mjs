import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const actions = await read('src/features/teaching/server/planning-actions.ts');
const workspace = await read('src/features/teaching/planning-workspace.tsx');
const picker = await read('src/components/ui/picker.tsx');
const route = await read('src/app/teaching/planning/page.tsx');
const teachingPage = await read('src/app/teaching/page.tsx');
const queries = await read('src/features/teaching/server/queries.ts');
const migration = await read(
  'supabase/migrations/20260918140000_teaching_planning_authoring_authority.sql',
);
const dbTest = await read(
  'supabase/tests/teaching_planning_authoring_authority_test.sql',
);

test('planning authoring writes only the canonical connected plan chain', () => {
  for (const table of [
    'pacing_plans',
    'pacing_plan_items',
    'teaching_schedule_items',
    'subject_offerings',
    'register_classes',
    'teacher_allocations',
    'curriculum_units',
  ]) {
    assert.match(actions, new RegExp(`"${table}"`), `authoring must use ${table}`);
  }
  // No parallel plan store and no bypass through an ungoverned RPC.
  assert.doesNotMatch(actions, /create table/i);
  assert.doesNotMatch(actions, /\.rpc\(/);
  assert.doesNotMatch(workspace, /create table/i);
  assert.doesNotMatch(workspace, /localStorage/);
});

test('tenant_id is never derived from school_id', () => {
  // A plan takes its tenant from the offering row; children take it from the plan.
  assert.match(actions, /tenant_id: offering\.tenant_id/);
  assert.match(actions, /tenant_id: plan\.tenant_id/);
  assert.doesNotMatch(actions, /tenant_id:\s*\w+\.school_id/);
  assert.doesNotMatch(actions, /tenant_id:\s*scope\.schoolId/);
});

test('academic year comes from governed academic-year context', () => {
  assert.match(actions, /getGovernedAcademicYear/);
  assert.match(route, /getGovernedAcademicYear/);
  assert.match(teachingPage, /getGovernedAcademicYear/);
  assert.doesNotMatch(actions, /getFullYear/);
  assert.doesNotMatch(route, /getFullYear/);
  assert.doesNotMatch(teachingPage, /getFullYear/);
  // The plan inherits the offering's governed year and children inherit the plan's.
  assert.match(actions, /academic_year: offering\.academic_year/);
  assert.match(actions, /academic_year: plan\.academic_year/);
});

test('the governed academic-year rule has exactly one implementation', async () => {
  const reporting = await read('src/features/reporting/server/report-card-academic-year.ts');
  const calendar = await read('src/features/calendar/server/calendar.ts');
  // The calendar feature owns academic_years and is the only implementation.
  assert.match(calendar, /export async function getGovernedAcademicYear/);
  assert.match(calendar, /from\("academic_years"\)/);
  // Reporting delegates to it rather than reimplementing the same precedence,
  // which would be a second source of truth for the school's academic year.
  assert.doesNotMatch(reporting, /from\("academic_years"\)/);
  assert.match(reporting, /getGovernedAcademicYear as getReportCardAcademicYear/);
});

test('official curriculum registry content stays read-only', () => {
  assert.doesNotMatch(actions, /from\("curriculum_(subjects|versions|objectives|competencies|practicals|sources)"\)/);
  assert.doesNotMatch(actions, /curriculum_units"\)[\s\S]{0,80}?\.(insert|update|delete|upsert)/);
  assert.doesNotMatch(workspace, /curriculum_(subjects|versions|objectives|competencies)/);
  assert.doesNotMatch(migration, /insert into public\.curriculum_/);
  assert.doesNotMatch(migration, /update public\.curriculum_/);
});

test('HOD planning authority is delegated to the governed department predicate', () => {
  // The boundary must be a current-school predicate bounded by the existing
  // subject department responsibility, not role_key='hod' alone.
  assert.match(migration, /can_author_teaching_plan/);
  assert.match(migration, /user_current_school_matches/);
  assert.match(migration, /hod_responsible_for_subject/);
  assert.match(migration, /owns_current_teacher_allocation/);
  assert.match(migration, /staff_member_has_school_assignment/);
  // Schedule writes are bounded by allocation ownership, not by the membership
  // role label, so the working lesson-preparation writer keeps its authority
  // for an HOD who is also the allocated teacher while the school-wide HOD
  // shortcut is gone.
  assert.match(migration, /schedule-write ownership/i);
  assert.doesNotMatch(migration, /sm\.role_key in \('teacher','class_teacher'\)\s*\n\s*and ta\.active_from/);
  // The read boundary is not redefined here; only the leaked FOR ALL path goes.
  assert.match(migration, /legitimate read path is untouched/);
  // Role-key checks in the application may only shape messaging: the SQL
  // predicate is the enforcement point, so the action layer must say so.
  assert.match(actions, /real boundary is the/);
});

test('national_baseline plans are refused for school actors and never offered', () => {
  assert.match(actions, /National baseline plans are authored at platform level/);
  assert.match(migration, /p_plan_level in \('department','class'\)/);
  assert.doesNotMatch(workspace, /national_baseline/);
});

test('plan, item and schedule scope is validated against the current school', () => {
  assert.match(actions, /\.eq\("school_id", scope\.schoolId\)/);
  assert.match(actions, /school_id: offering\.school_id/);
  assert.match(actions, /school_id: plan\.school_id/);
  assert.match(actions, /curriculum_version_id !== offering\.curriculum_version_id/);
  assert.match(actions, /curriculum_version_id !== plan\.curriculum_version_id/);
  assert.match(actions, /registerClass\.academic_year !== plan\.academic_year/);
  assert.match(actions, /registerClass\.grade_id !== offering\.grade_id/);
  assert.match(actions, /\.eq\("status", "active"\)/);
  assert.match(actions, /allocation\.subject_offering_id !== plan\.subject_offering_id/);
  assert.match(actions, /allocation\.register_class_id !== parsed\.data\.registerClassId/);
});

test('teacher allocation effective dates are validated before scheduling', () => {
  assert.match(actions, /parsed\.data\.plannedOn < allocation\.active_from/);
  assert.match(actions, /allocation\.active_to && parsed\.data\.plannedOn > allocation\.active_to/);
  assert.match(actions, /not currently effective/);
  // Defence in depth: the database refuses it too.
  assert.match(migration, /enforce_teaching_schedule_allocation_window/);
  assert.match(migration, /lesson date is outside the teacher allocation window/);
});

test('changing schedule status never invents a move date', () => {
  assert.doesNotMatch(actions, /moved_to_date:[^\n]*new Date/);
  assert.doesNotMatch(actions, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  // The move date is explicit input and is required when moving.
  assert.match(actions, /Choose the date the lesson is moved to/);
  assert.match(actions, /updates\.moved_to_date = parsed\.data\.movedToDate/);
});

test('plan provenance is preserved on the acting user', () => {
  assert.match(actions, /created_by_user_id: scope\.userId/);
  assert.match(actions, /userId: context\.user\.id/);
  // Root scope is immutable by trigger, so authoring must not attempt to rewrite it.
  assert.doesNotMatch(actions, /\.update\(\{[^}]*curriculum_unit_id/);
  assert.doesNotMatch(actions, /\.update\(\{[^}]*pacing_plan_id/);
});

test('Platform Support gains no planning authority anywhere', () => {
  assert.match(actions, /context\.platformMemberships\.length/);
  assert.doesNotMatch(actions, /platform_support/);
  assert.doesNotMatch(workspace, /platform_support/);
  assert.match(route, /context\.platformMemberships\.length/);
  assert.doesNotMatch(migration, /platform_support/);
});

test('the planning route stays thin with no query logic of its own', () => {
  assert.match(route, /getTeachingPlanningData/);
  assert.doesNotMatch(route, /createSupabaseServerClient/);
  assert.doesNotMatch(route, /\bfrom\(/);
  assert.doesNotMatch(route, /\.select\(/);
  assert.doesNotMatch(route, /new Map\(/);
  assert.match(route, /planningRoles/);
  assert.match(route, /redirect/);
});

test('the authoring read model lives in the shared server module', () => {
  assert.match(queries, /export async function getTeachingPlanningData/);
  assert.match(queries, /getTeachingWorkspace\(\{/);
  assert.match(queries, /export type TeachingPlanningData/);
});

test('Issue #591 scopes the offering selector to active canonical offerings', () => {
  assert.match(queries, /from\("subject_offerings"\)/);
  assert.match(queries, /\.eq\("school_id", input\.schoolId\)/);
  assert.match(queries, /\.eq\("academic_year", input\.academicYear\)/);
  assert.match(queries, /\.eq\("status", "active"\)/);
  assert.match(queries, /includeConfiguredOfferings: true/);
  assert.match(queries, /planningOfferings/);
  assert.match(queries, /Never manufacture a catalogue-only placeholder option/);
  assert.match(queries, /Unable to load subject offerings/);
  assert.match(queries, /Unable to load HOD subject scope/);
  assert.match(queries, /subject_department_responsibilities/);
  assert.match(queries, /staffMemberId/);
  assert.match(queries, /grade_id/);
  assert.match(workspace, /data\.planningOfferings\.map/);
  assert.match(workspace, /new Set\(allocationClasses\)/);
  assert.match(workspace, /classOptionsForOffering/);
  assert.match(workspace, /label="Subject offering"[\s\S]*?searchable/);
  assert.match(picker, /max-h-60 overflow-auto/);
});

test('the internal row helper is not exported for route-local duplication', () => {
  assert.doesNotMatch(queries, /export function one/);
  assert.doesNotMatch(route, /\bone\s*\(/);
  assert.doesNotMatch(route, /function one/);
  assert.doesNotMatch(route, /TeachingUnitOption|PlanningClassOption|PlanningPlanSummary/);
});

test('every field the server reads exists as a named control in the UI', () => {
  const keys = new Set(
    [...actions.matchAll(/(?:text|formText|formInteger)\(form,\s*"([^"]+)"\)/g)].map(
      (match) => match[1],
    ),
  );
  assert.ok(keys.size >= 15, `expected the authoring forms to read many fields, saw ${keys.size}`);
  for (const key of keys) {
    assert.match(
      workspace,
      new RegExp(`name="${key}"`),
      `the UI must submit a control named ${key} or the server reads nothing`,
    );
  }
});

test('the workspace uses shared control primitives with pending states', () => {
  assert.match(workspace, /from "@\/components\/ui\/picker"/);
  assert.match(workspace, /from "@\/components\/ui\/date-field"/);
  assert.match(workspace, /from "@\/components\/ui\/number-stepper"/);
  assert.match(workspace, /from "@\/components\/ui\/button"/);
  assert.match(workspace, /<Picker/);
  assert.match(workspace, /<DateField/);
  assert.match(workspace, /<NumberStepper/);
  // Every async action advertises its pending state through the shared Button.
  assert.match(workspace, /loading=\{planPending\}/);
  assert.match(workspace, /loading=\{itemPending\}/);
  assert.match(workspace, /loading=\{editPending\}/);
  assert.match(workspace, /loading=\{lessonPending\}/);
  assert.match(workspace, /loading=\{lessonStatusPending\}/);
  assert.match(workspace, /loading=\{statusPending\}/);
  assert.doesNotMatch(workspace, /Loader2/);
  // No raw browser select control in a core workflow.
  assert.doesNotMatch(workspace, /<select/);
});

test('the migration narrows the legacy write policies and adds the allocation window', () => {
  for (const legacy of [
    'academic leaders can manage pacing plans',
    'academic leaders can manage pacing plans [insert]',
    'academic leaders can manage pacing items',
    'scoped staff can manage teaching schedule',
  ]) {
    assert.match(
      migration,
      new RegExp(`drop policy if exists "${legacy.replace(/[[\]]/g, '\\$&')}"`),
      `the over-broad policy ${legacy} must be dropped`,
    );
  }
  assert.match(migration, /for insert\s+to authenticated/);
  assert.match(migration, /for update\s+to authenticated/);
  assert.match(migration, /for delete\s+to authenticated/);
  // The read boundary is deliberately untouched.
  assert.match(migration, /Historical rows and provenance triggers are untouched/);
  assert.doesNotMatch(migration, /drop policy if exists "scoped academic staff can read pacing plans"/);
  assert.doesNotMatch(migration, /drop policy if exists "scoped staff can read teaching schedule"/);
  // Execution grants follow the existing anon/authenticated boundary.
  assert.match(migration, /revoke all on function app_private\.can_author_teaching_plan\(uuid,uuid,text\) from public, anon/);
  assert.match(migration, /grant execute on function app_private\.can_author_teaching_plan\(uuid,uuid,text\) to authenticated/);
  // The business-critical narrowing that protects the existing
  // lesson-preparation writer must be recorded, not incidental.
  assert.match(migration, /lesson-preparation\.ts records prepared\/taught/);
  assert.match(migration, /strict narrowing/);
});

test('a database regression test guards the authority boundary', () => {
  assert.match(dbTest, /select plan\(30\)/);
  assert.match(dbTest, /national_baseline/);
  assert.match(dbTest, /HOD cannot author another department subject plan/);
  assert.match(dbTest, /no department responsibility has no planning authority/);
  assert.match(dbTest, /non-current school membership cannot author this school plan/);
  assert.match(dbTest, /Platform Support gains no teaching-plan authoring authority/);
  assert.match(dbTest, /lesson date is outside the teacher allocation window/);
  assert.match(dbTest, /HOD cannot schedule lessons on another department plan/);
  assert.match(dbTest, /an HOD who owns the allocation still schedules outside their department responsibility/);
  assert.match(dbTest, /records prepared status exactly as lesson-preparation\.ts does/);
  assert.match(dbTest, /HOD cannot read another department plan merely because they hold the HOD role/);
  assert.match(dbTest, /no longer leak reads to a non-current school membership/);
  assert.match(dbTest, /over-broad legacy planning write policies are gone/);
  assert.match(dbTest, /rollback;/);
});
