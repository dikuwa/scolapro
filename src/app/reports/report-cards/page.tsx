import { Download, FileCheck2, GraduationCap, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ReportCardManualRemarkEditor } from "@/features/reporting/report-card-manual-remark-editor";
import { PagedReportCardManagement } from "@/features/reporting/paged-report-card-management";
import { ReportBatchWorkerPulse } from "@/features/reporting/report-batch-worker-pulse";
import { ReportCardStatusReadonly } from "@/features/reporting/report-card-status-readonly";
import { getReportCardAcademicYear } from "@/features/reporting/server/report-card-academic-year";
import { getIndividualReportCardLearnerOptions } from "@/features/reporting/server/individual-report-card-learners";
import {
  getReportCardManagementMeta,
  getReportCardPageArtifacts,
} from "@/features/reporting/server/report-card-management";
import {
  getReportCardScopeSummary,
  getReportCardStatusForEnrolment,
  getReportCardStatusPage,
  type ReportCardScopeType,
  type ReportCardStatusFilter,
  type ReportCardStatusPage,
} from "@/features/reporting/server/paged-report-cards";
import { getUserContext } from "@/lib/auth/get-user-context";

const managerRoles = new Set(["school_admin", "principal", "deputy_principal"]);
const viewerRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);
const reportStatuses = new Set<ReportCardStatusFilter>(["all", "not_generated", "generated", "certified", "published"]);
const scopeTypes = new Set<string>(["school", "grade", "class", "custom"]);

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type ManagementScopeType = ReportCardScopeType | "custom";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function validUuid(value: string | undefined) {
  if (!value) return "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : "";
}

