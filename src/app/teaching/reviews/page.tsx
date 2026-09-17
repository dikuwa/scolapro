import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, RotateCcw } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getHodReviewQueue, getHodTeachingReadiness } from "@/features/academics/server/hod-review";
import { getUserContext } from "@/lib/auth/get-user-context";

const REVIEW_ROLES = new Set(["school_admin", "principal", "deputy_principal", "hod"]);

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(value));
}

function statusMeta(status: "submitted" | "reviewed" | "returned") {
  if (status === "reviewed") return { label: "Reviewed", icon: CheckCircle2 };
  if (status === "returned") return { label: "Returned", icon: RotateCcw };
  return { label: "Awaiting review", icon: Clock3 };
}

export default async function TeachingReviewsPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/teaching/reviews");
  if (context.platformMemberships.length) redirect("/");

  const membership = context.currentSchoolMembership;
  if (!membership || !REVIEW_ROLES.has(membership.roleKey)) redirect("/teaching");

  const academicYear = new Date().getFullYear();
  const [submissions, readiness] = await Promise.all([
    getHodReviewQueue(membership.schoolId, academicYear),
    getHodTeachingReadiness(membership.schoolId, academicYear),
  ]);
  const awaiting = submissions.filter((submission) => submission.status === "submitted");
  const completed = submissions.filter((submission) => submission.status !== "submitted");

  return (
    <AppShell>
      <section className="min-w-0">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Teaching · {membership.schoolName}</p>
            <h1 className="scolapro-page-title mt-1 text-[clamp(1.3rem,1.08rem+0.55vw,1.75rem)]">Preparation reviews</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {membership.roleKey === "hod"
                ? "Submissions are limited by your current subject responsibility and effective school placement."
                : "School leadership can review preparation submissions across the current school."}
            </p>
          </div>
          <Link href="/teaching" className="inline-flex min-h-10 items-center self-start rounded-[var(--radius-sm)] border border-border-subtle px-3 text-sm font-medium text-foreground hover:bg-surface-muted">
            Teaching workspace
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.8fr)]">
          <div className="min-w-0 space-y-5">
            <section className="overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
              <div className="border-b border-border-subtle px-4 py-3 sm:px-5">
                <h2 className="scolapro-section-title">Awaiting review</h2>
                <p className="mt-1 text-sm text-muted-foreground">{awaiting.length} submission{awaiting.length === 1 ? "" : "s"} require a decision.</p>
              </div>
              {awaiting.length === 0 ? (
                <p className="px-4 py-8 text-sm text-muted-foreground sm:px-5">No preparation submissions are awaiting review in your governed scope.</p>
              ) : (
                <div className="divide-y divide-border-subtle">
                  {awaiting.map((submission) => (
                    <Link key={submission.id} href={`/teaching/reviews/${submission.id}`} className="group grid gap-3 px-4 py-4 hover:bg-surface-muted sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-foreground"><Clock3 className="size-3.5" />Awaiting review</span>
                          <span className="text-xs text-muted-foreground">{submission.scopeKind.replaceAll("_", " ")}</span>
                        </div>
                        <p className="mt-2 text-sm font-medium text-foreground">{submission.itemCount} preparation item{submission.itemCount === 1 ? "" : "s"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Submitted {formatDate(submission.submittedAt)}{submission.termLabel ? ` · ${submission.termLabel}` : ""}</p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-strong">Open review<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
              <div className="border-b border-border-subtle px-4 py-3 sm:px-5"><h2 className="scolapro-section-title">Review history</h2></div>
              {completed.length === 0 ? (
                <p className="px-4 py-7 text-sm text-muted-foreground sm:px-5">No completed review decisions are available yet.</p>
              ) : (
                <div className="divide-y divide-border-subtle">
                  {completed.map((submission) => {
                    const meta = statusMeta(submission.status);
                    const Icon = meta.icon;
                    return (
                      <Link key={submission.id} href={`/teaching/reviews/${submission.id}`} className="flex flex-col gap-3 px-4 py-4 hover:bg-surface-muted sm:flex-row sm:items-center sm:justify-between sm:px-5">
                        <div className="min-w-0"><p className="flex items-center gap-2 text-sm font-medium text-foreground"><Icon className="size-4" />{meta.label} · {submission.itemCount} item{submission.itemCount === 1 ? "" : "s"}</p><p className="mt-1 text-xs text-muted-foreground">Submitted {formatDate(submission.submittedAt)} · Decision {formatDate(submission.reviewedAt)}</p></div>
                        <span className="text-sm font-medium text-brand-strong">View record</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <aside className="min-w-0 rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5 lg:self-start">
            <div className="flex items-start gap-3"><span className="scolapro-tone-warning grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><AlertTriangle className="size-4" /></span><div><h2 className="scolapro-section-title">Readiness exceptions</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">Current {academicYear} exceptions from the governed HOD readiness resolver.</p></div></div>
            {readiness.length === 0 ? (
              <p className="mt-5 rounded-[var(--radius-sm)] bg-surface-muted p-3 text-sm text-muted-foreground">No readiness exceptions are visible in your scope.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {readiness.map((item, index) => <li key={`${item.exceptionKind}-${item.teacherAllocationId ?? item.subjectOfferingId ?? index}`} className="rounded-[var(--radius-sm)] bg-surface-muted p-3"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-foreground">{item.exceptionKind.replaceAll("_", " ")}</span><span className="text-xs text-muted-foreground">{item.severity}</span></div><p className="mt-1.5 text-sm leading-5 text-muted-foreground">{item.detail}</p></li>)}
              </ul>
            )}
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
