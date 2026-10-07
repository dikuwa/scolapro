import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

const migration = read("supabase/migrations/20261006212006_operational_calendar_expansion.sql");
const refinementMigration = read("supabase/migrations/20261007141000_calendar_learner_boundary_refinement.sql");
const adjustmentMigration = read("supabase/migrations/20261007143000_calendar_adjustment_provenance_delete.sql");
const impactManager = read("src/features/calendar/teaching-impact-manager.tsx");
const teachingImpactQuery = read("src/features/calendar/server/teaching-impact.ts");
const manager = read("src/features/calendar/operational-calendar-manager.tsx");
const actions = read("src/features/calendar/server/actions.ts");
const queries = read("src/features/calendar/server/operational-calendar.ts");
const ocr = read("src/features/imports/server/calendar-ocr.ts");
const intake = read("src/features/imports/server/operational-intake-actions.ts");
const intakePage = read("src/app/school/imports/operations/page.tsx");
const calendarPage = read("src/app/calendar/page.tsx");
const dashboard = read("src/app/page.tsx");
const attendanceDoc = read("docs/06-workflows/ATTENDANCE-ENGINE.md");
const calendarDoc = read("docs/06-workflows/OPERATIONAL-CALENDAR.md");
const planningDoc = read("docs/05-curriculum/TEACHING-PLANNING-ENGINE.md");

test("operational calendar keeps official metadata separate from resolved school days", () => {
  assert.ok(migration.includes("academic_term_calendar_profiles"));
  assert.ok(migration.includes("teacher_starts_on date"));
  assert.ok(migration.includes("official_learner_day_count integer"));
  assert.ok(migration.includes("list_academic_term_calendar_summary"));
  assert.ok(migration.includes("app_private.is_expected_school_day"));
  assert.ok(manager.includes("Resolved / published learner days"));
  assert.ok(manager.includes("Attendance uses the resolved"));
});

test("2026 supplied official source seeds learner-day validation and explicit closures", () => {
  assert.ok(migration.includes("when 1 then 75 when 2 then 59 when 3 then 65"));
  assert.ok(migration.includes("2026-01-08"));
  assert.ok(migration.includes("2026-05-29"));
  assert.ok(migration.includes("2026-09-03"));
  assert.ok(migration.includes("2026-10-05"));
  assert.ok(migration.includes("School Holiday - International Teacher''s Day"));
  assert.ok(migration.includes("'learner_total_days',199"));
});

test("school activities are informational by default and department events cannot close registers", () => {
  assert.ok(actions.includes("learnerDayEffect: z.enum(learnerDayEffects)"));
  assert.ok(actions.includes('value.scopeKind==="department"&&value.learnerDayEffect!=="UNCHANGED"'));
  assert.ok(actions.includes("Department events cannot change learner school-day status."));
  assert.ok(manager.includes("No school-day change"));
  assert.ok(manager.includes("Default for meetings, activities and deadlines"));
  assert.ok(migration.includes("Department events cannot change learner school-day status"));
});

test("HOD department events are constrained by governed subject responsibility", () => {
  assert.ok(migration.includes("can_manage_department_calendar"));
  assert.ok(migration.includes("subject_department_responsibilities"));
  assert.ok(migration.includes("Target teacher is outside this governed department"));
  assert.ok(manager.includes("CASS/target-mark submissions and class visits"));
  assert.ok(queries.includes("list_my_operational_calendar_events"));
});

test("staff dashboard exposes a compact scoped upcoming calendar feed", () => {
  assert.ok(dashboard.includes("Upcoming"));
  assert.ok(dashboard.includes("getUpcomingOperationalCalendarEvents"));
  assert.ok(queries.includes("list_my_operational_calendar_events"));
  assert.ok(calendarPage.includes("School / department events"));
});

test("manual event entry and optional OCR intake share human review guardrails", () => {
  assert.ok(manager.includes("Add event"));
  assert.ok(manager.includes("Import / OCR"));
  assert.ok(intakePage.includes("Scan / OCR fallback"));
  assert.ok(intakePage.includes("OCR is optional"));
  assert.ok(ocr.includes("Never invent dates, times, audiences, closures, policy or event text."));
  assert.ok(ocr.includes("Default teachingImpact to NORMAL."));
  assert.ok(ocr.includes("Use NO_TEACHING only when the visible source explicitly says school holiday"));
  assert.ok(intake.includes("reviewable+calendar+rows"));
  assert.ok(migration.includes("Every operational intake row requires a human review decision"));
});

test("calendar documentation defines the shared attendance and planning contract", () => {
  assert.match(calendarDoc, /event existing on a date does not make that date a school day or a non-school day/i);
  assert.match(calendarDoc, /Published day counts are stored independently from resolved operational day counts/i);
  assert.match(calendarDoc, /Department events \*\*cannot alter learner school-day status\*\*/);
  assert.match(calendarDoc, /OCR output is staging evidence, never authoritative data before human review/);
  assert.match(attendanceDoc, /canonical operational-calendar contract/);
  assert.match(planningDoc, /Department\/HOD calendar/);
});


test("learner boundaries govern operational activity while teacher dates remain administrative", () => {
  assert.match(refinementMigration, /p_learner_starts_on date/);
  assert.match(refinementMigration, /p_learner_ends_on date/);
  assert.match(refinementMigration, /p_teacher_starts_on date default null/);
  assert.match(refinementMigration, /update public\.academic_years/);
  assert.match(calendarDoc, /teacher opening\/closing dates are stored separately as administrative duty\/leave metadata/);
  assert.match(calendarDoc, /registers do not open before learner term opening or after learner term closing/);
});

test("calendar correction keeps baseline evidence and exposes school-level exceptions", () => {
  assert.match(impactManager, /Calendar adjustments & exceptions/);
  assert.match(impactManager, /without deleting the national\/public baseline/);
  assert.match(calendarDoc, /school-level adjustment changes the effective learner day/);
});


test("calendar correction deletion restores official provenance instead of destroying it", () => {
  assert.match(adjustmentMigration, /baseline_is_school_day/);
  assert.match(adjustmentMigration, /baseline_reason/);
  assert.match(adjustmentMigration, /baseline_source/);
  assert.match(adjustmentMigration, /baseline_teaching_impact/);
  assert.match(adjustmentMigration, /v_result:='restored_baseline'/);
  assert.match(adjustmentMigration, /calendar\.teaching_impact\.removed/);
  assert.match(actions, /remove_school_teaching_day_adjustment/);
  assert.match(calendarDoc, /deleting the correction restores that official baseline/);
});

test("official calendar rows are visibly distinct from deletable school adjustments", () => {
  assert.match(teachingImpactQuery, /source,baseline_source/);
  assert.match(impactManager, /isOfficialBaseline/);
  assert.match(impactManager, /isSchoolAdjustment/);
  assert.match(impactManager, /Correct/);
  assert.match(impactManager, /Delete/);
  assert.match(impactManager, /calendar-adjustments/);
});
