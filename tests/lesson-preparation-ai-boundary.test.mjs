import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const adapter = await read("src/features/academics/server/lesson-preparation-ai.ts");
const route = await read("src/app/api/teaching/lesson-preparation/ai/route.ts");
const workspace = await read("src/features/academics/lesson-preparation-workspace.tsx");
const env = await read(".env.example");

test("lesson AI adapter is provider-neutral and disabled when unconfigured", () => {
  assert.match(adapter, /SCOLAPRO_AI_BASE_URL/);
  assert.match(adapter, /SCOLAPRO_AI_API_KEY/);
  assert.match(adapter, /SCOLAPRO_AI_MODEL/);
  assert.match(adapter, /LessonAiUnavailableError/);
  assert.match(env, /No provider is assumed/);
});

test("AI prompt binds selected competencies and treats general objectives as context only", () => {
  assert.match(adapter, /selected specific objectives\/basic competencies are binding targets/i);
  assert.match(adapter, /General objectives are context only/i);
  assert.match(adapter, /Do not invent official syllabus text/i);
  assert.match(route, /selectedCompetencyIds: z\.array\(z\.string\(\)\.uuid\(\)\)\.min\(1\)/);
  assert.match(route, /Selected competency is outside this curriculum unit/);
});

test("AI drafting revalidates current teacher scope server-side", () => {
  assert.match(route, /teacherRoles/);
  assert.match(route, /schedule\.school_id !== membership\.schoolId/);
  assert.match(route, /staff_member_id", staff\.id/);
  assert.match(route, /Lesson is outside your current teaching allocation/);
});

test("teacher can draft, regenerate, shorten and make sections practical", () => {
  assert.match(workspace, /draftSection/);
  assert.match(workspace, /"regenerate"/);
  assert.match(workspace, /"shorten"/);
  assert.match(workspace, /"practical"/);
  assert.match(workspace, /AI suggestion inserted as an editable draft/);
});

test("obsolete curriculum reuse is surfaced before submission", () => {
  assert.match(workspace, /Curriculum update detected/);
  assert.match(workspace, /Review the selected competencies before reuse or submission/);
});
