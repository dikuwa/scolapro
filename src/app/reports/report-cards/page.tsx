import { Download, FileCheck2, GraduationCap, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ReportBatchWorkerPulse } from "@/features/reporting/report-batch-worker-pulse";
import { ReportCardStatusReadonly } from "@/features/reporting/report-card-status-readonly";
import { ReportCardWorkspace } from "@/features/reporting/report-card-workspace";
import { getReportCardWorkspace } from "@/features/reporting/server/report-cards";
import { getReportCardStatusPage, type ReportCardStatusFilter } from "@/features/reporting/server/paged-report-cards";
import { getUserContext } from "@/lib/auth/get-user-context";

const managerRoles = new Set(["school_admin", "principal", "deputy_principal"]);
const viewerRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);
const reportStatuses = new Set<ReportCardStatusFilter>(["all", "not_generated", "generated", "certified", "published"]);

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReportCardsPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/reports/report-cards");
  const membership = context.memberships.find((item) => managerRoles.has(item.roleKey)) ?? context.memberships.find((item) => viewerRoles.has(item.roleKey));
  if (!membership) redirect("/");

  const canManageReports = managerRoles.has(membership.roleKey);
  const academicYear = new Date().getFullYear();

  if (!canManageReports) {
    const params = await searchParams;
    const query = (firstParam(params.q) ?? "").trim().slice(0, 120);
    const rawStatus = firstParam(params.status) ?? "all";
    const status: ReportCardStatusFilter = reportStatuses.has(rawStatus as ReportCardStatusFilter) ? rawStatus as ReportCardStatusFilter : "all";
    const rawTerm = Number(firstParam(params.term) ?? 1);
    const termNumber = Number.isInteger(rawTerm) && rawTerm >= 1 && rawTerm <= 3 ? rawTerm : 1;
    const rawPage = Number(firstParam(params.page) ?? 1);
    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const statusPage = await getReportCardStatusPage({
      schoolId: membership.schoolId,
      academicYear,
      termNumber,
      query,
      status,
      page,
      pageSize: 50,
    });

    return <AppShell><section>
      <div className="mb-6"><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Report cards</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">View report-card status for learners within your teaching scope. Generation, certification, publishing and printing remain with School Administration and school management.</p></div>
      <ReportCardStatusReadonly statusPage={statusPage} termNumber={termNumber} query={query} status={status} />
    </section></AppShell>;
  }

  const workspace = await getReportCardWorkspace(membership.schoolId, academicYear);
  const certifiedCount = workspace.snapshots.filter((snapshot) => snapshot.status === "certified" || snapshot.status === "published").length;
  const readyBatchExports = workspace.batches.filter((batch) => batch.operation === "pdf" && batch.exportStatus === "ready").slice(0, 4);
  const hasActiveBatchWork = workspace.batches.some((batch) =>
    batch.status === "pending" || batch.status === "processing" || batch.exportStatus === "waiting" || batch.exportStatus === "processing"
  );

  return <AppShell><section>
    <ReportBatchWorkerPulse active={hasActiveBatchWork} />
    <div className="mb-6"><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Report cards</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Prepare end-of-term reports by school, grade, class or custom learner selection. Bulk jobs keep progress and explicit skipped-learner reasons, while individual mode remains available for one-off copies.</p></div>
    <div className="mb-5 grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-3">
      <div className="flex items-center justify-between gap-3 px-4 py-4"><div><p className="text-xs font-medium text-muted-foreground">Visible learners</p><p className="mt-1.5 text-xl font-semibold text-[color:var(--accent-indigo)]">{workspace.learners.length}</p></div><span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><Users className="size-4" /></span></div>
      <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0"><div><p className="text-xs font-medium text-muted-foreground">Snapshots</p><p className="mt-1.5 text-xl font-semibold text-[color:var(--accent-sky)]">{workspace.snapshots.length}</p></div><span className="scolapro-tone-sky grid size-9 place-items-center rounded-[var(--radius-sm)]"><GraduationCap className="size-4" /></span></div>
      <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0"><div><p className="text-xs font-medium text-muted-foreground">Certified</p><p className="mt-1.5 text-xl font-semibold text-[color:var(--accent-mint)]">{certifiedCount}</p></div><span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><FileCheck2 className="size-4" /></span></div>
    </div>
    {readyBatchExports.length ? <div className="mb-5 rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)]"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="scolapro-section-title">Ready to print</h2><p className="scolapro-section-description">Combined PDFs from completed bulk preparation jobs.</p></div><div className="flex flex-wrap gap-2">{readyBatchExports.map((batch) => <a key={batch.id} href={`/api/report-card-batches/${batch.id}/export`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] bg-success-soft px-3 text-xs font-semibold text-[color:var(--success)] transition-colors hover:bg-[color:var(--success)] hover:text-white"><Download className="size-3.5" />{batch.scopeLabel} · T{batch.termNumber}{batch.exportPageCount ? ` · ${batch.exportPageCount} pp` : ""}</a>)}</div></div></div> : null}
    <ReportCardWorkspace
      learners={workspace.learners}
      snapshots={workspace.snapshots}
      terms={workspace.terms}
      renderJobs={workspace.renderJobs}
      documents={workspace.documents}
      batches={workspace.batches}
      batchIssues={workspace.batchIssues}
      academicYear={workspace.academicYear}
      canManageReports={canManageReports}
    />
  </section></AppShell>;
}
