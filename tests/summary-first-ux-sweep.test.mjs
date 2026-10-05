import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("delegated responsibilities show current state before assignment controls", () => {
  const source = read("src/features/responsibilities/responsibilities-workspace.tsx");
  assert.ok(source.indexOf("Current responsibilities") < source.indexOf("Assign responsibility"));
  assert.match(source, /showAssignment/);
  assert.match(source, /aria-expanded={showAssignment}/);
  assert.match(source, /setOpen\(true\)/);
});

test("contributions show recorded history before the entry form", () => {
  const source = read("src/features/contributions/contribution-workspace.tsx");
  assert.ok(source.indexOf("Recent contributions") < source.indexOf("<form action={action}"));
  assert.match(source, /showRecord/);
  assert.match(source, /aria-expanded={showRecord}/);
});

test("finance shows payment state before record-payment entry", () => {
  const source = read("src/features/finance/finance-workspace.tsx");
  const workspace = source.slice(source.indexOf("export function FinanceWorkspace"));
  assert.ok(workspace.indexOf("Recent payments") < workspace.indexOf("Record received payment"));
  assert.match(workspace, /showRecordPayment/);
  assert.match(workspace, /aria-expanded={showRecordPayment}/);
});

test("assessment scheme configuration shows active and candidate state before creation controls", () => {
  const source = read("src/features/assessment/scheme-configuration-workspace.tsx");
  assert.ok(source.indexOf("Verification & publication") < source.indexOf("Extract from verified syllabus metadata"));
  assert.ok(source.indexOf("Verification & publication") < source.indexOf("Manual candidate"));
});

test("staff creation stays closed until explicitly requested", () => {
  const source = read("src/features/staff/single-staff-form.tsx");
  assert.match(source, /const \[open, setOpen\] = useState\(false\)/);
  assert.match(source, /aria-expanded={open}/);
  assert.match(source, /\{open \? <form action={action}/);
});

test("school settings keep detailed editors behind explicit actions", () => {
  const finance = read("src/features/finance/finance-workspace.tsx");
  const directory = read("src/features/school-directory/directory-contact-settings-panel.tsx");
  const statutory = read("src/features/statutory/school-statutory-profile-panel.tsx");
  const reporting = read("src/features/reporting/report-card-settings-panel.tsx");

  assert.match(finance, /Edit banking details/);
  assert.match(directory, /Edit contact/);
  assert.match(statutory, /Edit profile/);
  assert.match(reporting, /Edit document settings/);
  assert.match(reporting, /Manage subject rules/);
  assert.match(reporting, /documentOpen/);
  assert.match(reporting, /subjectsOpen/);
});

test("staff leave renders request/history state before request and governance forms", () => {
  const source = read("src/features/staff/leave/staff-leave-workspace.tsx");
  const workspace = source.slice(source.indexOf("export function StaffLeaveWorkspaceView"), source.indexOf("function LeaveRequestForm"));
  assert.ok(workspace.indexOf("School leave requests") < workspace.indexOf("My leave request"));
  assert.ok(workspace.indexOf("My leave request") < workspace.indexOf("<LeaveTypeForm"));
});

test("library circulation lists and filters loans before opening the issue form", () => {
  const source = read("src/features/library/library-workspace.tsx");
  const circulation = source.slice(source.indexOf("function Circulation"));
  const filters = circulation.indexOf("Circulation filters");
  const records = circulation.indexOf("Matching circulation records");
  const issueForm = circulation.indexOf("<form action={issueAction}");
  assert.ok(filters >= 0 && records > filters && issueForm > records);
  assert.match(circulation, /showIssue/);
  assert.match(circulation, /aria-expanded={showIssue}/);
});


test("national calendar baseline shows governed events before add-event controls", () => {
  const source = read("src/features/calendar/national-calendar-manager.tsx");
  assert.ok(source.indexOf("{year} baseline events") < source.indexOf("<form action={action}"));
  assert.match(source, /showAddEvent/);
  assert.match(source, /aria-expanded=\{showAddEvent\}/);
});


test("voluntary contributions page shows contribution state before campaign setup", () => {
  const source = read("src/app/school/contributions/page.tsx");
  assert.ok(source.indexOf("<ContributionWorkspace") < source.indexOf("<ContributionSetup"));
});
