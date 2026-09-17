import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const server = await readFile(new URL("../src/features/academics/server/lesson-preparation.ts", import.meta.url), "utf8");
const workspace = await readFile(new URL("../src/features/academics/lesson-preparation-workspace.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../src/app/teaching/preparation/page.tsx", import.meta.url), "utf8");

test("lesson preparation stays connected to schedule, pacing and curriculum registry", () => {
  assert.match(server, /teaching_schedule_items/);
  assert.match(server, /pacing_plan_items/);
  assert.match(server, /curriculum_units/);
  assert.match(server, /curriculum_objectives/);
  assert.match(server, /curriculum_competencies/);
  assert.doesNotMatch(server, /create table/i);
});

test("teacher preparation and governed HOD submission are separate actions", () => {
  assert.match(server, /saveLessonPreparation/);
  assert.match(server, /submitLessonPreparation/);
  assert.match(server, /\.rpc\("submit_preparations"/);
  assert.match(server, /p_lesson_preparation_ids: \[existing\.id\]/);
  assert.doesNotMatch(server, /\.update\(\{ status: "submitted"/);
  assert.match(workspace, /Save draft/);
  assert.match(workspace, /Mark prepared/);
  assert.match(workspace, /Submit to HOD/);
});

test("returned governed submission reopens teacher-owned preparation for revision", () => {
  assert.match(server, /preparation_submission_items/);
  assert.match(server, /preparation_submissions/);
  assert.match(server, /latestPreparationSubmissionStatus/);
  assert.match(server, /latestSubmissionStatus !== "returned"/);
  assert.match(server, /submissionStatus === "returned" \? "returned"/);
});

test("range preparation creates drafts without automatic submission", () => {
  assert.match(server, /prepareLessonRange/);
  assert.match(server, /status: "draft"/);
  assert.match(server, /Nothing was submitted/);
  assert.match(workspace, /One week/);
  assert.match(workspace, /Several weeks/);
  assert.match(workspace, /Whole term/);
});

test("planned preparation and retrospective actual teaching remain separate", () => {
  assert.match(server, /lesson_preparations/);
  assert.match(server, /teaching_actuals/);
  assert.match(server, /recordTeachingActual/);
  assert.match(workspace, /planned preparation and curriculum snapshot are not overwritten/i);
});

test("route excludes platform operational users and requires teacher scope", () => {
  assert.match(route, /context\.platformMemberships\.length/);
  assert.match(route, /teacher/);
  assert.match(route, /class_teacher/);
  assert.match(server, /platformMemberships\.length/);
  assert.match(server, /staff_member_id/);
});

test("submission keeps current-school and own-preparation checks before governed RPC", () => {
  assert.match(server, /ownedSchedule\(scheduleId\)/);
  assert.match(server, /schedule\.school_id !== scope\.membership\.schoolId/);
  assert.match(server, /existing\.prepared_by_user_id !== owned\.context\.user!\.id/);
  assert.match(server, /p_school_id: owned\.schedule\.school_id/);
});

test("curriculum gaps are shown as absent rather than fabricated", () => {
  assert.match(workspace, /No registry value available/);
  assert.match(workspace, /Not linked/);
  assert.match(server, /theme: unit\.theme \?\? null/);
  assert.match(server, /topic: unit\.topic \?\? null/);
});

test("low-bandwidth draft capture uses local browser storage", () => {
  assert.match(workspace, /localStorage\.getItem/);
  assert.match(workspace, /localStorage\.setItem/);
});