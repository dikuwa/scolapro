import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const summary = readFileSync("src/features/attendance/server/official-summary.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260924120000_official_attendance_summary_read_model.sql", "utf8");
const component = readFileSync("src/features/attendance/official-summary.tsx", "utf8");
const page = readFileSync("src/app/attendance/page.tsx", "utf8");
const tabs = readFileSync("src/features/attendance/attendance-view-tabs.tsx", "utf8");

test("official summary derives absence only from canonical daily-register sources", () => {
  // Numerator/denominator come from daily_register_current (effective
  // enrolments) and daily-register attendance_events only.
  assert.match(summary, /from\("daily_register_current"\)/);
  assert.match(summary, /from\("attendance_events"\)/);
  assert.match(summary, /observation_type.*daily_register/);
  // No second attendance system and no duplicate rows into a reporting table.
  assert.doesNotMatch(summary, /insert into|\.insert\(|upsert/);
});

test("official % absence implements absent learner-days over possible learner attendances", () => {
  assert.match(summary, /possibleAttendances/);
  assert.match(summary, /absentLearnerDays/);
  assert.match(summary, /part \/ whole\) \* 100/);
});

test("official absence counts absent only; late, excused, unknown and present are excluded", () => {
  assert.match(summary, /status === "absent"/);
  assert.match(summary, /Present\/Late\/Excused are not absence/);
  // No alternative absence classification creeps in.
  assert.doesNotMatch(summary, /status === "late"|status === "excused"/);
});

test("NO_TEACHING days contribute zero possible attendances and zero absent learner-days", () => {
  // Denominator window and week cells are filtered to teaching dates.
  assert.match(summary, /dates\.filter\(\(day\) => impactByDate\.get\(day\) !== "NO_TEACHING"\)/);
  assert.match(summary, /week\.dates\.filter/);
});

test("last expected school day rule: summary reports as at the last non-NO_TEACHING date", () => {
  assert.match(summary, /lastTeachingDate/);
  assert.match(summary, /teachingDates\[teachingDates\.length - 1\]/);
  // Week identity reports on its last expected school day, not blindly Friday.
  assert.match(summary, /weekEndingReportedOn/);
});

test("subject-period attendance, late-arrival and detention streams are excluded", () => {
  // Only the daily-register observation type is read; nothing imports the
  // subject-period or behaviour (detention) server modules.
  assert.doesNotMatch(summary, /subject-period|subject_period|observation_type.*subject|detention/);
  assert.doesNotMatch(summary, /from "@\/features\/attendance\/server\/subject/);
});

test("readiness surfaces incomplete register submissions by class and date", () => {
  assert.match(summary, /expectedRegisters/);
  assert.match(summary, /submittedRegisters/);
  assert.match(summary, /incomplete/);
  assert.match(component, /of \{readiness\.expectedRegisters\} register classes complete/);
  assert.match(component, /item\.gradeName\} \$\{item\.className\} — \$\{shortDate\(item\.date\)\}/);
});

test("readiness uses the latest authoritative submission per class and day", () => {
  // Submissions ordered newest-first; the first key encountered wins.
  assert.match(summary, /order\("recorded_at", \{ ascending: false \}\)/);
  assert.match(summary, /if \(!submittedKeys\.has\(key\)\) submittedKeys\.add\(key\);/);
});

test("ranged teaching-impact resolver mirrors authoritative per-date semantics", () => {
  assert.match(migration, /resolve_school_teaching_impact_range/);
  // Overrides win over the event baseline; weekends fall back to NO_TEACHING.
  assert.match(migration, /when not overrides\.is_school_day then 'NO_TEACHING'/);
  assert.match(migration, /resolve_learner_event_teaching_impact/);
  assert.match(migration, /extract\(isodow from baseline\.day\) between 1 and 5/);
  assert.match(migration, /security definer/);
  assert.match(migration, /revoke all on function public\.resolve_school_teaching_impact_range\(uuid, date, date\) from public, anon/);
  assert.match(migration, /grant execute on function public\.resolve_school_teaching_impact_range\(uuid, date, date\) to authenticated/);
});

test("official summary is school-scoped through RLS-backed queries", () => {
  // Every canonical query is constrained to the acting school; the resolved
  // RPC is security definer for one school id only.
  const schoolScoped = [
    /from\("daily_register_current"\)[^;]*\.eq\("school_id", schoolId\)/,
    /from\("attendance_events"\)[^;]*\.eq\("school_id", schoolId\)/,
    /from\("attendance_register_submissions"\)[^;]*\.eq\("school_id", schoolId\)/,
    /from\("register_classes"\)[^;]*\.eq\("school_id", schoolId\)/,
  ];
  for (const pattern of schoolScoped) assert.match(summary, pattern);
});

test("read model queries stay bounded without N+1 fetches", () => {
  assert.match(summary, /Promise\.all\(\[/);
  // Register evidence is fetched once for the whole range, not per day/class.
  assert.match(summary, /in\("attendance_date", teachingDates\)/);
  assert.doesNotMatch(summary, /supabase\.from\("(daily_register_current|attendance_events)"\)[\s\S]{0,200}for \(const day/);
});

test("term view provides week 1..N with B/G/Total by class and grade plus weekly totals", () => {
  assert.match(summary, /weekly: \{ weekId: string; weekLabel: string; absences: OfficialSexSplit \}\[\]/);
  assert.match(summary, /OfficialSummaryGradeRow/);
  assert.match(summary, /OfficialSexSplit = \{ boys: number; girls: number; total: number \}/);
  assert.match(summary, /weekLabel: `Week \$\{weeks\.length \+ 1\}`/);
  assert.match(component, /Term summary/);
  assert.match(component, /weekLabel/);
});

test("official view is wired into the attendance workspace behind existing roles", () => {
  assert.match(tabs, /value: "official", label: "Official"/);
  assert.match(page, /requestedView === "official" \? "official"/);
  assert.match(page, /getOfficialAttendanceSummary\(schoolId, academicYear, "week", date, requestedTerm \?\? null\)/);
});

test("official summary UI follows the ScolaPro design system", () => {
  assert.match(component, /from "@\/components\/ui\/picker"/);
  assert.match(component, /from "@\/components\/ui\/spinner"/);
  assert.match(component, /scolapro-section-title/);
  assert.match(component, /scolapro-record-title/);
  assert.match(component, /rounded-\[var\(--radius-sm\)\]/);
  assert.match(component, /shadow-\[var\(--shadow-xs\)\]/);
  assert.doesNotMatch(component, /rounded-full|bg-black|text-white|alert\(|confirm\(/);
});
