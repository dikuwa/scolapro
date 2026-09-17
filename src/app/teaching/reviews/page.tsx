import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getReviewQueue } from "@/features/teaching/server/review-queries";
import { getUserContext } from "@/lib/auth/get-user-context";
import { ReviewQueue } from "@/features/teaching/components/review-queue";

export default async function ReviewsPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/teaching/reviews");
  if (context.platformMemberships.length) redirect("/");

  const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod"]);
  const membership = context.memberships.find((item) => allowedRoles.has(item.roleKey));
  if (!membership) redirect("/");

  const academicYear = new Date().getFullYear();
  const { rows, exceptions } = await getReviewQueue(membership.schoolId, academicYear, membership.roleKey, membership.id);

  return (
    <AppShell>
      <section>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">HOD Review Queue</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Preparation submissions awaiting your review for academic year {academicYear}.
            </p>
          </div>
        </div>

        {exceptions.length > 0 && (
          <div className="mb-5 rounded-[var(--radius-md)] border border-border-subtle bg-surface p-5">
            <h2 className="scolapro-section-title">Readiness Exceptions</h2>
            <p className="scolapro-section-description">Exceptions detected by the school readiness system.</p>
            <div className="mt-3 space-y-2">
              {exceptions.map((exc, index) => (
                <div key={index} className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-subtle px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${exc.severity === "high" ? "bg-danger-soft text-[color:var(--danger)]" : exc.severity === "medium" ? "bg-brand-soft text-brand-strong" : "bg-surface-muted text-muted-foreground"}`}>
                    {exc.severity}
                  </span>
                  <span className="text-sm text-foreground">{exc.detail}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <ReviewQueue rows={rows} />
      </section>
    </AppShell>
  );
}
