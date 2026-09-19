import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const page = await read("src/app/school/absence-reviews/page.tsx");
const workspace = await read("src/features/attendance/absence-review-workspace.tsx");
const server = await read("src/features/attendance/server/absence-review-workspace.ts");
const loading = await read("src/app/school/absence-reviews/loading.tsx");
const error = await read("src/app/school/absence-reviews/error.tsx");
const migration = await read("supabase/migrations/20260919071000_absence_review_class_teacher_placement.sql");

test("daily and subject-period absence remain independent authoritative views and counts", () => {
  assert.match(workspace, /view === "daily" \? workspace\.daily : workspace\.subjectPeriod/);
  assert.match(workspace, /Official daily absences/);
  assert.match(workspace, /Subject-period absences/);
  assert.match(server, /dailyAbsences: daily\.length/);
  assert.match(server, /subjectPeriodAbsences: subjectPeriod\.length/);
  assert.match(server, /dailyByLearnerDate/);
  assert.match(server, /dailyStatus:/);
  assert.doesNotMatch(server, /daily\.push\([^)]*subject|subjectPeriod\.push\([^)]*daily/i);
});

test("guardian notices contextualize absence without mutating attendance", () => {
  assert.match(page, /never rewrite the official register automatically/);
  assert.match(workspace, /Accepted notices do not alter attendance/);
  assert.match(server, /guardian_absence_notices/);
  assert.doesNotMatch(server, /guardian_absence_notices[\s\S]{0,120}\.(update|insert|upsert|delete)\(/);
  assert.doesNotMatch(server, /(daily_register_current|subject_attendance_current)[\s\S]{0,120}\.(update|insert|upsert|delete)\(/);
});

test("late-arrival and detention remain outside the absence-review workspace", () => {
  for (const source of [page, workspace, server]) {
    assert.doesNotMatch(source, /late_arrival|late-arrival|detention_session|detention_obligation/i);
  }
});

test("Platform Support and stale class-teacher placement are explicitly denied", () => {
  assert.match(page, /platformMemberships\.some\(\(membership\) => membership\.roleKey === "platform_support"\)/);
  assert.match(migration, /pm\.role_key = 'platform_support'/);
  assert.match(migration, /staff_member_has_school_assignment\(staff\.id, p_school_id, v_today\)/);
});

test("loading, error and empty states are explicit", () => {
  assert.match(loading, /RouteLoadingIndicator/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(error, /Absence reviews could not load/);
  assert.match(error, /No attendance or guardian notice was changed/);
  assert.match(workspace, /No absences match these filters/);
  assert.match(workspace, /Try a different date range or clear learner, grade, class and review-state filters/);
});

test("filter controls preserve separate subject-only filtering", () => {
  assert.match(workspace, /query\.set\("subject", next\.subjectOfferingId\)/);
  assert.match(workspace, /=== "subject"/);
  assert.match(workspace, /subjectOfferingId: undefined/);
  assert.match(server, /!filters\.subjectOfferingId \|\| row\.subjectOfferingId === filters\.subjectOfferingId/);
});

test("responsive source contract stacks at phone width and expands at tablet/desktop breakpoints", () => {
  assert.match(workspace, /sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(workspace, /lg:grid-cols-\[minmax\(12rem,1fr\)_minmax\(12rem,\.8fr\)_minmax\(13rem,1fr\)\]/);
  assert.match(workspace, /lg:grid-cols-\[minmax\(12rem,1fr\)_minmax\(12rem,1fr\)_minmax\(13rem,1fr\)\]/);
  assert.doesNotMatch(workspace, /<table|overflow-x-auto|min-w-\[\d/);
});
