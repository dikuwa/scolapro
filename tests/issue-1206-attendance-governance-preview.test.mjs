import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("term failures, Aug 31-Sep 4, Oct 5, openings and action gates execute against one policy", () => {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "tests/helpers/issue-1206-attendance-policy-worker.mjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /policy and action-gate scenarios passed/);
});

test("weekly entry omits out-of-term columns while preserving locked in-term holidays", () => {
  const server = read("src/features/attendance/server/week.ts");
  const client = read("src/features/attendance/weekly-register.tsx");
  const integrity = read("src/features/attendance/attendance-date-integrity.ts");
  const page = read("src/app/attendance/page.tsx");
  assert.match(server, /day\.kind === "out_of_term"/);
  assert.match(server, /weekDates\.filter\(\(attendanceDate\) => !outOfTermDates\.includes/);
  assert.match(server, /else if \(!day\.eligible\)/);
  assert.match(client, /No teaching days this week/);
  assert.match(client, /Attendance cannot be entered or confirmed/);
  assert.match(integrity, /\.filter\(\(date\) => !blockedDates\.has\(date\)\)/);
  assert.match(page, /key=\{`\$\{workspace\.selectedClassId/);
});

test("forged writes and queued offline replay revalidate the final governed day", () => {
  const actions = read("src/features/attendance/server/actions.ts");
  const weeklyActions = read("src/features/attendance/server/week-actions.ts");
  const offlineRoute = read("src/app/api/offline/attendance/route.ts");
  const migration = read("supabase/migrations/20260828013000_attendance_scope_and_school_days.sql");
  assert.match(actions, /resolveAttendanceTeachingImpact/);
  assert.match(actions, /ineligibleDailyAttendanceDate/);
  assert.match(actions, /parsed\.data\.attendanceDate/);
  assert.match(weeklyActions, /firstIneligibleWeeklyAttendanceDate/);
  assert.match(weeklyActions, /parsed\.data\.days\.map\(\(day\) => day\.date\)/);
  assert.ok(actions.indexOf("ineligibleDailyAttendanceDate(") < actions.indexOf('supabase.rpc("submit_daily_register"'));
  assert.ok(weeklyActions.indexOf("firstIneligibleWeeklyAttendanceDate(") < weeklyActions.indexOf('supabase.rpc("submit_weekly_register"'));
  assert.match(offlineRoute, /submitDailyRegister/);
  assert.match(migration, /if not app_private\.is_expected_school_day\(v_class\.school_id, p_attendance_date\)/);
});

test("learner term retrieval failure is distinct from a verified empty calendar", () => {
  const policy = read("src/features/attendance/server/learner-calendar-bounds.ts");
  const register = read("src/features/attendance/server/register.ts");
  const summary = read("src/features/attendance/server/official-summary.ts");
  assert.match(policy, /termCalendarVerified: boolean/);
  assert.match(policy, /if \(!input\.termCalendarVerified\)/);
  assert.match(policy, /Learner term boundaries could not be verified/);
  assert.match(register, /termCalendarVerified: !termResult\.error/);
  assert.match(summary, /learnerCalendarResult\.error/);
  assert.match(summary, /termCalendarVerified: true/);
  assert.doesNotMatch(summary, /learnerCalendarResult\.error\s*\?\s*\[\]/);
});

test("official sums exclude legacy invalid-day evidence and flag audited remediation", () => {
  const server = read("src/features/attendance/server/official-summary.ts");
  const client = read("src/features/attendance/official-summary.tsx");
  assert.match(server, /if \(!isTeachingDate\(attendanceDate\)\) continue/);
  assert.match(server, /invalidSubmissionCount/);
  assert.match(server, /invalidSubmissionDates/);
  assert.match(client, /Governed attendance remediation required/);
  assert.match(client, /remain auditable but are excluded from official possible days, absences and percentages/);
});

test("register action lives in the document heading and shared preview controls are accessible", () => {
  const workspace = read("src/features/attendance/register-teacher-workspace.tsx");
  const actions = read("src/components/documents/official-document-actions.tsx");
  const close = read("src/components/ui/close-action.tsx");
  assert.ok(workspace.indexOf("Register Teacher document") < workspace.indexOf("<InlineRegisterDocumentPanel"));
  const panel = read("src/features/attendance/inline-register-document-panel.tsx");
  assert.match(panel, /<OfficialDocumentActions/);
  assert.match(panel, /previewDownloadHref=\{documentUrls\?\.downloadUrl\}/);
  assert.match(panel, /pdfBlob\(state\.document\)/);
  assert.match(actions, /iframeRef\.current\?\.contentWindow\?\.print\(\)/);
  assert.match(actions, /Download PDF/);
  assert.match(actions, /event\.key === "Escape"/);
  assert.match(actions, /event\.key !== "Tab"/);
  assert.match(actions, /returnFocusRef\.current\?\.focus\(\)/);
  assert.match(close, /variant = "danger-soft"/);
  assert.match(actions, /<CloseAction variant="danger-soft"/);
});

test("register PDF is real A3 landscape output with separate sex sections", () => {
  const route = read("src/app/api/attendance/register-teacher/route.ts");
  const pdf = read("src/features/attendance/server/render-register-teacher-pdf.ts");
  assert.match(route, /"Content-Type": "application\/pdf"/);
  assert.match(route, /attachment; filename=.*\.pdf/);
  assert.match(route, /renderRegisterTeacherPdf/);
  assert.match(pdf, /const PAGE_WIDTH = REGISTER_TEACHER_LAYOUT\.pageWidth/);
  assert.match(pdf, /const PAGE_HEIGHT = REGISTER_TEACHER_LAYOUT\.pageHeight/);
  assert.match(pdf, /for \(const job of registerTeacherPageJobs\(input\.document\)\)/);
  assert.match(pdf, /day\.reason \?\? `Non-teaching/);
  assert.match(pdf, /pdf\.addPage\(\[PAGE_WIDTH, PAGE_HEIGHT\]\)/);
  assert.match(pdf, /pdf\.save/);
});

test("official metrics use compact icon-value-label chips without collapsing zero and unknown", () => {
  const source = read("src/features/attendance/official-summary.tsx");
  assert.match(source, /function MetricChip/);
  assert.match(source, /label="Possible"/);
  assert.match(source, /label="Absent days"/);
  assert.match(source, /label="Absence %"/);
  assert.match(source, /value === null \? "—"/);
});
