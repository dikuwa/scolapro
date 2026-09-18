import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const file = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const reviewQueries = await file("src/features/teaching/server/review-queries.ts");
const reviewActions = await file("src/features/teaching/server/review-actions.ts");
const reviewsRoute = await file("src/app/teaching/reviews/page.tsx");
const reviewDetailRoute = await file("src/app/teaching/reviews/[id]/page.tsx");
const reviewQueue = await file("src/features/teaching/components/review-queue.tsx");
const reviewDetail = await file("src/features/teaching/components/review-detail.tsx");
const reviewsLoading = await file("src/app/teaching/reviews/loading.tsx");
const mergedTeacherFlow = await file("src/features/academics/server/lesson-preparation.ts");

const appLayer = {
  "review-queries": reviewQueries,
  "review-actions": reviewActions,
  "reviews route": reviewsRoute,
  "review detail route": reviewDetailRoute,
  "review queue": reviewQueue,
  "review detail": reviewDetail,
};

function slice(source, start, end) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `Expected to find ${start}`);
  const to = end ? source.indexOf(end, from) : -1;
  return to > from ? source.slice(from, to) : source.slice(from);
}

test("1. review routes exist for the queue and the submission detail", () => {
  assert.match(reviewsRoute, /export default async function ReviewsPage/);
  assert.match(reviewDetailRoute, /export default async function ReviewDetailPage/);
  assert.match(reviewDetailRoute, /params: Promise<\{ id: string \}>/);
  assert.match(reviewsLoading, /RouteLoadingIndicator/);
});

test("2. routes use the deterministic current-school review scope resolver", () => {
  assert.match(reviewQueries, /export async function resolveReviewScope/);
  assert.match(reviewQueries, /reviewerRoleOrder = \["school_admin", "principal", "deputy_principal", "hod"\]/);
  assert.match(reviewQueries, /context\.memberships\.find\(\(candidate\) => candidate\.roleKey === roleKey\)/);
  assert.match(reviewsRoute, /resolveReviewScope\(\)/);
  assert.match(reviewDetailRoute, /resolveReviewScope\(\)/);
  assert.doesNotMatch(reviewQueries, /allSchoolMemberships/);
  assert.doesNotMatch(reviewQueries, /context\.memberships\[0\]/);
});

