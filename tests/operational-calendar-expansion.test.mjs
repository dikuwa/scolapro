import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

const calendarPage = read("src/app/calendar/page.tsx");
const dashboard = read("src/app/page.tsx");
const manager = read("src/features/calendar/operational-calendar-manager.tsx");
const actions = read("src/features/calendar/server/actions.ts");
const queries = read("src/features/calendar/server/operational-calendar.ts");
const ocr = read("src/features/imports/server/calendar-ocr.ts");
const intakeActions = read("src/features/imports/server/operational-intake-actions.ts");
const intakePage = read("src/app/school/imports/operations/page.tsx");
const migration = read("supabase/migrations/20261006195000_operational_calendar_expansion.sql");
const docs = read("docs/06-workflows/OPERATIONAL-CALENDAR.md");

test("calendar workspace separates official day metadata from operational events", () => {
  assert.match(calendarPage, /OperationalCalendarManager/);
  assert.match(manager, /Official school calendar/);
  assert.match(manager, /School & department events/);
  assert.match(manager, /Resolved \/ published learner days/);
  assert.match(manager, /Learner school-day effect/);
  assert.match(manager, /No school-day change/);
  assert.match(manager, /Department events can never change learner school-day status/);
});

test("official published totals remain validation targets while resolved days drive registers", () => {
  assert.match(migration, /official_learner_day_count/);
  assert.match(migration, /app_private\.is_expected_school_day/);
  assert.match(migration, /target_date between term\.starts_on and term\.ends_on/);
  assert.match(migration, /school_day_overrides/);
  assert.match(migration, /resolve_learner_event_teaching_impact/);
  assert.match(docs, /published learner days/);
  assert.match(docs, /resolved learner days/);
  assert.match(docs, /5 October/);
});

test("HOD calendar authority is derived from governed subject responsibility and cannot close school", () => {
  assert.match(migration, /can_manage_department_calendar/);
  assert.match(migration, /subject_department_responsibilities/);
  assert.match(migration, /Department events cannot change learner school-day status/);
  assert.match(manager, /CASS marks submission due/);
  assert.match(manager, /Department \/ HOD portfolio/);
  assert.match(actions, /scopeKind==="department"&&value\.learnerDayEffect!=="UNCHANGED"/);
});

test("teachers receive compact upcoming school and department events", () => {
  assert.match(dashboard, /Upcoming/);
  assert.match(dashboard, /getUpcomingOperationalCalendarEvents/);
  assert.match(dashboard, /Relevant school and department dates for the next 30 days/);
  assert.match(queries, /list_my_operational_calendar_events/);
  assert.match(migration, /department_staff/);
  assert.match(migration, /specific_teacher/);
});

test("calendar OCR is optional, source-bounded and review-only", () => {
  assert.match(manager, /Import \/ OCR/);
  assert.match(ocr, /Use only information visibly present in the source/);
  assert.match(ocr, /Use NO_TEACHING only when the visible source explicitly says school holiday/);
  assert.match(ocr, /image_url/);
  assert.match(intakeActions, /extractCalendarScan/);
  assert.match(intakeActions, /calendar_target: "operational"/);
  assert.match(intakeActions, /stage_operational_intake_rows/);
  assert.match(intakePage, /Extract events with OCR/);
  assert.match(intakePage, /OCR is optional; extracted rows remain drafts until reviewed and committed/);
  assert.match(migration, /calendar_target/);
  assert.match(migration, /create_operational_calendar_event/);
});

test("source-backed 2026 Namib High official calendar metadata is explicit", () => {
  assert.match(migration, /2026-01-08/);
  assert.match(migration, /2026-05-29/);
  assert.match(migration, /2026-09-03/);
  assert.match(migration, /2026-04-03/);
  assert.match(migration, /2026-04-06/);
  assert.match(migration, /2026-10-05/);
  assert.match(migration, /International Teacher''s Day/);
  assert.match(migration, /jsonb_build_array\(75,59,65\)/);
  assert.match(migration, /learner_total_days',199/);
});
