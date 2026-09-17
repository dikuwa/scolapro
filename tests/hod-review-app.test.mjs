import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const reviewQueries = await readFile(new URL("../src/features/teaching/server/review-queries.ts", import.meta.url), "utf8");
const reviewActions = await readFile(new URL("../src/features/teaching/server/review-actions.ts", import.meta.url), "utf8");
const reviewsRoute = await readFile(new URL("../src/app/teaching/reviews/page.tsx", import.meta.url), "utf8");
const reviewDetailRoute = await readFile(new URL("../src/app/teaching/reviews/[id]/page.tsx", import.meta.url), "utf8");
const reviewQueue = await readFile(new URL("../src/features/teaching/components/review-queue.tsx", import.meta.url), "utf8");
const reviewDetail = await readFile(new URL("../src/features/teaching/components/review-detail.tsx", import.meta.url), "utf8");

test("review queries use the correct RPCs and tables", () => {
  assert.match(reviewQueries, /resolve_hod_teaching_readiness/);
  assert.match(reviewQueries, /preparation_submissions/);
  assert.match(reviewQueries, /preparation_submission_items/);
  assert.match(reviewQueries, /preparation_review_events/);
  assert.match(reviewQueries, /can_read_preparation_submission/);
  assert.match(reviewQueries, /getReviewQueue/);
  assert.match(reviewQueries, /getReviewDetail/);
});

test("review actions call the review and submit RPCs", () => {
  assert.match(reviewActions, /review_preparation_submission/);
  assert.match(reviewActions, /submit_preparations/);
  assert.match(reviewActions, /revalidatePath\(/);
  assert.match(reviewActions, /\/teaching\/reviews/);
});

test("reviews route excludes platform users and requires HOD/leadership roles", () => {
  assert.match(reviewsRoute, /context\.platformMemberships\.length/);
  assert.match(reviewsRoute, /school_admin|principal|deputy_principal|hod/);
  assert.match(reviewsRoute, /redirect\(/);
});

test("review detail route handles missing submissions", () => {
  assert.match(reviewDetailRoute, /notFound\(\)/);
  assert.match(reviewDetailRoute, /getReviewDetail/);
});

test("review queue component renders table rows", () => {
  assert.match(reviewQueue, /scopeKind/);
  assert.match(reviewQueue, /subjectLabel/);
  assert.match(reviewQueue, /teacherName/);
  assert.match(reviewQueue, /itemCount/);
});

test("review detail component renders submission data and action form", () => {
  assert.match(reviewDetail, /Submission Details/);
  assert.match(reviewDetail, /Take Action/);
  assert.match(reviewDetail, /reviewSubmission/);
  assert.match(reviewDetail, /useActionState/);
  assert.match(reviewDetail, /Preparation Items/);
});

test("review detail component handles empty review history", () => {
  assert.match(reviewDetail, /No review history yet/);
});
