/**
 * Regression tests for Issue #1208 — Standardise learner name display to
 * Surname Given Names throughout ScolaPro.
 *
 * These tests verify:
 * 1. The shared formatting utility exists and returns Surname GivenNames.
 * 2. All school-facing server files use the shared formatter (not given-first
 *    ad-hoc template literals) for learner names.
 * 3. Sort is by surname then given names (not by display label).
 * 4. The learner directory RPC sorts by surname first server-side.
 * 5. Documents that use separate Surname / Given Names columns are not changed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

const personName        = source("src/lib/person-name.ts");
const register          = source("src/features/attendance/server/register.ts");
const week              = source("src/features/attendance/server/week.ts");
const subjectPeriod     = source("src/features/attendance/server/subject-period.ts");
const absenceOverview   = source("src/features/attendance/server/absence-overview.ts");
const absenceReview     = source("src/features/attendance/server/absence-review-workspace.ts");
const learnersQueries   = source("src/features/learners/server/queries.ts");
const classListWs       = source("src/features/learners/server/class-list-workspace.ts");
const subjectAssign     = source("src/features/learners/server/subject-assignments.ts");
const reportCards       = source("src/features/reporting/server/report-cards.ts");
const pagedReports      = source("src/features/reporting/server/paged-report-cards.ts");
const templateModel     = source("src/features/reporting/server/report-card-template-model.ts");
const academicAnalysis  = source("src/features/academics/server/academic-analysis.ts");
const planningQueries   = source("src/features/late-arrivals/server/planning-queries.ts");
const mySupervision     = source("src/features/late-arrivals/server/my-supervision.ts");
const detentionHistory  = source("src/features/late-arrivals/server/detention-history-queries.ts");
const eligibleLearners  = source("src/features/contributions/server/eligible-learners.ts");
const contributionQ     = source("src/features/contributions/server/queries.ts");
const sportsHouseQ      = source("src/features/sports-houses/server/queries.ts");
const profileChangesQ   = source("src/features/profile-changes/server/queries.ts");
const libraryQ          = source("src/features/library/server/queries.ts");
const absenceQueries    = source("src/features/parents/server/absence-queries.ts");
// Document with existing separate Surname | Given Names columns — must not change
const registerHtml      = source("src/features/attendance/server/render-register-teacher-html.ts");

// ─── 1. Shared utility ───────────────────────────────────────────────────────

test("formatLearnerName is exported from person-name.ts", () => {
  assert.match(personName, /export function formatLearnerName/);
});

test("formatLearnerName signature accepts first_names, surname and fallback", () => {
  assert.match(personName, /formatLearnerName\s*\(\s*\n?\s*first_names/);
});

test("formatLearnerName places surname before given names in output", () => {
  // Implementation: [s, g].filter(Boolean).join(" ")
  assert.match(personName, /\[s,\s*g\]\.filter\(Boolean\)\.join\(" "\)/);
});

test("formatLearnerName falls back when both parts are empty", () => {
  assert.match(personName, /fallback\s*=\s*"Learner"/);
  assert.match(personName, /combined \|\| fallback/);
});

// ─── 2. All school-facing files use formatLearnerName ────────────────────────

const filesUsingFormatter = [
  ["register.ts",                 register],
  ["week.ts",                     week],
  ["subject-period.ts",           subjectPeriod],
  ["absence-overview.ts",         absenceOverview],
  ["absence-review-workspace.ts", absenceReview],
  ["learners/queries.ts",         learnersQueries],
  ["class-list-workspace.ts",     classListWs],
  ["subject-assignments.ts",      subjectAssign],
  ["report-cards.ts",             reportCards],
  ["paged-report-cards.ts",       pagedReports],
  ["report-card-template-model.ts", templateModel],
  ["academic-analysis.ts",        academicAnalysis],
  ["planning-queries.ts",         planningQueries],
  ["my-supervision.ts",           mySupervision],
  ["detention-history-queries.ts",detentionHistory],
  ["eligible-learners.ts",        eligibleLearners],
  ["contributions/queries.ts",    contributionQ],
  ["sports-houses/queries.ts",    sportsHouseQ],
  ["profile-changes/queries.ts",  profileChangesQ],
  ["library/queries.ts",          libraryQ],
  ["absence-queries.ts",          absenceQueries],
];

for (const [label, src] of filesUsingFormatter) {
  test(`${label} imports formatLearnerName from @/lib/person-name`, () => {
    assert.match(src, /formatLearnerName.*from.*@\/lib\/person-name/s);
  });
}

// ─── 3. No given-first ad-hoc literals remain in learner server files ─────────

const noGivenFirstFiles = [
  ["register.ts",             register],
  ["week.ts",                 week],
  ["subject-period.ts",       subjectPeriod],
  ["absence-overview.ts",     absenceOverview],
  ["absence-review-workspace.ts", absenceReview],
  ["learners/queries.ts",     learnersQueries],
  ["planning-queries.ts",     planningQueries],
  ["my-supervision.ts",       mySupervision],
];

for (const [label, src] of noGivenFirstFiles) {
  test(`${label} has no raw given-first template literal for learner names`, () => {
    // Matches: `${...first_names...} ${...surname...}` pattern
    assert.doesNotMatch(
      src,
      /`\$\{[^`]*first_names[^`]*\}\s+\$\{[^`]*surname[^`]*\}`/,
    );
  });
}

// ─── 4. Sort by surname ───────────────────────────────────────────────────────

test("register.ts sortLearners compares by surname field (not display name)", () => {
  assert.match(register, /collator\.compare\(left\.surname,\s*right\.surname\)/);
  assert.match(register, /collator\.compare\(left\.first_names,\s*right\.first_names\)/);
});

test("week.ts sortLearners compares by surname field (not display name)", () => {
  assert.match(week, /collator\.compare\(left\.surname,\s*right\.surname\)/);
  assert.match(week, /collator\.compare\(left\.first_names,\s*right\.first_names\)/);
});

test("learner directory RPC sort uses lower(surname) as primary key", () => {
  const migration = source(
    "supabase/migrations/20260912200000_learner_directory_current_scope.sql",
  );
  assert.match(migration, /lower\(l\.surname\).*asc/s);
  assert.match(migration, /lower\(l\.first_names\).*asc/s);
});

// ─── 5. Search supports both name orders ─────────────────────────────────────

test("learner directory RPC search query includes both first_names and surname", () => {
  const migration = source(
    "supabase/migrations/20260912200000_learner_directory_current_scope.sql",
  );
  assert.match(migration, /concat_ws.*first_names.*surname/s);
});

// ─── 6. Register document keeps separate Surname / Given Names columns ────────

test("render-register-teacher-html.ts keeps Surname and Given Names as separate columns", () => {
  assert.match(registerHtml, /class="identity surname"/);
  assert.match(registerHtml, /class="identity given"/);
  assert.match(registerHtml, /learner\.surname/);
  assert.match(registerHtml, /learner\.givenNames/);
  // Must NOT concat them into a single full-name cell
  assert.doesNotMatch(registerHtml, /\$\{.*learner\.surname.*\}\s+\$\{.*learner\.givenNames/);
});

// ─── 7. Guardian names are NOT changed ───────────────────────────────────────

test("guardians/queries.ts still uses formatPersonName (not formatLearnerName) for guardian names", () => {
  const guardiansQ = source("src/features/guardians/server/queries.ts");
  assert.match(guardiansQ, /formatPersonName/);
  assert.doesNotMatch(guardiansQ, /formatLearnerName/);
});
