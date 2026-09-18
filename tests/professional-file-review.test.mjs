import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const nodeRequire = createRequire(import.meta.url);
const assert = nodeRequire("node:assert/strict");
const fs = nodeRequire("node:fs");
const path = nodeRequire("node:path");
const { test } = nodeRequire("node:test");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const migration = source("supabase/migrations/20260918231000_teacher_professional_document_review.sql");
const ownerActions = source("src/features/teaching/server/professional-documents.ts");
const filesQuery = source("src/features/teaching/server/file-queries.ts");
const filesUi = source("src/features/teaching/components/teaching-files.tsx");
const queueQuery = source("src/features/teaching/server/professional-file-review.ts");
const reviewAction = source("src/features/teaching/server/professional-file-review-actions.ts");
const reviewsPage = source("src/app/teaching/reviews/page.tsx");
const reviewRoute = source("src/app/teaching/reviews/professional-files/[id]/page.tsx");
const downloadRoute = source("src/app/api/teaching/reviews/professional-files/[id]/route.ts");

test("professional-file review reuses canonical documents and existing HOD responsibility", () => {
  assert.match(migration, /references public\.teacher_professional_documents/);
  assert.match(migration, /hod_responsible_for_subject/);
  assert.doesNotMatch(migration, /create table public\.teacher_professional_documents\b/);
  assert.doesNotMatch(migration, /NIED required|official NIED file requirement/i);
});

test("teacher chooses a current allocated subject and submission remains owner initiated", () => {
  assert.match(migration, /submit_teacher_professional_document_for_review/);
  assert.match(migration, /teacher_allocations/);
  assert.match(migration, /staff_member_id=v_document\.owner_staff_member_id/);
  assert.match(ownerActions, /submitTeacherProfessionalDocumentForReview/);
  assert.match(filesUi, /Choose your teaching subject/);
  assert.match(filesUi, /Submit for review/);
  assert.match(filesQuery, /reviewStatus/);
});

test("review is explicit-submission scoped and does not restore broad HOD file browsing", () => {
  assert.match(migration, /responsible hod reads explicitly submitted professional documents/);
  assert.match(migration, /can_review_teacher_professional_document_submission/);
  assert.match(migration, /s\.submitted_by_user_id <> auth\.uid\(\)/);
  assert.match(queueQuery, /teacher_professional_document_review_submissions/);
  assert.match(queueQuery, /\.eq\("status", "submitted"\)/);
});

test("review, return and resubmit preserve append-only history", () => {
  assert.match(migration, /event_kind in \('submitted','returned','reviewed','resubmitted'\)/);
  assert.match(migration, /review history is append-only/i);
  assert.match(migration, /review_resubmitted/);
  assert.match(reviewAction, /review_teacher_professional_document_submission/);
  assert.match(filesUi, /Resubmit for review/);
});

test("professional review is integrated into existing review surface and uses a governed detail route", () => {
  assert.match(reviewsPage, /ProfessionalFileReviewQueue/);
  assert.match(reviewsPage, /getProfessionalFileReviewQueue/);
  assert.match(reviewRoute, /getProfessionalFileReviewDetail/);
  assert.match(reviewRoute, /notFound/);
});

test("review file access proves RLS visibility before minting a signed URL", () => {
  const selectIndex = downloadRoute.indexOf('.from("teacher_professional_document_review_submissions")');
  const signedIndex = downloadRoute.indexOf(".createSignedUrl(");
  assert.ok(selectIndex >= 0 && signedIndex > selectIndex);
  assert.match(downloadRoute, /60,/);
  assert.match(downloadRoute, /teacher-professional-documents/);
});