function parseCommonParams(params: Record<string, string | string[] | undefined>) {
  const query = (firstParam(params.q) ?? "").trim().slice(0, 120);
  const rawStatus = firstParam(params.status) ?? "all";
  const status: ReportCardStatusFilter = reportStatuses.has(rawStatus as ReportCardStatusFilter)
    ? rawStatus as ReportCardStatusFilter
    : "all";
  const rawTerm = Number(firstParam(params.term) ?? 1);
  const termNumber = Number.isInteger(rawTerm) && rawTerm >= 1 && rawTerm <= 3 ? rawTerm : 1;
  const rawPage = Number(firstParam(params.page) ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  return { query, status, termNumber, page };
}

function individualStatusPage(row: Awaited<ReturnType<typeof getReportCardStatusForEnrolment>>): ReportCardStatusPage {
  return {
    rows: row ? [row] : [],
    totalCount: row ? 1 : 0,
    page: 1,
    pageSize: 1,
    pageCount: 1,
  };
}

export default async function ReportCardsPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/reports/report-cards");
  if (context.platformMemberships.length) redirect("/");
  const membership = context.memberships.find((item) => managerRoles.has(item.roleKey))
    ?? context.memberships.find((item) => viewerRoles.has(item.roleKey));
  if (!membership) redirect("/");

  const canManageReports = managerRoles.has(membership.roleKey);
  const academicYear = await getReportCardAcademicYear(membership.schoolId);
  const params = await searchParams;
  const common = parseCommonParams(params);

  if (!canManageReports) {
    const statusPage = await getReportCardStatusPage({
      schoolId: membership.schoolId,
      academicYear,
      termNumber: common.termNumber,
      query: common.query,
      status: common.status,
      page: common.page,
      pageSize: 50,
    });

    return <AppShell><section>
      <div className="mb-6"><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Report cards</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">View report-card status for learners within your teaching scope. Generation, certification, publishing and printing remain with School Administration and school management.</p></div>
      <ReportCardStatusReadonly statusPage={statusPage} termNumber={common.termNumber} query={common.query} status={common.status} />
    </section></AppShell>;
  }

  const filterGradeId = validUuid(firstParam(params.grade));
  const filterClassId = validUuid(firstParam(params.class));
  const rawScope = firstParam(params.scope) ?? "school";
  const scopeType: ManagementScopeType = scopeTypes.has(rawScope)
    ? rawScope as ManagementScopeType
    : "school";
  const scopeGradeId = validUuid(firstParam(params.scopeGrade));
  const scopeClassId = validUuid(firstParam(params.scopeClass));
  const individualLearnerId = validUuid(firstParam(params.individual));

  const individualLearners = await getIndividualReportCardLearnerOptions(membership.schoolId, academicYear);
  const individualOption = individualLearnerId
    ? individualLearners.find((item) => item.enrolmentId === individualLearnerId)
    : undefined;

  const [meta, selectedIndividualRow, bulkStatusPage, wholeSchoolSummary] = await Promise.all([
    getReportCardManagementMeta(membership.schoolId, academicYear),
    individualOption
      ? getReportCardStatusForEnrolment({
          schoolId: membership.schoolId,
          academicYear,
          termNumber: common.termNumber,
          enrolmentId: individualOption.enrolmentId,
        })
      : Promise.resolve(null),
    individualOption
      ? Promise.resolve(null)
      : getReportCardStatusPage({
          schoolId: membership.schoolId,
          academicYear,
          termNumber: common.termNumber,
          query: common.query,
          gradeId: filterGradeId || undefined,
          classId: filterClassId || undefined,
          status: common.status,
          page: common.page,
          pageSize: 50,
        }),
    getReportCardScopeSummary({
      schoolId: membership.schoolId,
      academicYear,
      termNumber: common.termNumber,
      scopeType: "school",
    }),
  ]);

  const statusPage = individualOption
    ? individualStatusPage(selectedIndividualRow)
    : bulkStatusPage as ReportCardStatusPage;

  let scopeSummary = scopeType === "school" ? wholeSchoolSummary : null;
  if (scopeType === "grade" && scopeGradeId) {
    scopeSummary = await getReportCardScopeSummary({
      schoolId: membership.schoolId,
      academicYear,
      termNumber: common.termNumber,
      scopeType: "grade",
      scopeId: scopeGradeId,
    });
  } else if (scopeType === "class" && scopeClassId) {
    scopeSummary = await getReportCardScopeSummary({
      schoolId: membership.schoolId,
      academicYear,
      termNumber: common.termNumber,
      scopeType: "class",
      scopeId: scopeClassId,
    });
  }

  const pageArtifacts = await getReportCardPageArtifacts(
    membership.schoolId,
    statusPage.rows.flatMap((row) => row.snapshotId ? [row.snapshotId] : []),
  );

  const generatedCount = wholeSchoolSummary.total - wholeSchoolSummary.notGenerated;
  const certifiedCount = wholeSchoolSummary.certified + wholeSchoolSummary.published;
  const readyBatchExports = meta.batches.filter((batch) => batch.operation === "pdf" && batch.exportStatus === "ready").slice(0, 4);
  const hasActiveBatchWork = meta.batches.some((batch) =>
    batch.status === "pending" || batch.status === "processing" || batch.exportStatus === "waiting" || batch.exportStatus === "processing"
  );

  return <AppShell><section>
    <ReportBatchWorkerPulse active={hasActiveBatchWork} />
    <div className="mb-6"><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Report cards</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Prepare end-of-term reports by school, grade, class or custom learner selection. Bulk jobs keep progress and explicit skipped-learner reasons, while individual mode remains available for one-off copies.</p></div>
    <div className="mb-5 grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-3">
      <div className="flex items-center justify-between gap-3 px-4 py-4"><div><p className="text-xs font-medium text-muted-foreground">Current learners</p><p className="mt-1.5 text-xl font-semibold text-[color:var(--accent-indigo)]">{wholeSchoolSummary.total}</p></div><span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><Users className="size-4" /></span></div>
      <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0"><div><p className="text-xs font-medium text-muted-foreground">Term snapshots</p><p className="mt-1.5 text-xl font-semibold text-[color:var(--accent-sky)]">{generatedCount}</p></div><span className="scolapro-tone-sky grid size-9 place-items-center rounded-[var(--radius-sm)]"><GraduationCap className="size-4" /></span></div>
      <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0"><div><p className="text-xs font-medium text-muted-foreground">Certified / published</p><p className="mt-1.5 text-xl font-semibold text-[color:var(--accent-mint)]">{certifiedCount}</p></div><span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><FileCheck2 className="size-4" /></span></div>
    </div>
    {readyBatchExports.length ? <div className="mb-5 rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)]"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="scolapro-section-title">Ready to print</h2><p className="scolapro-section-description">Combined PDFs from completed bulk preparation jobs.</p></div><div className="flex flex-wrap gap-2">{readyBatchExports.map((batch) => <a key={batch.id} href={`/api/report-card-batches/${batch.id}/export`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] bg-success-soft px-3 text-xs font-semibold text-[color:var(--success)] transition-colors hover:bg-[color:var(--success)] hover:text-white"><Download className="size-3.5" />{batch.scopeLabel} · T{batch.termNumber}{batch.exportPageCount ? ` · ${batch.exportPageCount} pp` : ""}</a>)}</div></div></div> : null}
    {individualOption && selectedIndividualRow?.snapshotId && selectedIndividualRow.reportStatus === "generated" ? <ReportCardManualRemarkEditor snapshotId={selectedIndividualRow.snapshotId} learnerName={selectedIndividualRow.name} remark={selectedIndividualRow.remark} /> : null}
    <PagedReportCardManagement
      statusPage={statusPage}
      individualLearners={individualLearners}
      individualLearnerId={individualOption?.enrolmentId ?? ""}
      terms={meta.terms}
      grades={meta.grades}
      classes={meta.classes}
      batches={meta.batches}
      batchIssues={meta.batchIssues}
      renderJobs={pageArtifacts.renderJobs}
      documents={pageArtifacts.documents}
      academicYear={meta.academicYear}
      termNumber={common.termNumber}
      query={individualOption ? "" : common.query}
      status={individualOption ? "all" : common.status}
      filterGradeId={individualOption ? "" : filterGradeId}
      filterClassId={individualOption ? "" : filterClassId}
      scopeType={scopeType}
      scopeGradeId={scopeGradeId}
      scopeClassId={scopeClassId}
      scopeSummary={scopeSummary}
    />
  </section></AppShell>;
}
