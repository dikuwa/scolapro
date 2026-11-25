import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20261125121000_guardian_absence_notice_review_integrity.sql", import.meta.url),
  "utf8",
);
const actions = readFileSync(new URL("../src/features/parents/server/absence-actions.ts", import.meta.url), "utf8");
const reviewList = readFileSync(new URL("../src/features/parents/absence-review-list.tsx", import.meta.url), "utf8");

test("duplicate active guardian notices for the same learner and period are refused", () => {
  assert.match(migration, /An active absence notice already covers these dates/);
  assert.match(migration, /n\.status in \('submitted','under_review','accepted'\)/);
});

test("review transitions are bounded and acceptance or closure is final", () => {
  assert.match(migration, /v_notice\.status=p_status then raise exception 'Absence notice is already in the requested review state'/);
  assert.match(migration, /\(v_notice\.status='submitted' and p_status in \('under_review','accepted','returned','closed'\)\)/);
  assert.match(migration, /\(v_notice\.status='returned' and p_status in \('under_review','accepted','closed'\)\)/);
  assert.match(migration, /\(v_notice\.status='accepted' and p_status='closed'\)/);
  assert.match(migration, /Absence notice review state cannot change that way/);
});

test("a stale reviewer form cannot overwrite an intervening decision", () => {
  assert.match(migration, /create or replace function public\.review_guardian_absence_notice_checked/);
  assert.match(migration, /for update/);
  assert.match(migration, /v_notice\.status is distinct from p_expected_status/);
  assert.match(migration, /v_notice\.reviewed_at is distinct from p_expected_reviewed_at/);
  assert.match(migration, /Absence notice review changed; reload before saving/);
  assert.match(actions, /supabase\.rpc\("review_guardian_absence_notice_checked"/);
  assert.match(actions, /p_expected_status: parsed\.data\.expectedStatus/);
  assert.match(actions, /This notice was reviewed by someone else/);
  assert.match(reviewList, /name="expectedStatus" value=\{notice\.status\}/);
  assert.match(reviewList, /name="expectedReviewedAt" value=\{notice\.reviewedAt \?\? ""\}/);
  // The database permits starting review and closing an accepted notice; both are
  // now reachable instead of being unreachable badge states.
  assert.match(actions, /status: z\.enum\(\["under_review", "accepted", "returned", "closed"\]\)/);
  assert.match(reviewList, /name="status" value="under_review"/);
  assert.match(reviewList, /Start review/);
  assert.match(reviewList, /name="status" value="closed"/);
  assert.match(reviewList, /Close notice/);
  assert.match(reviewList, /if \(notice\.status === "closed"\) return null;/);
});

test("notice lifecycle notifies authorized reviewers and the submitting guardian without copying sensitive detail", () => {
  assert.match(migration, /'Absence notice awaiting review'/);
  assert.match(migration, /sm\.role_key in \('school_admin','principal','deputy_principal','counsellor'\)/);
  assert.match(migration, /'\/school\/absence-reviews'/);
  assert.match(migration, /'Absence notice reviewed'/);
  assert.match(migration, /v_notice\.submitted_by_user_id/);
  assert.match(migration, /'\/parent'/);
  assert.match(migration, /'A guardian submitted an absence notice for review\.'/);
  // Inbox copy is fixed text: no learner name, reason or free-text message is
  // concatenated into the notification title/body.
  assert.doesNotMatch(migration, /'A guardian submitted an absence notice[^']*' \|\|/);
  assert.doesNotMatch(migration, /'The school accepted your absence notice[^']*' \|\| v_notice/);
});
