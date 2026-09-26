import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
const preparation=await read("src/features/academics/server/lesson-preparation.ts");
const batch=await read("src/features/academics/preparation-batch-submission.tsx");
const reviewActions=await read("src/features/teaching/server/review-actions.ts");
const reviewQueries=await read("src/features/teaching/server/review-queries.ts");
const detail=await read("src/features/teaching/components/review-detail.tsx");
const queue=await read("src/features/teaching/components/review-queue.tsx");
const reviewsPage=await read("src/app/teaching/reviews/page.tsx");
const migration=await read("supabase/migrations/20260926100000_hod_batch_preparation_review.sql");

test("teacher submission supports selected week fortnight and term batches",()=>{
  assert.match(preparation,/submitPreparationBatch/);
  assert.match(preparation,/\["selected","week","fortnight","term"\]/);
  assert.match(preparation,/Fortnight submission must cover exactly 14 days/);
  assert.match(batch,/Selected preparations/);
  assert.match(batch,/Week batch/);
  assert.match(batch,/Fortnight batch/);
  assert.match(batch,/Term batch/);
});

test("school review cadence is effective dated and leadership governed",()=>{
  assert.match(migration,/preparation_review_policies/);
  assert.match(migration,/weekly','fortnightly','selected','term_batch/);
  assert.match(migration,/effective_from/);
  assert.match(migration,/school_admin','principal','deputy_principal/);
  assert.match(reviewQueries,/getPreparationReviewPolicy/);
  assert.match(reviewsPage,/PreparationReviewPolicyCard/);
});

test("comment only appends provenance without changing submission state",()=>{
  assert.match(migration,/comment_on_preparation_submission/);
  assert.match(migration,/'commented'/);
  const commentFn=migration.slice(migration.indexOf("create or replace function public.comment_on_preparation_submission"));
  assert.doesNotMatch(commentFn,/update public\.preparation_submissions/);
  assert.match(reviewActions,/commentOnSubmission/);
  assert.match(detail,/Comment only/);
});

test("review actions retain immutable teacher content boundary",()=>{
  assert.doesNotMatch(reviewActions,/from\("lesson_preparations"\)\.update/);
  assert.match(detail,/teacher content remains untouched/);
  assert.match(migration,/does not alter teacher preparation content/);
});

test("batch UI follows responsive existing design primitives",()=>{
  assert.match(batch,/sm:flex-row/);
  assert.match(batch,/sm:grid-cols-2/);
  assert.match(batch,/Picker/);
  assert.match(batch,/DateField/);
  assert.match(batch,/CheckboxField/);
});


test("HOD queue exposes teacher subject grade week prepared missing and submission state",()=>{
  assert.match(queue,/Teacher/);
  assert.match(queue,/Subject · grade · class/);
  assert.match(queue,/Week \/ scope/);
  assert.match(queue,/Prepared/);
  assert.match(queue,/Missing/);
  assert.match(queue,/Submission state/);
  assert.match(reviewQueries,/preparedCount/);
  assert.match(reviewQueries,/missingCount/);
});
