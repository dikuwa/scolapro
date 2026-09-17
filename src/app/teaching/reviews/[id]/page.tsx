import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, History, RotateCcw } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getHodReviewDetail } from "@/features/academics/server/hod-review";
import { getUserContext } from "@/lib/auth/get-user-context";
import { returnSubmissionAction, reviewSubmissionAction } from "../actions";

const REVIEW_ROLES = new Set(["school_admin", "principal", "deputy_principal", "hod"]);

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-NA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function TeachingReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getUserContext();
  if (!context.user) redirect(`/login?next=/teaching/reviews/${id}`);
  if (context.platformMemberships.length) redirect("/");

  const membership = context.currentSchoolMembership;
  if (!membership || !REVIEW_ROLES.has(membership.roleKey)) redirect("/teaching");

  const detail = await getHodReviewDetail(membership.schoolId, id);
  if (!detail) notFound();

  const { submission, items, history } = detail;
  const isPending = submission.status === "submitted";

  return (
    <AppShell>
      <section className="min-w-0">
        <Link href="/teaching/reviews" className="mb-4 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-brand-strong"><ArrowLeft className="size-4" />Back to reviews</Link>
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{membership.schoolName} · {submission.academicYear}</p>
            <h1 className="scolapro-page-title mt-1 text-[clamp(1.3rem,1.08rem+0.55vw,1.75rem)]">Preparation submission</h1>
            <p className="mt-1 text-sm text-muted-foreground">Submitted {formatDateTime(submission.submittedAt)} · {submission.scopeKind.replaceAll("_", " ")}</p>
          </div>
          <span className="inline-flex min-h-9 items-center gap-2 self-start rounded-full bg-surface-muted px-3 text-sm font-medium text-foreground">
            {submission.status === "reviewed" ? <CheckCircle2 className="size-4" /> : submission.status === "returned" ? <RotateCcw className="size-4" /> : <Clock3 className="size-4" />}
            {submission.status === "submitted" ? "Awaiting review" : submission.status === "reviewed" ? "Reviewed" : "Returned for revision"}
          </span>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.8fr)]">
          <div className="min-w-0 space-y-5">
            <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
              <h2 className="scolapro-section-title">Submission scope</h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div><dt className="text-xs font-medium text-muted-foreground">Scope</dt><dd className="mt-1 text-sm font-medium text-foreground">{submission.scopeKind.replaceAll("_", " ")}</dd></div>
                <div><dt className="text-xs font-medium text-muted-foreground">Term</dt><dd className="mt-1 text-sm font-medium text-foreground">{submission.termLabel ?? "—"}</dd></div>
                <div><dt className="text-xs font-medium text-muted-foreground">Items</dt><dd className="mt-1 text-sm font-medium text-foreground">{submission.itemCount}</dd></div>
                <div><dt className="text-xs font-medium text-muted-foreground">Week starts</dt><dd className="mt-1 text-sm font-medium text-foreground">{submission.weekStart ?? "—"}</dd></div>
                <div><dt className="text-xs font-medium text-muted-foreground">Week ends</dt><dd className="mt-1 text-sm font-medium text-foreground">{submission.weekEnd ?? "—"}</dd></div>
                <div><dt className="text-xs font-medium text-muted-foreground">Submitted by</dt><dd className="mt-1 break-all text-sm font-medium text-foreground">{submission.submittedByUserId}</dd></div>
              </dl>
            </section>

            <section className="overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
              <div className="border-b border-border-subtle px-4 py-3 sm:px-5"><h2 className="scolapro-section-title">Preparation items</h2><p className="mt-1 text-sm text-muted-foreground">Snapshot status is retained from submission time.</p></div>
              {items.length === 0 ? <p className="px-4 py-7 text-sm text-muted-foreground sm:px-5">No preparation items are available.</p> : <ul className="divide-y divide-border-subtle">{items.map((item, index) => <li key={item.id} className="grid gap-2 px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-5"><span className="text-xs font-semibold text-muted-foreground">{index + 1}</span><span className="min-w-0 break-all text-sm text-foreground">{item.lessonPreparationId}</span><span className="justify-self-start rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-foreground sm:justify-self-end">{item.preparationStatusSnapshot}</span></li>)}</ul>}
            </section>

            <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
              <div className="flex items-center gap-2"><History className="size-4 text-muted-foreground" /><h2 className="scolapro-section-title">Review history</h2></div>
              {history.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No review events are available.</p> : <ol className="mt-4 space-y-4 border-l border-border-subtle pl-4">{history.map((event) => <li key={event.id} className="relative"><span className="absolute -left-[1.2rem] top-1.5 size-2 rounded-full bg-border-strong" /><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-sm font-semibold capitalize text-foreground">{event.eventKind}</span><span className="text-xs text-muted-foreground">{event.actorRoleSnapshot.replaceAll("_", " ")} · {formatDateTime(event.occurredAt)}</span></div>{event.comment ? <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{event.comment}</p> : null}</li>)}</ol>}
            </section>
          </div>

          <aside className="min-w-0 xl:self-start">
            <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
              <h2 className="scolapro-section-title">Review decision</h2>
              {isPending ? (
                <div className="mt-4 space-y-5">
                  <form action={reviewSubmissionAction} className="space-y-3">
                    <input type="hidden" name="submissionId" value={submission.id} />
                    <label htmlFor="review-comment" className="block text-sm font-medium text-foreground">Review feedback <span className="font-normal text-muted-foreground">(optional)</span></label>
                    <textarea id="review-comment" name="comment" rows={4} className="w-full resize-y rounded-[var(--radius-sm)] border border-border-subtle bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand" placeholder="Record feedback for the teacher." />
                    <button type="submit" className="scolapro-cta inline-flex min-h-11 w-full items-center justify-center gap-2 bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong"><CheckCircle2 className="size-4" />Mark reviewed</button>
                  </form>
                  <div className="border-t border-border-subtle pt-5">
                    <form action={returnSubmissionAction} className="space-y-3">
                      <input type="hidden" name="submissionId" value={submission.id} />
                      <label htmlFor="return-comment" className="block text-sm font-medium text-foreground">Revision feedback</label>
                      <textarea id="return-comment" name="comment" required rows={4} className="w-full resize-y rounded-[var(--radius-sm)] border border-border-subtle bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand" placeholder="Explain what must be revised before resubmission." />
                      <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-border-subtle px-4 text-sm font-semibold text-foreground hover:bg-surface-muted"><RotateCcw className="size-4" />Return for revision</button>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted p-4"><p className="text-sm font-medium text-foreground">Decision finalised {formatDateTime(submission.reviewedAt)}</p>{submission.reviewNote ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{submission.reviewNote}</p> : <p className="mt-2 text-sm text-muted-foreground">No decision note was recorded.</p>}</div>
              )}
            </section>
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
