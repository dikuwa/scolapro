import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20261011140000_calendar_governance_interaction_refinement.sql");
const manager = read("src/features/calendar/operational-calendar-manager.tsx");
const officialManager = read("src/features/calendar/teaching-impact-manager.tsx");
const departmentManager = read("src/features/calendar/department-activities-manager.tsx");
const actions = read("src/features/calendar/server/actions.ts");
const queries = read("src/features/calendar/server/operational-calendar.ts");
const calendarPage = read("src/app/calendar/page.tsx");
const setupPage = read("src/app/school/setup/page.tsx");
const oversightPage = read("src/app/teaching/oversight/page.tsx");
const teachingPage = read("src/app/teaching/page.tsx");

test("closed-term corrections are metadata-only, authorized and audited", () => {
  assert.match(migration, /correct_operational_term_calendar_source/);
  assert.match(migration, /Closed academic year is final/);
  assert.match(migration, /school_admin','principal','deputy_principal/);
  assert.match(migration, /calendar\.term_source\.corrected/);
  assert.doesNotMatch(migration.match(/create or replace function public\.correct_operational_term_calendar_source[\s\S]*?end;\n\$\$;/)?.[0] ?? "", /update public\.academic_terms/);
  assert.match(actions, /correctTermCalendarSource/);
  assert.match(manager, /phase === "Closed"/);
  assert.match(manager, /Save source/);
});

test("school event revisions and cancellations are append-only", () => {
  assert.match(migration, /revise_operational_calendar_event/);
  assert.match(migration, /cancel_operational_calendar_event/);
  assert.match(migration, /v_prior\.id,'active'/);
  assert.match(migration, /v_prior\.id,'cancelled'/);
  assert.doesNotMatch(migration, /delete from public\.operational_calendar_events/i);
  assert.match(actions, /reviseOperationalCalendarEvent/);
  assert.match(actions, /cancelOperationalCalendarEvent/);
  assert.match(manager, /editingEventId === event\.id/);
});

test("calendar separates informational school events from official dates", () => {
  assert.match(queries, /event\.scopeKind === scopeKind/);
  assert.match(queries, /event\.learnerDayEffect === "UNCHANGED"/);
  assert.match(queries, /!event\.linkedLearnerEventId/);
  assert.match(manager, />School events</);
  assert.doesNotMatch(manager, />School & department events</);
  assert.match(officialManager, /Official calendar & adjustments/);
  assert.doesNotMatch(officialManager, /Term milestones/);
  assert.doesNotMatch(officialManager, /Baseline and school overlay/);
  assert.doesNotMatch(officialManager, /Calendar adjustments & exceptions/);
  assert.match(officialManager, /deduplicatedEvents/);
  assert.match(calendarPage, />School events</);
});

test("event term membership is derived and compact", () => {
  assert.match(manager, /function eventTermLabel/);
  assert.match(manager, /Outside configured terms/);
  assert.match(manager, /Terms \$\{overlapping\[0\]\.termNumber\}–/);
  assert.match(manager, /bg-brand-soft/);
  assert.match(departmentManager, /function termLabel/);
});

test("department activities live on governed teaching surfaces", () => {
  assert.match(setupPage, /DepartmentActivitiesManager/);
  assert.match(oversightPage, /DepartmentActivitiesManager/);
  assert.match(teachingPage, /DepartmentActivitiesManager/);
  assert.match(oversightPage, /scopeKind: "department"/);
  assert.match(teachingPage, /canManage=\{false\}/);
  assert.match(migration, /can_manage_department_calendar/);
});

test("active term uses brand background with explicit white foreground", () => {
  assert.match(manager, /active \? "bg-brand text-white"/);
  assert.doesNotMatch(manager, /text-primary-foreground/);
});

test("initial official lists are bounded and forms unmount when closed", () => {
  assert.match(officialManager, /officialEntries\.slice\(0, 8\)/);
  assert.match(officialManager, /adjustmentTarget\?\.key !== key/);
  assert.doesNotMatch(officialManager, /aria-hidden=\{!adjustmentTarget\}/);
});

test("official calendar corrections stay attached to the selected row", () => {
  assert.match(officialManager, /relatedOverrides/);
  assert.match(officialManager, /adjustmentForm\(entry\.key\)/);
  assert.match(officialManager, /schoolCorrections\.map\(\(item\) => adjustmentForm/);
  assert.match(officialManager, /A correction stays attached to the date it changes/);
  assert.match(officialManager, /id="official-calendar"/);
});
