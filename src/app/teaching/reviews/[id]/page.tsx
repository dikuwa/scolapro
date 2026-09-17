import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, RotateCcw } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import {
  getReviewSubmission,
  requireTeachingReviewer,
  reviewPreparationSubmissionAction,
} from "@/features/teaching/server/reviews";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-NA", { dateStyle: "medium", timeStyle: value.includes("T") ? "short" : undefined }).format(new Date(value));
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export default async function TeachingReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireTeachingReviewer(`/teaching/reviews/${id}`);
  const submission = await getReviewSubmission(membership.schoolId, id);
  if (!submission) notFound();

  const isPending = submission.status === "submitted";

  return (
    <AppShell>
      <section className="min-w-0">
        <div className="mb-6">
          <Link href="/teaching/reviews" className="mb-3 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Review queue
          </Link>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Preparation submission</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {submission.subjectNames.length ? submission.subjectNames.join(", ") : "Teaching preparation"} · submitted {formatDate(submission.submittedAt)}
              </p>
            </div>
            <span className="self-start rounded-full bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground">{label(submission.status)}</span>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(19rem,.75fr)]">
          <div className="min-w-0 space-y-4">
            <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
              <div className="border-b border-border-subtle px-4 py-4 sm:px-5">
                <h2 className="scolapro-section-title">Submitted preparations</h2>
                <p className="scolapro-section-description">The review records oversight only; teacher preparation content remains unchanged.</p>
              </div>
              <div className="divide-y divide-border-subtle">
                {submission.items.map((item, index) => (
                  <article key={item.id} className="grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{item.subjectName ?? `Preparation ${index + 1}`}</p>
                      <p className="mt-1 text-sm text-muted-foreground">Planned {formatDate(item.plannedOn)} · snapshot {label(item.preparationStatusSnapshot)}</p>
                      <p className="mt-1 break-all text-xs text-muted-foreground">Class {item.registerClassId ?? "—"}</p>
                    </div>
                    <span className="self-start rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-foreground">{label(item.preparationStatus ?? item.preparationStatusSnapshot)}</span>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
              <div className="border-b border-border-subtle px-4 py-4 sm:px-5">
                <h2 className="scolapro-section-title">Review history</h2>
                <p className="scolapro-section-description">Append-only submission and review provenance.</p>
              </div>
              <ol className="divide-y divide-border-subtle">
                {submission.history.map((event) => (
                  <li key={event.id} className="flex gap-3 px-4 py-4 sm:px-5">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface-muted"><Clock3 className="size-3.5" /></span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <p className="text-sm font-semibold text-foreground">{label(event.eventKind)}</p>
                        <p className="text-xs text-muted-foreground">{label(event.actorRole)} · {formatDate(event.occurredAt)}</p>
                      </div>
                      {event.comment ? <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{event.comment}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
            <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
              <h2 className="scolapro-section-title">Review decision</h2>
              <p className="scolapro-section-description">Feedback becomes part of the permanent review event history.</p>

              {isPending ? (
                <form action={reviewPreparationSubmissionAction} className="mt-5 space-y-4">
                  <input type="hidden" name="submissionId" value={submission.id} />
                  <input type="hidden" name="schoolId" value={membership.schoolId} />
                  <div>
                    <label htmlFor="comment" className="text-sm font-medium text-foreground">Feedback</label>
                    <textarea
                      id="comment"
                      name="comment"
                      rows={6}
                      maxLength={4000}
                      placeholder="Add review feedback or revision guidance…"
                      className="mt-2 min-h-32 w-full resize-y rounded-[var(--radius-sm)] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <button
                      type="submit"
                      name="action"
                      value="reviewed"
                      className="scolapro-cta inline-flex min-h-11 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong"
                    >
                      <CheckCircle2 className="size-4" /> Mark reviewed
                    </button>
                    <button
                      type="submit"
                      name="action"
                      value="returned"
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-surface-muted"
                    >
                      <RotateCcw className="size-4" /> Return for revision
                    </button>
                  </div>
                </form>
              ) : (
                <div className="mt-5 rounded-[var(--radius-sm)] bg-surface-muted p-3">
                  <p className="text-sm font-medium text-foreground">This submission is final in its current review cycle.</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">Only submissions still in the submitted state can be reviewed or returned by the governed API.</p>
                  {submission.reviewNote ? <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{submission.reviewNote}</p> : null}
                </div>
              )}
            </section>
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
