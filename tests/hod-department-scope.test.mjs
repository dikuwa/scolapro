import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const migration = await read(
  "supabase/migrations/20260918205000_hod_department_scope_configuration.sql",
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
  assert.match(panel, /The HOD does not need to teach the subject/);
  assert.match(panel, /suggestions only/);
});
