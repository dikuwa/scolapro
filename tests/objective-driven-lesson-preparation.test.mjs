import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const server = await read("src/features/academics/server/lesson-preparation.ts");
const workspace = await read("src/features/academics/lesson-preparation-workspace.tsx");
const queue = await read("src/features/academics/offline/lesson-preparation-queue.ts");
const route = await read("src/app/api/offline/lesson-preparation/route.ts");
const migration = await read("supabase/migrations/20260926070000_objective_driven_lesson_preparation.sql");

test("preparation identity is separated from delivery while preserving canonical tables", () => {
  assert.match(migration, /alter table public\.lesson_preparations/);
  assert.match(migration, /create table if not exists public\.lesson_preparation_deliveries/);
  assert.doesNotMatch(migration, /lesson_preparations_v2|lesson_preparation_plans/);
  assert.match(migration, /teaching_actuals remains the authoritative record/i);
});

test("specific objectives are binding and general objectives remain context", () => {
  assert.match(server, /selectedCompetencyIds/);
  assert.match(server, /Select at least one specific objective \/ basic competency/);
  assert.match(workspace, /General objectives provide context/);
  assert.match(workspace, /name="selectedCompetencyIds"/);
  assert.match(migration, /Selected lesson competency does not belong to the preparation curriculum unit/);
});

test("multi-session preparation can be reused without cross-completing deliveries", () => {
  assert.match(server, /reuseLessonPreparation/);
  assert.match(server, /lesson_preparation_deliveries/);
  assert.match(server, /sessionNumber/);
  assert.match(workspace, /Reuse this preparation/);
  assert.match(workspace, /Each delivery keeps its own taught status and reflection/);
  assert.match(server, /teaching_actuals/);
  assert.match(migration, /teaching_group_allocations/);
  assert.match(migration, /having count\(\*\)=1/);
});

test("reuse is bounded to the same subject offering and curriculum unit", () => {
  assert.match(server, /preparation\.subject_offering_id !== owned\.allocation\.subject_offering_id/);
  assert.match(server, /preparation\.curriculum_unit_id !== \(snapshot\.curriculumUnitId \?\? null\)/);
  assert.match(migration, /delivery scope or curriculum does not match the reusable preparation/);
});

test("offline draft metadata includes objective and session state", () => {
  assert.match(queue, /selectedCompetencyIds: string\[\]/);
  assert.match(queue, /sessionCount: number/);
  assert.match(route, /selectedCompetencyIds: z\.array/);
  assert.match(route, /sessionCount: z\.number/);
  assert.match(server, /p_curriculum_snapshot: \{ \.\.\.snapshot, selectedCompetencyIds, sessionCount \}/);
  assert.match(migration, /older queued payloads remain replay-compatible/i);
});

test("differentiation is a first-class editable preparation section", () => {
  assert.match(server, /"differentiation"/);
  assert.match(workspace, /Differentiation \/ learner support/);
});
