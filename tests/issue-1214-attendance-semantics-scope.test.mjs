import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isOfficiallyAbsent,
  isOfficiallyPresent,
  officialCaptureStatusOf,
} from "../src/features/attendance/server/official-semantics.ts";
import {
  canCaptureRegisterClass,
  canCaptureSubjectPeriod,
} from "../src/features/attendance/server/capture-scope.ts";

const assignedActor = {
  memberships: [{ schoolId: "school-a", roleKey: "class_teacher", staffMemberId: "staff-a" }],
  platformRoles: [],
};
const administrator = {
  memberships: [{ schoolId: "school-a", roleKey: "principal", staffMemberId: "staff-admin" }],
  platformRoles: [],
};

test("official daily semantics count absent and justified full-day absence as absent", () => {
  assert.equal(officialCaptureStatusOf("absent"), "absent");
  assert.equal(officialCaptureStatusOf("present"), "present");
  assert.equal(officialCaptureStatusOf("late"), "present");
  assert.equal(officialCaptureStatusOf("excused"), "absent");
  assert.equal(officialCaptureStatusOf("unknown"), null);
  assert.equal(isOfficiallyAbsent("excused"), true);
  assert.equal(isOfficiallyAbsent("late"), false);
  assert.equal(isOfficiallyPresent("late"), true);
});

test("register capture is assigned-class and school scoped with governed admin correction", () => {
  assert.equal(canCaptureRegisterClass(assignedActor, { schoolId: "school-a", registerTeacherStaffId: "staff-a" }), true);
  assert.equal(canCaptureRegisterClass(assignedActor, { schoolId: "school-a", registerTeacherStaffId: "staff-b" }), false);
  assert.equal(canCaptureRegisterClass(assignedActor, { schoolId: "school-b", registerTeacherStaffId: "staff-a" }), false);
  assert.equal(canCaptureRegisterClass(administrator, { schoolId: "school-a", registerTeacherStaffId: "staff-b" }), true);
});

test("subject capture requires the exact active teaching period allocation", () => {
  const scope = {
    schoolId: "school-a",
    allocatedStaffMemberId: "staff-a",
    allocationActiveFrom: "2026-01-01",
    allocationActiveTo: "2026-12-31",
    slotStatus: "active",
    isTeachingPeriod: true,
  };
  assert.equal(canCaptureSubjectPeriod(assignedActor, scope, "2026-10-10"), true);
  assert.equal(canCaptureSubjectPeriod(assignedActor, { ...scope, allocatedStaffMemberId: "staff-b" }, "2026-10-10"), false);
  assert.equal(canCaptureSubjectPeriod(assignedActor, { ...scope, schoolId: "school-b" }, "2026-10-10"), false);
  assert.equal(canCaptureSubjectPeriod(assignedActor, { ...scope, isTeachingPeriod: false }, "2026-10-10"), false);
  assert.equal(canCaptureSubjectPeriod(assignedActor, scope, "2027-01-01"), false);
});

test("new official class capture exposes Present and Absent while lesson history keeps operational statuses", () => {
  const daily = readFileSync("src/features/attendance/daily-register.tsx", "utf8");
  const weekly = readFileSync("src/features/attendance/weekly-register.tsx", "utf8");
  const subject = readFileSync("src/features/attendance/subject-period-register.tsx", "utf8");
  const offline = readFileSync("src/components/offline/offline-attendance-workspace.tsx", "utf8");
  const dailyRow = readFileSync("src/features/attendance/server/register.ts", "utf8");
  const weeklyRow = readFileSync("src/features/attendance/server/week.ts", "utf8");
  const dailyStatuses = daily.slice(daily.indexOf("const statuses ="), daily.indexOf("function statusClass"));
  const weeklyStatuses = weekly.slice(weekly.indexOf("const weeklyStatuses ="), weekly.indexOf("function shiftWeek"));
  const offlineStatuses = offline.slice(offline.indexOf("const statuses"), offline.indexOf("export function OfflineAttendanceWorkspace"));
  assert.match(dailyStatuses, /present/);
  assert.match(dailyStatuses, /absent/);
  assert.doesNotMatch(dailyStatuses, /late|excused/);
  assert.doesNotMatch(weeklyStatuses, /late|excused/);
  assert.doesNotMatch(offlineStatuses, /late|excused/);
  // The official row types cannot carry an operational status.
  assert.match(dailyRow, /status: OfficialAttendanceStatus;/);
  assert.match(weeklyRow, /status: OfficialAttendanceStatus;/);
  // Subject-period attendance keeps its full operational vocabulary.
  assert.match(subject, /late/);
  assert.match(subject, /excused/);
});

test("every server mutation rechecks scope before its RPC and offline replay uses the same action", () => {
  const dailyAction = readFileSync("src/features/attendance/server/actions.ts", "utf8");
  const weeklyAction = readFileSync("src/features/attendance/server/week-actions.ts", "utf8");
  const subjectAction = readFileSync("src/features/attendance/server/subject-actions.ts", "utf8");
  const offlineDaily = readFileSync("src/app/api/offline/attendance/route.ts", "utf8");
  const offlineSubject = readFileSync("src/app/api/offline/attendance/subject-period/route.ts", "utf8");

  assert.ok(dailyAction.indexOf("canCaptureRegisterClass(") < dailyAction.indexOf('supabase.rpc("submit_daily_register"'));
  assert.ok(weeklyAction.indexOf("canCaptureRegisterClass(") < weeklyAction.indexOf('supabase.rpc("submit_weekly_register"'));
  assert.ok(subjectAction.indexOf("canCaptureSubjectPeriod(") < subjectAction.indexOf('supabase.rpc("submit_subject_period_attendance"'));
  assert.ok(subjectAction.indexOf("ineligibleDailyAttendanceDate(") < subjectAction.indexOf('supabase.rpc("submit_subject_period_attendance"'));
  assert.match(offlineDaily, /submitDailyRegister/);
  assert.match(offlineDaily, /offline_sync/);
  assert.match(offlineSubject, /submitSubjectAttendance/);
  assert.match(offlineSubject, /offline_sync/);
});

test("database enforcement covers assigned registers, periods, dates and teaching groups", () => {
  const migration = readFileSync("supabase/migrations/20261010130000_attendance_capture_scope_semantics.sql", "utf8");
  assert.match(migration, /sm\.staff_member_id = rc\.register_teacher_staff_id/);
  assert.match(migration, /school_admin','principal','deputy_principal/);
  assert.doesNotMatch(migration, /has_school_role\(rc\.school_id,array\['school_admin','principal','deputy_principal','hod'/);
  assert.match(migration, /tp\.is_teaching_period/);
  assert.match(migration, /is_expected_school_day\(ts\.school_id,p_on_date\)/);
  assert.match(migration, /subject_attendance_enrolment_in_scope/);
  assert.match(migration, /teaching_group_memberships/);
});
