import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20261125140000_guardian_absence_notice_guardian_control.sql", import.meta.url),
  "utf8",
);
const pgTap = readFileSync(
  new URL("../supabase/tests/guardian_absence_notice_guardian_control_test.sql", import.meta.url),
  "utf8",
);
const actions = readFileSync(new URL("../src/features/parents/server/absence-actions.ts", import.meta.url), "utf8");
const queries = readFileSync(new URL("../src/features/parents/server/absence-queries.ts", import.meta.url), "utf8");
const parentPortal = readFileSync(new URL("../src/features/parents/parent-portal.tsx", import.meta.url), "utf8");
const reviewList = readFileSync(new URL("../src/features/parents/absence-review-list.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/features/attendance/absence-review-workspace.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/school/absence-reviews/page.tsx", import.meta.url), "utf8");

test("guardian can withdraw their own notice and only before a final decision", () => {
  assert.match(migration, /create or replace function public\.withdraw_guardian_absence_notice\(p_notice_id uuid\)/);
  assert.match(migration, /Only the submitting guardian can withdraw this notice/);
  assert.match(migration, /Only a notice awaiting or returned from review can be withdrawn/);
  assert.match(migration, /status='withdrawn'/);
  assert.match(migration, /A withdrawn guardian absence notice is final/);
  assert.match(migration, /check \(status in \('submitted','under_review','accepted','returned','closed','withdrawn'\)\)/);
  assert.match(actions, /supabase\.rpc\("withdraw_guardian_absence_notice"/);
  assert.match(parentPortal, /Withdraw notice/);
});

test("guardian can correct and resubmit a returned notice with review history retained", () => {
  assert.match(migration, /create or replace function public\.resubmit_guardian_absence_notice/);
  assert.match(migration, /Only a returned absence notice can be resubmitted/);
  assert.match(migration, /Guardian relationship is no longer active for this learner/);
  assert.match(migration, /set status='submitted',/);
  assert.match(migration, /reviewed_by_user_id=null/);
  assert.match(migration, /previous_review_note/);
  assert.match(actions, /supabase\.rpc\("resubmit_guardian_absence_notice"/);
  assert.match(parentPortal, /Edit and resubmit/);
  assert.match(parentPortal, /Resubmit for review/);
});

test("per-notice history is append-only and visible only to participants", () => {
  assert.match(migration, /create table if not exists public\.guardian_absence_notice_events/);
  assert.match(migration, /Guardian absence notice events are append-only/);
  assert.match(migration, /create policy "notice participants read events"/);
  assert.match(migration, /n\.submitted_by_user_id = \(select auth\.uid\(\)\)\s*\)\s*or app_private\.can_review_guardian_absence_notice\(notice_id\)/);
  assert.match(migration, /insert into public\.guardian_absence_notice_events/);
  assert.match(pgTap, /unrelated account cannot read notice history/);
  assert.match(pgTap, /authorized reviewer can read notice history/);
  assert.match(parentPortal, /Notice history/);
  assert.match(reviewList, /Notice history/);
});

test("a notice is never dropped because its learner row is not independently readable", () => {
  // `learners!inner` removed the whole notice from the guardian history when the
  // joined learner row was not readable through RLS. The relationship must be a
  // left join with a neutral label fallback.
  assert.doesNotMatch(queries, /learners!inner/);
  assert.match(queries, /learners\(id, first_names, surname\)/);
  assert.match(queries, /\|\| "Linked learner"/);
  // The history must name the guardian's own child from the canonical family
  // overview, because the joined learner row is not readable to this role.
  assert.match(parentPortal, /function ParentAbsenceHistory\(\{ notices, learnerName \}/);
  assert.match(parentPortal, /notice\.learnerName === "Linked learner" \? learnerName : notice\.learnerName/);
  assert.match(parentPortal, /<ParentAbsenceHistory notices=\{childAbsenceNotices\} learnerName=\{child\.name\} \/>/);
});

test("a successful guardian action refreshes the server-rendered notice list", () => {
  const form = readFileSync(new URL("../src/features/parents/absence-notice-form.tsx", import.meta.url), "utf8");
  assert.match(form, /useRouter/);
  assert.match(form, /if \(state\.success\) router\.refresh\(\)/);
  assert.match(parentPortal, /if \(state\.success\) router\.refresh\(\)/);
});

test("review queue is paginated over the date-overlapping set", () => {
  assert.match(queries, /options\.offset/);
  assert.match(queries, /\.range\(offset, offset \+ limit\)/);
  assert.match(queries, /\.gte\("absence_to", options\.from\)/);
  assert.match(queries, /\.lte\("absence_from", options\.to\)/);
  assert.match(queries, /hasMore: notices\.length > limit/);
  assert.match(page, /NOTICE_PAGE_SIZE = 50/);
  assert.match(page, /noticePage \* NOTICE_PAGE_SIZE/);
  assert.match(workspace, /Absence notice pages/);
  assert.match(workspace, /Older notices/);
  assert.match(workspace, /Newer notices/);
});
