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


const teaching = readFileSync("src/app/teaching/page.tsx", "utf8");
test("teaching returns shell before governed workspace data resolves", () => {
  assert.match(teaching, /<Suspense fallback=\{<TeachingWorkspaceLoading/);
  assert.match(teaching, /async function TeachingWorkspaceData/);
  const pageStart = teaching.indexOf("export default async function TeachingPage");
  const helperStart = teaching.indexOf("async function TeachingWorkspaceData");
  const critical = teaching.slice(pageStart, helperStart);
  assert.equal(critical.includes("await getGovernedAcademicYear"), false);
  assert.equal(critical.includes("await getTeachingWorkspace"), false);
});

const learners = readFileSync("src/app/learners/page.tsx", "utf8");
test("learner directory streams after authenticated shell", () => {
  assert.match(learners, /<Suspense fallback=\{<LearnerDirectoryLoading/);
  assert.match(learners, /async function LearnerDirectoryData/);
  const pageStart = learners.indexOf("export default async function LearnersPage");
  const helperStart = learners.indexOf("async function LearnerDirectoryData");
  const critical = learners.slice(pageStart, helperStart);
  assert.equal(critical.includes("await listLearnerDirectoryPage"), false);
  assert.equal(critical.includes("await getRegistrationOptions"), false);
});

const staff = readFileSync("src/app/staff/page.tsx", "utf8");
test("staff directory streams after authenticated shell", () => {
  assert.match(staff, /<Suspense fallback=\{<StaffDirectoryLoading/);
  assert.match(staff, /async function StaffDirectoryData/);
  const pageStart = staff.indexOf("export default async function StaffPage");
  const helperStart = staff.indexOf("async function StaffDirectoryData");
  assert.equal(staff.slice(pageStart, helperStart).includes("await getSchoolStaffDirectory"), false);
});

const home = readFileSync("src/app/page.tsx", "utf8");
test("home shell and greeting render before dashboard overview data", () => {
  assert.match(home, /<Suspense fallback=\{<DashboardOverviewLoading/);
  assert.match(home, /async function HomeOverviewData/);
  const pageStart = home.indexOf("export default async function Home");
  const helperStart = home.indexOf("async function HomeOverviewData");
  const critical = home.slice(pageStart, helperStart);
  assert.equal(critical.includes("await getDashboardOverview"), false);
  assert.equal(critical.includes("await getPlatformTenants"), false);
});
