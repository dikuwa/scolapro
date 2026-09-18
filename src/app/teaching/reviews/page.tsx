import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ReviewQueue } from "@/features/teaching/components/review-queue";
import { ProfessionalFileReviewQueue } from "@/features/teaching/components/professional-file-review-queue";
import { getReviewQueue, resolveReviewScope } from "@/features/teaching/server/review-queries";
import { getProfessionalFileReviewQueue } from "@/features/teaching/server/professional-file-review";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";
import { getUserContext } from "@/lib/auth/get-user-context";

const exceptionKindLabels: Record<string, string> = {
  unsubmitted_preparation: "Unsubmitted preparation",
  unreviewed_submission: "Submission awaiting review",
  curriculum_capacity_risk: "Curriculum capacity risk",
  behind_plan: "Class behind plan",
};

const severityTone: Record<string, string> = {
  high: "bg-danger-soft text-[color:var(--danger)]",
  medium: "bg-warning-soft text-[color:var(--warning)]",
  low: "bg-surface-muted text-muted-foreground",
};

/**
 * HOD / leadership preparation-review queue for the current school.
 *
 * The reviewer scope is resolved from the repository current-school convention
 * (see resolveReviewScope) and row visibility is decided by the merged RLS
 * policies, so a stale placement, another school or Platform Support cannot see
 * a queue here.
 */
export default async function ReviewsPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/teaching/reviews");

  const scope = await resolveReviewScope();
  if (!scope) redirect("/");

  const academicYear = await getGovernedAcademicYear(scope.schoolId);
  const [{ rows, readiness }, professionalFileRows] = await Promise.all([
    getReviewQueue(academicYear),
    getProfessionalFileReviewQueue(),
  ]);
  const withoutAuthority = readiness.state === "denied" && rows.length === 0;

  return (
    <AppShell>
      <section className="pb-10">
        <Link href="/teaching" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Teaching
        </Link>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Preparation review</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Preparation submissions awaiting your review at {context.currentSchoolMembership?.schoolName ?? "your school"} for {academicYear}.
          </p>
        </div>

        {readiness.state === "ok" && readiness.exceptions.length > 0 ? (
          <section className="mb-5 rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <h2 className="scolapro-section-title">Operational exceptions</h2>
            <p className="scolapro-section-description">Readiness exceptions reported by the school teaching readiness system for your review scope.</p>
            <ul className="mt-3 space-y-2">
              {readiness.exceptions.map((exception, index) => (
                <li
                  key={`${exception.exceptionKind}-${exception.subjectOfferingId ?? index}`}
                  className="flex flex-wrap items-start gap-2 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2"
                >
                  <span className={`rounded-[var(--radius-xs)] px-2 py-0.5 text-[0.64rem] font-medium ${severityTone[exception.severity] ?? severityTone.low}`}>
                    {exception.severity}
                  </span>
                  <span className="min-w-0 flex-1 text-sm break-words text-foreground">
                    <span className="font-medium">{exceptionKindLabels[exception.exceptionKind] ?? "Readiness exception"}</span>
                    {" · "}
                    <span className="text-muted-foreground">{exception.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {readiness.state === "ok" && readiness.exceptions.length === 0 && rows.length > 0 ? (
          <p className="mb-5 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2 text-xs text-muted-foreground">
            No operational readiness exceptions were reported in your current review scope.
          </p>
        ) : null}

        {readiness.state !== "ok" ? (
          <section
            role="status"
            className="mb-5 flex flex-wrap items-start gap-3 rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"
          >
            <span className="scolapro-tone-amber grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]">
              <ShieldAlert className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="scolapro-section-title">Readiness exceptions unavailable</h2>
              <p className="scolapro-section-description break-words">{readiness.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                This is not an empty readiness result: exceptions could not be confirmed for your current review authority.
              </p>
            </div>
          </section>
        ) : null}

        {withoutAuthority ? (
          <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-5 text-center">
            <h2 className="scolapro-section-title">Review authority not confirmed</h2>
            <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
              Your current placement does not confirm review authority for this school, so no queue is shown. Ask a school administrator to check your department responsibility or staff placement.
            </p>
          </section>
        ) : (
          <ReviewQueue rows={rows} />
        )}
        <ProfessionalFileReviewQueue rows={professionalFileRows} />
      </section>
    </AppShell>
  );
}