test("3. no arbitrary current-school membership selection is used as review scope", () => {
  assert.doesNotMatch(reviewsRoute, /memberships\.find\(/);
  assert.doesNotMatch(reviewDetailRoute, /memberships\.find\(/);
  assert.doesNotMatch(reviewQueries, /allowedRoles\.has\(/);
  assert.doesNotMatch(reviewQueries, /context\.memberships\.find\(\(item\)/);
});

test("4. Platform Support is excluded without being conflated with Platform Admin", () => {
  assert.match(reviewQueries, /membership\.roleKey === "platform_support"/);
  for (const [name, source] of Object.entries(appLayer)) {
    assert.doesNotMatch(source, /platform_admin/, `${name} must not treat platform_admin as platform_support or as a school bypass`);
    assert.doesNotMatch(source, /has_platform_role/, `${name} must not re-implement the DB platform-role predicate`);
  }
});

test("5. teacher authorship alone does not grant review authority", () => {
  const order = reviewQueries.match(/reviewerRoleOrder = \[([^\]]*)\]/);
  assert.ok(order, "Expected an explicit reviewer role preference order");
  assert.doesNotMatch(order[1], /teacher/);
  assert.doesNotMatch(reviewQueries, /submitted_by_user_id/);
  assert.doesNotMatch(reviewQueries, /prepared_by_user_id/);
  assert.doesNotMatch(reviewQueue, /submitted_by_user_id/);
  assert.doesNotMatch(reviewDetail, /submitted_by_user_id|prepared_by_user_id/);
});

test("6. review action uses the governed public.review_preparation_submission RPC only", () => {
  assert.match(reviewActions, /rpc\("review_preparation_submission"/);
  assert.match(reviewActions, /p_submission_id: parsed\.data\.submissionId/);
  assert.match(reviewActions, /p_action: parsed\.data\.action/);
  assert.match(reviewActions, /p_comment:/);
  assert.match(reviewActions, /z\.enum\(\["reviewed", "returned"\]\)/);
  assert.doesNotMatch(reviewActions, /approved|rejected|moderated|verified/i);
  assert.doesNotMatch(reviewActions, /submit_preparations/);
  assert.match(reviewActions, /revalidatePath\("\/teaching\/reviews"\)/);
  assert.match(reviewActions, /revalidatePath\(`\/teaching\/reviews\/\$\{parsed\.data\.submissionId\}`\)/);
  assert.match(mergedTeacherFlow, /rpc\("submit_preparations"/);
});

test("7. readiness uses the governed public.resolve_hod_teaching_readiness RPC", () => {
  assert.match(reviewQueries, /rpc\("resolve_hod_teaching_readiness"/);
  assert.match(reviewQueries, /p_school_id: scope\.schoolId/);
  assert.match(reviewQueries, /p_academic_year: academicYear/);
  assert.match(reviewQueries, /state: "denied"/);
  assert.match(reviewQueries, /state: "unavailable"/);
  assert.match(reviewsRoute, /readiness\.state === "ok"/);
  assert.match(reviewsRoute, /readiness\.state !== "ok"/);
  assert.match(reviewsRoute, /Review authority not confirmed/);
});

test("8. no guessed private helper RPC is called from the application layer", () => {
  for (const [name, source] of Object.entries(appLayer)) {
    assert.doesNotMatch(source, /app_private/, `${name} must not call private DB helpers`);
    assert.doesNotMatch(source, /can_read_preparation_submission/, `${name} must rely on RLS for visibility`);
  }
});

test("9. no service-role or admin client bypass is introduced", () => {
  for (const [name, source] of Object.entries(appLayer)) {
    assert.doesNotMatch(source, /service_role|SERVICE_ROLE/, `${name} must not use a service role key`);
    assert.doesNotMatch(source, /createClient\(/, `${name} must use the request-scoped server client`);
  }
  assert.match(reviewQueries, /createSupabaseServerClient/);
  assert.match(reviewActions, /createSupabaseServerClient/);
});

test("10. queue visibility comes from governed RLS rather than a duplicated predicate", () => {
  assert.match(reviewQueries, /\.from\("preparation_submissions"\)/);
  assert.match(reviewQueries, /\.select\(reviewQueueSelect\)/);
  assert.match(reviewQueries, /\.eq\("status", "submitted"\)/);
  assert.doesNotMatch(reviewQueries, /hod_responsible_for_subject|has_school_role|can_review_preparation_submission|staff_school_assignments|subject_department_responsibilities/);
  assert.match(reviewsRoute, /getReviewQueue\(academicYear\)/);
});

test("11. the queue has an explicit mobile card/stack representation", () => {
  assert.match(reviewQueue, /<ul className="space-y-3 md:hidden">/);
  assert.match(reviewQueue, /<li key=\{row\.id\}/);
  assert.match(reviewQueue, /Open review/);
  assert.match(reviewQueue, /Scolapro-record-title|scolapro-record-title break-words/);
});

test("12. the queue is not a table-only 390px experience", () => {
  assert.match(reviewQueue, /className="hidden overflow-hidden[^"]*md:block"/);
  assert.match(reviewQueue, /md:hidden/);
  assert.doesNotMatch(reviewQueue, /overflow-x-auto/);
});

test("13. the detail renders actual teacher-authored preparation content", () => {
  assert.match(reviewQueries, /id, status, planned_on, preparation, curriculum_snapshot/);
  assert.match(reviewDetail, /item\.preparation\[key\]/);
  assert.match(reviewDetail, /Teacher preparation/);
  assert.match(reviewDetail, /preparationFieldLabels/);
  assert.match(reviewDetail, /Read-only for reviewers/);
});

test("14. review history is read-only and ordered", () => {
  const history = slice(reviewDetail, "function ReviewHistory", "function ReviewActions");
  assert.match(history, /Append-only provenance/);
  assert.match(history, /event\.actorRoleSnapshot/);
  assert.match(history, /event\.occurredAtLabel/);
  assert.doesNotMatch(history, /<button|<form|onClick/);
  assert.match(reviewDetail, /No review history yet/);
  assert.match(reviewQueries, /sort\(\(left, right\) => left\.occurredAt\.localeCompare\(right\.occurredAt\)\)/);
});

test("15. review events are never mutated directly", () => {
  for (const [name, source] of Object.entries(appLayer)) {
    assert.doesNotMatch(source, /preparation_review_events[\s\S]{0,80}\.(insert|update|delete|upsert)\(/, `${name} must not mutate review events`);
  }
  assert.match(reviewQueries, /events:preparation_review_events\(/);
});

test("16. submissions and preparations are never mutated directly from the review application", () => {
  for (const [name, source] of Object.entries(appLayer)) {
    assert.doesNotMatch(source, /preparation_submissions[\s\S]{0,80}\.(insert|update|delete|upsert)\(/, `${name} must not mutate submissions`);
    assert.doesNotMatch(source, /lesson_preparations[\s\S]{0,80}\.(insert|update|delete|upsert)\(/, `${name} must not mutate preparations`);
  }
});

test("17. no native browser control or blocking dialog is used", () => {
  for (const source of [reviewQueue, reviewDetail]) {
    assert.doesNotMatch(source, /type="date"|type="time"|type="file"/);
    assert.doesNotMatch(source, /<select/);
    assert.doesNotMatch(source, /window\.(alert|confirm|prompt)|\balert\(|\bconfirm\(/);
  }
  assert.match(reviewDetail, /useActionState/);
  assert.match(reviewDetail, /toast\.success/);
  assert.match(reviewDetail, /toast\.error/);
  assert.match(reviewDetail, /aria-live="polite"/);
});

test("18. long subject, class and history content can wrap", () => {
  for (const source of [reviewQueue, reviewDetail]) {
    assert.match(source, /break-words/);
    assert.doesNotMatch(source, /whitespace-nowrap|truncate/);
  }
  assert.match(reviewQueue, /scolapro-record-title break-words/);
  assert.match(reviewDetail, /whitespace-pre-wrap break-words/);
});

test("19. no horizontal overflow pattern is introduced", () => {
  for (const source of [reviewsRoute, reviewDetailRoute, reviewQueue, reviewDetail, reviewsLoading]) {
    assert.doesNotMatch(source, /overflow-x-(hidden|auto|scroll)/);
    assert.doesNotMatch(source, /min-w-\[\d+(px|rem)/);
  }
});

test("20. review actions stay usable on mobile and use the shared button", () => {
  assert.match(reviewDetail, /flex flex-col gap-2 sm:flex-row sm:justify-end/);
  assert.match(reviewDetail, /min-h-\[96px\] w-full rounded-\[var\(--radius-sm\)\]/);
  assert.match(reviewDetail, /<Button type="submit" name="action" value="reviewed"/);
  assert.match(reviewDetail, /<Button type="submit" name="action" value="returned"/);
  assert.match(reviewDetail, /variant="success"/);
  assert.match(reviewDetail, /variant="danger"/);
  assert.match(reviewDetail, /loading=\{pending\}/);
});

test("21. the review action matches the useActionState contract", () => {
  assert.match(reviewActions, /export async function reviewSubmission\(\s*_state: ReviewActionState,\s*formData: FormData,\s*\)/);
  assert.match(reviewDetail, /useActionState\(reviewSubmission, initialState\)/);
  assert.match(reviewDetail, /<form action=\{action\}/);
});

test("22. routes keep the login redirect and the not-found convention", () => {
  assert.match(reviewsRoute, /redirect\("\/login\?next=\/teaching\/reviews"\)/);
  assert.match(reviewDetailRoute, /redirect\("\/login\?next=\/teaching\/reviews"\)/);
  assert.match(reviewsRoute, /if \(!scope\) redirect\("\/"\)/);
  assert.match(reviewDetailRoute, /if \(!scope\) redirect\("\/"\)/);
  assert.match(reviewDetailRoute, /notFound\(\)/);
});