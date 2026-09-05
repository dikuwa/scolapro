import Link from "next/link";
import { ArrowUpRight, BadgeCheck, ClipboardCheck, FileCheck2, Layers3 } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getAssessmentWorkspaceOverview } from "@/features/academics/server/workspace-overview";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function AssessmentPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/assessment");
  if (context.platformMemberships.length) redirect("/");

  const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);
  const membership = context.memberships.find((item) => allowedRoles.has(item.roleKey));
  if (!membership) redirect("/");

  const academicYear = new Date().getFullYear();
  const overview = await getAssessmentWorkspaceOverview(membership.schoolId, academicYear);
  const canReview = ["school_admin", "principal", "deputy_principal", "hod"].includes(membership.roleKey);

  const metrics = [
    { label: "Assessment schemes", value: overview.schemes, icon: Layers3 },
    { label: "Assessment instances", value: overview.assessmentInstances, icon: ClipboardCheck },
    { label: "Open for marks", value: overview.openInstances, icon: FileCheck2 },
    { label: "Awaiting review", value: overview.submittedInstances, icon: BadgeCheck },
  ];

  return (
    <AppShell>
      <section>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Assessment</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Assessment schemes, mark capture and approval remain linked to official subject offerings and class allocations for {academicYear}.</p></div>
          <Link href="/reports/report-cards" className="scolapro-cta inline-flex min-h-10 items-center gap-2 self-start bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong">Open report cards<ArrowUpRight className="size-4" /></Link>
        </div>
        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon }, index) => <article key={label} className={["flex items-center justify-between gap-4 px-4 py-4", index ? "border-t border-border-subtle sm:border-l sm:border-t-0" : ""].join(" ")}><div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1.5 text-xl font-semibold text-foreground">{value}</p></div><span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><Icon className="size-4" /></span></article>)}
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <section className="rounded-[var(--radius-md)] bg-surface-muted p-5"><h2 className="scolapro-section-title">Capture</h2><p className="scolapro-section-description">Teacher access is constrained to assessment instances connected to active allocations; marks remain revision-safe and auditable.</p></section>
          <section className="rounded-[var(--radius-md)] bg-surface-muted p-5"><h2 className="scolapro-section-title">{canReview ? "Review queue" : "Submission state"}</h2><p className="scolapro-section-description">{canReview ? "Submitted and returned instances surface here as the academic review workload grows." : "Your submitted marks move through the governed review lifecycle before becoming official results."}</p></section>
          <section className="rounded-[var(--radius-md)] bg-surface-muted p-5"><h2 className="scolapro-section-title">Official results</h2><p className="scolapro-section-description">Verified results feed report cards; report-card generation never substitutes an unapproved working mark.</p><Link href="/reports/report-cards" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-strong">Review report-card readiness<ArrowUpRight className="size-3.5" /></Link></section>
        </div>
      </section>
    </AppShell>
  );
}
