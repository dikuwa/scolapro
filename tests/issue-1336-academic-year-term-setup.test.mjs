import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const page = await readFile(`${root}/src/app/school/setup/page.tsx`, "utf8");
const workspace = await readFile(`${root}/src/features/academics/server/academic-calendar.ts`, "utf8");
const actions = await readFile(`${root}/src/features/academics/server/academic-calendar-actions.ts`, "utf8");
const editor = await readFile(`${root}/src/features/academics/academic-calendar-setup.tsx`, "utf8");

test("academic setup renders the governed calendar workspace", () => {
  assert.match(page, /getAcademicCalendarWorkspace/);
  assert.match(page, /<AcademicCalendarSetup/);
  assert.match(workspace, /from\("academic_years"\)/);
  assert.match(workspace, /from\("academic_terms"\)/);
});

test("calendar mutations use canonical RPCs and preserve lifecycle boundaries", () => {
  assert.match(actions, /rpc\("configure_academic_year"/);
  assert.match(actions, /rpc\("configure_academic_term"/);
  assert.match(actions, /closed academic year is final/i);
  assert.match(actions, /within the configured academic year/);
  assert.match(actions, /previous configured term ends/);
  assert.match(actions, /next configured term starts/);
});

test("term editor can update an existing term and refresh the governed list", () => {
  assert.match(editor, /existingTerms\.find/);
  assert.match(editor, /router\.refresh\(\)/);
  assert.match(editor, /Cancel/);
});
