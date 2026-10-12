import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

// Issue #1233 — Academic setup redesign.
//
// These tests lock the redesign contract: no duplicated editor, editors closed
// by default, every HOD scope visible, unassigned portfolios preserved, the
// leadership-only HOD boundary intact, compact activity date ranges, tabbed
// Grades/Classes management and unchanged Rooms & blocks behaviour.

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const page = read("src/app/school/setup/page.tsx");
const core = read("src/features/academics/academic-setup-core.tsx");
const forms = read("src/features/academics/structure-forms.tsx");
const hod = read("src/features/academics/hod-scope-configuration.tsx");
const cycle = read("src/features/timetable/timetable-cycle-settings.tsx");
const activities = read("src/features/calendar/department-activities-manager.tsx");
const rooms = read("src/features/timetable/room-management.tsx");
const hodActions = read("src/features/academics/server/hod-scope-actions.ts");
const hodQuery = read("src/features/academics/server/hod-scope.ts");
const classRows = read("src/features/academics/class-management.tsx");

// Execute the real formatter instead of asserting against its source text.
register("./tests/helpers/ts-server-loader.mjs", pathToFileURL(`${process.cwd()}/`).href);
const { formatActivityDateRange } = await import("@/features/calendar/activity-date-range.ts");

test("no duplicate Timetable Workflow or Calendar Anchor editor is rendered", () => {
  // Exactly one card per workflow in the core setup section.
  assert.equal((core.match(/title="Timetable workflow"/g) ?? []).length, 1);
  assert.equal((core.match(/title="Calendar anchor"/g) ?? []).length, 1);
  // The editors are in-card bodies: they never repeat a card heading, wrap
  // themselves in a second <section>, or add an unrelated editing column.
  assert.doesNotMatch(cycle, /<h[1-6][^>]*>\s*Timetable workflow/);
  assert.doesNotMatch(cycle, /<h[1-6][^>]*>\s*Calendar anchor/);
  assert.doesNotMatch(cycle, /<section/);
  assert.doesNotMatch(cycle, /scolapro-section-title/);
  assert.doesNotMatch(core, /xl:grid-cols-\[minmax\(20rem/);
  // The editor replaces the summary inside the same card.
  assert.match(core, /data-core-setup-content=\{active \? "editor" : "summary"\}/);
  assert.equal((core.match(/active \? editor : summary/g) ?? []).length, 1);
  // One editor instance each on the page.
  assert.equal((page.match(/<TimetableWorkflowSettings/g) ?? []).length, 1);
  assert.equal((page.match(/<TimetableCalendarAnchorSettings/g) ?? []).length, 1);
});

test("the academic summary shows four real-data metric cards and no duplicates", () => {
  for (const label of ["Configured grades", "Register classes", "Active HOD scopes", "Timetable workflow"]) {
    assert.equal((page.match(new RegExp(label, "g")) ?? []).length, 1, `expected exactly one "${label}" metric card`);
  }
  assert.match(page, /structure\.grades\.length/);
  assert.match(page, /structure\.classes\.length/);
  assert.match(page, /activeHodScopeCount/);
  assert.match(page, /timetableModeLabel/);
  // The metric counts distinct currently active portfolios, not subject rows.
  assert.match(hodQuery, /activeHodScopeCount/);
  assert.match(hodQuery, /portfolio\.appointments\.some/);
  assert.doesNotMatch(hodQuery, /responsibilities\.filter/);
  assert.match(page, /hodScope\.activeHodScopeCount/);
});

test("register class forms submit exactly one authoritative home room field", () => {
  // The shared Picker already emits its hidden input, so neither form adds its own.
  for (const source of [forms, classRows]) {
    assert.equal((source.match(/name="homeRoomId"/g) ?? []).length, 1);
    assert.doesNotMatch(source, /<input type="hidden" name="homeRoomId"/);
  }
  assert.match(forms, /label="Home room"/);
  assert.match(classRows, /label="Home room"/);
});

test("every configurable editor is closed by default", () => {
  assert.match(core, /useState<ActivePanel>\(null\)/);
  assert.match(hod, /useState<string \| null>\(null\)/);
  assert.match(hod, /useState\(false\)/);
  assert.match(forms, /useState<"grade" \| "class" \| null>\(null\)/);
  assert.match(activities, /useState<string\|null>\(null\)/);
  assert.match(activities, /useState\(false\)/);
});

test("all configured HOD scopes are listed without opening an editor", () => {
  assert.match(hod, /HOD teaching scope/);
  // The scope list renders every portfolio, not only the expanded one.
  assert.match(hod, /portfolios\.map\(\(portfolio\) => \(/);
  assert.doesNotMatch(hod, /openScopeId === portfolio\.id \? \(/);
  // Progressive, explicit per-scope actions.
  assert.match(hod, /Manage scope/);
  assert.match(hod, /Assign subjects/);
  assert.match(hod, /Change HOD/);
  assert.match(hod, /End responsibility/);
  // Compact subject-code badges instead of a large editable row per subject.
  assert.match(hod, /function SubjectBadges/);
  assert.match(hod, /aria-label="Portfolio subject codes"/);
  // The detailed editor only renders for the opened scope.
  assert.match(hod, /open=\{openScopeId === portfolio\.id\}/);
  assert.match(hod, /data-hod-scope-editor=\{portfolio\.id\}/);
  // Within an opened scope only one operation renders at a time.
  assert.match(hod, /operation=\{openScopeId === portfolio\.id \? openOperation : null\}/);
  assert.match(hod, /onToggleOperation=\{toggleOperation\}/);
  assert.match(hod, /operation === "assign" \? \(/);
  assert.match(hod, /operation === "change" \? \(/);
  assert.match(hod, /operation === "end" \? \(/);
});

test("HOD portfolios without an appointed HOD remain supported", () => {
  assert.match(hod, /Unassigned/);
  assert.match(hod, /function portfolioStatus/);
  assert.match(hod, /An unassigned portfolio grants no review authority/);
  assert.match(hod, /Create unassigned portfolio/);
});

test("HOD configuration keeps leadership-only authorization and no self-assignment", () => {
  assert.match(hodActions, /hasAnySchoolRole\(context\.memberships, schoolId, schoolLeadershipRoles\)/);
  assert.match(hodActions, /context\.platformMemberships\.length/);
  assert.doesNotMatch(hodActions, /roleKey === "hod"/);
  assert.match(hodActions, /HOD authority alone covers existing assigned subjects/);
  // Effective-dated history stays append/end rather than destructive.
  assert.doesNotMatch(hodActions, /\.delete\(/);
  assert.match(hodActions, /update\(\{ effective_to:/);
});

test("departmental activity dates format single, multi-day, cross-month and cross-year ranges", () => {
  assert.equal(formatActivityDateRange("2026-10-12", "2026-10-12"), "12 Oct 2026");
  assert.equal(formatActivityDateRange("2026-10-12", "2026-10-22"), "12–22 Oct 2026");
  assert.equal(formatActivityDateRange("2026-10-28", "2026-11-03"), "28 Oct – 3 Nov 2026");
  assert.equal(formatActivityDateRange("2026-12-28", "2027-01-05"), "28 Dec 2026 – 5 Jan 2027");
  // A missing or unusable end date never invents a range.
  assert.equal(formatActivityDateRange("2026-10-12", null), "12 Oct 2026");
  assert.equal(formatActivityDateRange("2026-10-12", ""), "12 Oct 2026");
  assert.equal(formatActivityDateRange("not-a-date", "2026-10-12"), "Date not set");
  // Impossible calendar dates and reversed ranges never invent a range.
  assert.equal(formatActivityDateRange("2026-02-30", "2026-03-02"), "Date not set");
  assert.equal(formatActivityDateRange("2026-10-12", "2026-02-30"), "12 Oct 2026");
  assert.equal(formatActivityDateRange("2026-10-22", "2026-10-12"), "22 Oct 2026");
  // The manager renders the shared formatter and keeps editing collapsed.
  assert.match(activities, /formatActivityDateRange\(event\.startsOn, event\.endsOn\)/);
  assert.doesNotMatch(activities, /dateFormatter/);
});

test("the combined Grade & Class card switches between Grades and Classes tabs", () => {
  assert.match(forms, /type GradeTab = "grade" \| "class"/);
  assert.match(forms, /useState<GradeTab>\("grade"\)/);
  assert.match(forms, /role="tablist"/);
  assert.match(forms, /role="tab"/);
  assert.match(forms, /aria-selected=\{tab === value\}/);
  assert.match(forms, /aria-controls=\{panelId\}/);
  assert.match(forms, /role="tabpanel"/);
  assert.match(forms, /id="grade-class-grades-panel"/);
  assert.match(forms, /id="grade-class-classes-panel"/);
  assert.match(forms, /view="grades"/);
  assert.match(forms, /view="classes"/);
  // One add/update control per entity: no duplicate add buttons or forms.
  assert.equal((forms.match(/Add \/ update grade/g) ?? []).length, 1);
  assert.equal((forms.match(/Add register class/g) ?? []).length, 1);
});

test("Rooms & blocks keep their bounded scrollable inventory behaviour", () => {
  assert.match(page, /<RoomManagement/);
  assert.match(rooms, /Rooms & blocks/);
  assert.match(rooms, /max-h-\[33rem\]/);
  assert.match(rooms, /overflow-y-auto/);
  assert.match(rooms, /Add room/);
  assert.match(rooms, /Pencil/);
  assert.match(rooms, /Trash2/);
});
