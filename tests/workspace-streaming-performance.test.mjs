import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const library = readFileSync("src/app/library/page.tsx", "utf8");

test("library returns authenticated shell before workspace data resolves", () => {
  assert.match(library, /<Suspense fallback=\{<WorkspaceLoading/);
  assert.match(library, /async function LibraryWorkspaceData/);
  const pageStart = library.indexOf("export default async function LibraryPage");
  const helperStart = library.indexOf("async function LibraryWorkspaceData");
  assert.equal(library.slice(pageStart, helperStart).includes("await getLibraryWorkspace"), false);
});

const attendance = readFileSync("src/app/attendance/page.tsx", "utf8");


test("attendance returns authenticated shell before register data resolves", () => {
  assert.match(attendance, /<Suspense fallback=\{<AttendanceLoading/);
  assert.match(attendance, /async function AttendanceWorkspaceData/);
  const pageStart = attendance.indexOf("export default async function AttendancePage");
  const helperStart = attendance.indexOf("async function AttendanceWorkspaceData");
  const critical = attendance.slice(pageStart, helperStart);
  assert.equal(critical.includes("await getDailyRegisterWorkspace"), false);
  assert.equal(critical.includes("await getWeeklyRegisterWorkspace"), false);
  assert.equal(critical.includes("await getAbsenceOverviewWorkspace"), false);
});
