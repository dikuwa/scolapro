import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const migration = await read(
  "supabase/migrations/20260918205000_hod_department_scope_configuration.sql",
);
const portfolioMigration = await read(
  "supabase/migrations/20260919143000_hod_subject_portfolio_label.sql",
);
const query = await read("src/features/academics/server/hod-scope.ts");
const actions = await read("src/features/academics/server/hod-scope-actions.ts");
const panel = await read("src/features/academics/hod-scope-configuration.tsx");
const setup = await read("src/app/school/setup/page.tsx");
const planning = await read(
  "supabase/migrations/20260918140000_teaching_planning_authoring_authority.sql",
);
const architecture = await read(
  "docs/11-roadmap/2026-09-18-HOD-DEPARTMENT-SCOPE-ARCHITECTURE.md",
);

test("HOD scope configuration keeps subject responsibilities as the single authority source", () => {
  assert.match(query, /subject_department_responsibilities/);
  assert.match(actions, /subject_department_responsibilities/);
  assert.match(planning, /hod_responsible_for_subject/);
  assert.doesNotMatch(migration, /create table .*department/i);
  assert.match(architecture, /single authorization source/i);
  assert.match(architecture, /new canonical named-department table is \*\*not justified/i);
});

test("configuration is separate from HOD operational authority", () => {
  assert.match(actions, /school_admin/);
  assert.match(actions, /principal/);
  assert.doesNotMatch(actions, /roleKey === "hod"/);
  assert.match(actions, /context\.platformMemberships\.length/);
  assert.match(migration, /user_current_school_matches/);
  assert.doesNotMatch(migration, /platform_support/);
});

test("responsibility history is append/end rather than destructive", () => {
  assert.match(migration, /preserve_subject_department_responsibility_provenance/);
  assert.match(migration, /Only effective_to may change/);
  assert.match(actions, /update\(\{ effective_to:/);
  assert.doesNotMatch(actions, /\.delete\(/);
  assert.match(panel, /Historical provenance is retained|historical provenance/i);
});

test("school setup exposes the bounded configuration surface", () => {
  assert.match(setup, /HodScopeConfiguration/);
  assert.match(setup, /getHodScopeConfiguration/);
  assert.match(panel, /HOD teaching scope/);
  assert.match(panel, /the HOD does not need to teach the subject/i);
  assert.match(panel, /suggestions only/);
});

test("Issue #574 uses a searchable multi-subject portfolio editor", () => {
  assert.match(panel, /SearchableSelect/);
  assert.match(panel, /multiple/);
  assert.match(panel, /selectedValues=\{selectedSubjectIds\}/);
  assert.match(panel, /onToggle=\{/);
  assert.match(panel, /Search subjects/);
  assert.match(panel, /selectedSubjectIds/);
  assert.match(panel, /name="subjectIds"/);
  assert.match(panel, /Remove \$\{subject\.name\}/);
  assert.match(panel, /Save subject portfolio/);
  assert.match(actions, /save_hod_subject_portfolio/);
  assert.match(panel, /departmentLabel/);
  assert.match(portfolioMigration, /department_label/);
  assert.match(portfolioMigration, /descriptive only/);
});

test("shared searchable select exposes an explicit multi-select interaction", async () => {
  const select = await read("src/components/ui/searchable-select.tsx");
  assert.match(select, /multiple\?: boolean/);
  assert.match(select, /aria-multiselectable=\{multiple \|\| undefined\}/);
  assert.match(select, /selectedValues\.length/);
  assert.match(select, /onToggle\?\.\(option\.value\)/);
  assert.match(select, /setOpen\(true\)/);
});

test("Issue #574 portfolio metadata does not replace subject-based authority", () => {
  assert.match(portfolioMigration, /subject_department_responsibilities/);
  assert.match(portfolioMigration, /p_subject_ids/);
  assert.match(portfolioMigration, /user_current_school_matches/);
  assert.match(portfolioMigration, /has_school_role/);
  assert.match(portfolioMigration, /school_admin','principal','deputy_principal/);
  assert.match(portfolioMigration, /tenant_id/);
  assert.match(portfolioMigration, /on conflict \(school_id, subject_id, department_head_staff_assignment_id, effective_from\)/);
  assert.match(portfolioMigration, /effective_to = excluded\.effective_to/);
  assert.doesNotMatch(portfolioMigration, /create table .*department/i);
  assert.doesNotMatch(portfolioMigration, /platform_support/);
});
