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
const migration = read("supabase/migrations/20261006212006_operational_calendar_expansion.sql");
const refinementMigration = read("supabase/migrations/20261007141000_calendar_learner_boundary_refinement.sql");
const adjustmentMigration = read("supabase/migrations/20261007143000_calendar_adjustment_provenance_delete.sql");
const impactManager = read("src/features/calendar/teaching-impact-manager.tsx");
const teachingImpactQuery = read("src/features/calendar/server/teaching-impact.ts");
const docs = read("docs/06-workflows/OPERATIONAL-CALENDAR.md");

test("calendar workspace separates official day metadata from operational events", () => {
  assert.match(calendarPage, /OperationalCalendarManager/);
  assert.match(manager, /Academic terms & official calendar/);
  assert.match(manager, /visibleEvents\.map/);
  assert.match(manager, /View all/);
  assert.match(manager, /School & department events/);
  assert.match(manager, /Resolved \/ published learner days/);
  assert.match(manager, /Learner school-day effect/);
  assert.match(manager, /No school-day change/);
  assert.match(manager, /Department events can never change learner school-day status/);
});

test("official published totals remain validation targets while resolved days drive registers", () => {
  assert.match(migration, /official_learner_day_count/);
  assert.match(migration, /app_private\.is_expected_school_day/);
  assert.match(migration, /target_date between active_term\.starts_on and active_term\.ends_on/);
  assert.match(migration, /configured_term\.academic_year_id=year\.id/);
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


test("learner term boundaries are first-class editable operational dates", () => {
  assert.match(manager, /Learner opening/);
  assert.match(manager, /Learner closing/);
  assert.match(manager, /Learner dates are operational/);
  assert.match(manager, /activeTermId/);
  assert.match(manager, /ring-\[color:var\(--brand-soft\)\]/);
  assert.doesNotMatch(manager, /hover:underline/);
  assert.match(actions, /configure_operational_term_calendar/);
  assert.match(actions, /p_learner_starts_on/);
  assert.match(actions, /p_learner_ends_on/);
  assert.match(refinementMigration, /update public\.academic_terms/);
  assert.match(refinementMigration, /calendar\.term_boundaries\.configured/);
});

test("school leadership edits effective calendar adjustments without rewriting national baseline", () => {
  assert.match(calendarPage, /canManage=\{canManageSchool\}/);
  assert.match(impactManager, /Calendar adjustments & exceptions/);
  assert.match(impactManager, /saveTeachingImpact/);
  assert.match(impactManager, /Adjust/);
  assert.match(impactManager, /Save adjustment/);
  assert.match(impactManager, /national\/public baseline/);
  assert.doesNotMatch(impactManager, /Legacy single-date teaching overrides/);
});


test("term discrepancy warning attributes overrides and effective learner events with correct precedence", () => {
  assert.match(manager, /discrepancyCausesForTerm/);
  assert.match(manager, /event\.audienceScope !== "all_learners"/);
  assert.match(manager, /event\.teachingImpact !== "NO_TEACHING"/);
  assert.match(manager, /closureEventByDate/);
  assert.match(manager, /event\.createdAt > current\.createdAt/);
  assert.match(manager, /current\.scope === "national" && event\.scope === "school"/);
  assert.match(manager, /overrideByDate\.has\(date\)/);
  assert.match(manager, /item\.baselineIsSchoolDay === false \|\| underlyingClosure !== undefined/);
  assert.match(manager, /href: "#learner-calendar-events"/);
  assert.match(manager, /href: "#calendar-adjustments"/);
  assert.match(manager, /href=\{item\.href\}/);
  assert.match(manager, /href=\{reviewHref\}/);
  assert.match(manager, /const countDelta/);
  assert.match(manager, /Math\.sign\(cause\.dayDelta\) === discrepancyDirection/);
  assert.match(manager, /Review difference/);
  assert.match(calendarPage, /dayExceptions=\{teachingImpact\.overrides\}/);
  assert.match(calendarPage, /learnerEvents=\{teachingImpact\.events\}/);
  assert.match(impactManager, /id="learner-calendar-events"/);
});

test("school adjustments can be deleted while official baseline is preserved", () => {
  assert.match(teachingImpactQuery, /source,baseline_source,baseline_is_school_day/);
  assert.match(teachingImpactQuery, /baselineSource: item\.baseline_source/);
  assert.match(teachingImpactQuery, /baselineIsSchoolDay: item\.baseline_is_school_day/);
  assert.match(teachingImpactQuery, /created_at/);
  assert.match(teachingImpactQuery, /createdAt: item\.created_at/);
  assert.match(impactManager, /deleteTeachingImpactAdjustment/);
  assert.match(impactManager, /Delete correction/);
  assert.match(impactManager, /National.*baseline|Regional.*baseline/);
  assert.match(impactManager, /isSchoolAdjustment/);
  assert.match(adjustmentMigration, /baseline_source/);
  assert.match(adjustmentMigration, /remove_school_teaching_day_adjustment/);
  assert.match(adjustmentMigration, /restored_baseline/);
  assert.match(adjustmentMigration, /Official national\/regional calendar evidence cannot be deleted/);
});
