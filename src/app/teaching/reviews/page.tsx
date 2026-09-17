import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowUpRight, CheckCircle2, ClipboardCheck } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  getReviewQueue,
  getTeachingReadiness,
  requireTeachingReviewer,
} from "@/features/teaching/server/reviews";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(value));
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export default async function TeachingReviewsPage() {
  const { membership } = await requireTeachingReviewer();
  const academicYear = new Date().getFullYear();
  const [queue, readiness] = await Promise.all([
    getReviewQueue(membership.schoolId, academicYear),
    getTeachingReadiness(membership.schoolId, academicYear),
  ]);

  return (
    <AppShell>
      <section className="min-w-0">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <Link href="/teaching" className="mb-3 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" /> Teaching
            </Link>
            <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Preparation reviews</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {membership.roleKey === "hod"
                ? "Submissions are limited to your current subject responsibility."
                : "Governed school leadership can review submissions across the current school."}
            </p>
          </div>
          <div className="self-start rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 py-2 text-sm text-muted-foreground">
            {membership.schoolName} · {academicYear}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)]">
          <section className="min-w-0 rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
            <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-4 sm:px-5">
              <div>
                <h2 className="scolapro-section-title">Awaiting review</h2>
                <p className="scolapro-section-description">Submitted preparation packs visible within your governed scope.</p>
              </div>
              <span className="scolapro-tone-brand grid min-w-9 place-items-center rounded-full px-2 py-1 text-sm font-semibold">{queue.length}</span>
            </div>

            {queue.length === 0 ? (
              <div className="px-4 py-10 text-center sm:px-5">
                <CheckCircle2 className="mx-auto size-7 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium text-foreground">No submissions are waiting in your scope.</p>
                <p className="mt-1 text-sm text-muted-foreground">New submissions will appear here when the database authorizes your current review scope.</p>
              </div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {queue.map((submission) => (
                  <article key={submission.id} className="grid min-w-0 gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-foreground">{label(submission.scopeKind)}</span>
                        <span className="text-xs text-muted-foreground">Submitted {formatDate(submission.submittedAt)}</span>
                      </div>
                      <h3 className="mt-2 truncate text-sm font-semibold text-foreground">
                        {submission.subjectNames.length ? submission.subjectNames.join(", ") : "Preparation submission"}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {submission.preparationCount} preparation{submission.preparationCount === 1 ? "" : "s"}
                        {submission.weekStart && submission.weekEnd ? ` · ${formatDate(submission.weekStart)}–${formatDate(submission.weekEnd)}` : ""}
                        {submission.termLabel ? ` · ${submission.termLabel}` : ""}
                      </p>
                    </div>
                    <Link
                      href={`/teaching/reviews/${submission.id}`}
                      className="scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong md:justify-start"
                    >
                      Review <ArrowUpRight className="size-4" />
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside className="min-w-0 rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <div className="flex items-start gap-3">
              <span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><ClipboardCheck className="size-4" /></span>
              <div className="min-w-0">
                <h2 className="scolapro-section-title">Readiness exceptions</h2>
                <p className="scolapro-section-description">Operational exceptions from the governed readiness resolver; no ranking or teacher score.</p>
              </div>
            </div>

            {readiness.length === 0 ? (
              <p className="mt-5 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-3 text-sm text-muted-foreground">No readiness exceptions are currently visible in your scope.</p>
            ) : (
              <div className="mt-5 space-y-3">
                {readiness.map((exception, index) => (
                  <div key={`${exception.exceptionKind}-${exception.teacherAllocationId ?? index}`} className="rounded-[var(--radius-sm)] bg-surface-muted p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{label(exception.exceptionKind)}</p>
                        <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{exception.detail ?? "Readiness attention required."}</p>
                        {exception.severity ? <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{exception.severity}</p> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
