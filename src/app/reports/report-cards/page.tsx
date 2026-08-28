import { FileCheck2, GraduationCap, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ReportCardWorkspace } from "@/features/reporting/report-card-workspace";
import { getReportCardWorkspace } from "@/features/reporting/server/report-cards";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function ReportCardsPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/reports/report-cards");
  const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod"]);
  const membership = context.memberships.find((item) => allowedRoles.has(item.roleKey));
  if (!membership) redirect("/");

  const academicYear = new Date().getFullYear();
  const workspace = await getReportCardWorkspace(membership.schoolId, academicYear);
  const certifiedCount = workspace.snapshots.filter((snapshot) => snapshot.status === "certified" || snapshot.status === "published").length;

  return <AppShell><section>
    <div className="mb-6"><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Report cards</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Generate governed term snapshots from approved official results, then certify the exact version used for printing or parent delivery.</p></div>
    <div className="mb-5 grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-3">
      <div className="flex items-center justify-between gap-3 px-4 py-4"><div><p className="text-xs font-medium text-muted-foreground">Current learners</p><p className="mt-1.5 text-xl font-semibold text-[color:var(--accent-indigo)]">{workspace.learners.length}</p></div><span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><Users className="size-4" /></span></div>
      <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0"><div><p className="text-xs font-medium text-muted-foreground">Snapshots</p><p className="mt-1.5 text-xl font-semibold text-[color:var(--accent-sky)]">{workspace.snapshots.length}</p></div><span className="scolapro-tone-sky grid size-9 place-items-center rounded-[var(--radius-sm)]"><GraduationCap className="size-4" /></span></div>
      <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0"><div><p className="text-xs font-medium text-muted-foreground">Certified</p><p className="mt-1.5 text-xl font-semibold text-[color:var(--accent-mint)]">{certifiedCount}</p></div><span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><FileCheck2 className="size-4" /></span></div>
    </div>
    <ReportCardWorkspace learners={workspace.learners} snapshots={workspace.snapshots} terms={workspace.terms} renderJobs={workspace.renderJobs} documents={workspace.documents} />
  </section></AppShell>;
}
