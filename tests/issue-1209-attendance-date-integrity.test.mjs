import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildWeeklyAttendancePayload,
  dailyAttendanceViewIdentity,
  dailySubmissionViewError,
  weeklyAttendanceViewIdentity,
  weeklyCellForDate,
  weeklyRowsMatchDates,
  weeklySubmissionPeriodError,
} from "../src/features/attendance/attendance-date-integrity.ts";
import { getDailyRegisterExceptions, getVisibleDailyRegisterRows } from "../src/features/attendance/daily-register-view-state.ts";

const septemberDates = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"];
const octoberDates = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];
const cells = (dates) => dates.map((date) => ({ date, status: "present", reasonId: null, note: null }));
const row = (dates) => ({
  enrolmentId: "10000000-0000-4000-8000-000000000001",
  learnerId: "20000000-0000-4000-8000-000000000001",
  name: "Test Learner",
  admissionNumber: "TEST-001",
  sex: "female",
  days: cells(dates),
});

test("October draft rows cannot appear beneath September headers after week navigation", () => {
  const octoberIdentity = weeklyAttendanceViewIdentity({
    registerClassId: "30000000-0000-4000-8000-000000000001",
    weekStart: octoberDates[0],
    weekEnd: octoberDates[4],
    dates: octoberDates,
  });
  const septemberIdentity = weeklyAttendanceViewIdentity({
    registerClassId: "30000000-0000-4000-8000-000000000001",
    weekStart: septemberDates[0],
    weekEnd: septemberDates[4],
    dates: septemberDates,
  });

  assert.notEqual(octoberIdentity, septemberIdentity);
  assert.equal(weeklyRowsMatchDates([row(octoberDates)], septemberDates), false);
  assert.equal(weeklyCellForDate(row(octoberDates), "2026-09-16"), null);
  assert.equal(
    buildWeeklyAttendancePayload({
      dates: septemberDates,
      rows: [row(octoberDates)],
      nonTeachingDates: [],
      mutationIds: Object.fromEntries(septemberDates.map((date) => [date, crypto.randomUUID()])),
      submissionIds: {},
    }),
    null,
  );
});

test("Wednesday 16 September is the same header, editor cell and payload date", () => {
  const draft = row(septemberDates);
  const wednesday = weeklyCellForDate(draft, "2026-09-16");
  assert.equal(wednesday?.date, "2026-09-16");
  wednesday.status = "absent";
  wednesday.reasonId = "40000000-0000-4000-8000-000000000001";

  const payload = buildWeeklyAttendancePayload({
    dates: septemberDates,
    rows: [draft],
    nonTeachingDates: [],
    mutationIds: Object.fromEntries(septemberDates.map((date) => [date, crypto.randomUUID()])),
    submissionIds: {},
  });
  assert.ok(payload);
  const submittedWednesday = payload.find((day) => day.date === "2026-09-16");
  assert.equal(submittedWednesday?.date, wednesday.date);
  assert.deepEqual(submittedWednesday?.exceptions.map((item) => item.enrolment_id), [draft.enrolmentId]);
});

test("weekly server period validation rejects stale, duplicate and cross-week dates", () => {
  assert.equal(weeklySubmissionPeriodError({ weekStart: septemberDates[0], weekEnd: septemberDates[4], dates: septemberDates }), null);
  assert.match(weeklySubmissionPeriodError({ weekStart: septemberDates[0], weekEnd: septemberDates[4], dates: ["2026-09-16", "2026-10-07"] }), /do not match/);
  assert.match(weeklySubmissionPeriodError({ weekStart: septemberDates[0], weekEnd: septemberDates[4], dates: ["2026-09-16", "2026-09-16"] }), /do not match/);
  assert.match(weeklySubmissionPeriodError({ weekStart: "2026-09-15", weekEnd: "2026-09-19", dates: ["2026-09-16"] }), /week is invalid/);
});

test("daily navigation and class switches invalidate the prior draft identity", () => {
  const current = dailyAttendanceViewIdentity({ registerClassId: "class-a", attendanceDate: "2026-09-16", submissionId: null });
  assert.notEqual(current, dailyAttendanceViewIdentity({ registerClassId: "class-a", attendanceDate: "2026-09-17", submissionId: null }));
  assert.notEqual(current, dailyAttendanceViewIdentity({ registerClassId: "class-b", attendanceDate: "2026-09-16", submissionId: null }));
  assert.match(dailySubmissionViewError({ attendanceDate: "2026-10-07", viewAttendanceDate: "2026-09-16", registerClassId: "class-a", viewRegisterClassId: "class-a" }), /date changed/);
  assert.match(dailySubmissionViewError({ attendanceDate: "2026-09-16", viewAttendanceDate: "2026-09-16", registerClassId: "class-a", viewRegisterClassId: "class-b" }), /class changed/);
});

test("daily sorting and filtering preserve the same unsaved exception objects", () => {
  const rows = [
    { enrolmentId: "2", learnerId: "l2", name: "Zelda Test", admissionNumber: "2", sex: "female", status: "present", reasonId: null, note: null },
    { enrolmentId: "1", learnerId: "l1", name: "Andreas Test", admissionNumber: "1", sex: "male", status: "absent", reasonId: "reason-sick", note: "Unsaved" },
  ];
  const filtered = getVisibleDailyRegisterRows(rows, "andreas", "male", "desc");
  assert.equal(filtered[0], rows[1]);
  assert.deepEqual(getDailyRegisterExceptions(rows), [{ enrolment_id: "1", status: "absent", reason_id: "reason-sick", note: "Unsaved" }]);
});

test("client, server, offline and database boundaries enforce the date identity before persistence", () => {
  const weekly = readFileSync("src/features/attendance/weekly-register.tsx", "utf8");
  const weeklyAction = readFileSync("src/features/attendance/server/week-actions.ts", "utf8");
  const daily = readFileSync("src/features/attendance/daily-register.tsx", "utf8");
  const dailyAction = readFileSync("src/features/attendance/server/actions.ts", "utf8");
  const offlineRoute = readFileSync("src/app/api/offline/attendance/route.ts", "utf8");
  const migration = readFileSync("supabase/migrations/20261010120000_attendance_date_integrity.sql", "utf8");

  assert.match(weekly, /dates\.map\(\(date\) => renderDesktopCell\(row, date\)\)/);
  assert.doesNotMatch(weekly, /row\.days\.map\(\(cell\)/);
  assert.ok(weeklyAction.indexOf("weeklySubmissionPeriodError(") < weeklyAction.indexOf('supabase.rpc("submit_weekly_register"'));
  assert.match(daily, /draftMatchesView/);
  assert.ok(dailyAction.indexOf("dailySubmissionViewError(") < dailyAction.indexOf('supabase.rpc("submit_daily_register"'));
  assert.match(offlineRoute, /viewAttendanceDate/);
  assert.match(offlineRoute, /formData\.set\("source", "offline_sync"\)/);
  assert.match(migration, /v_existing\.attendance_date <> p_attendance_date/);
  assert.match(migration, /Attendance mutation identity does not match the register class and date/);
});
