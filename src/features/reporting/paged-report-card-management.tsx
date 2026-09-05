"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownAZ,
  ArrowUpAZ,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  FilePlus2,
  FileText,
  Layers3,
  Printer,
  Search,
  Send,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import {
  certifyReportCardWithState,
  createReportCardBatch,
  generateReportCard,
  publishReportCardWithState,
  queueReportCardRender,
  type ReportCardActionState,
} from "@/features/reporting/server/actions";
import type { IndividualReportCardLearnerOption } from "@/features/reporting/server/individual-report-card-learners";
import type {
  ReportCardBatchIssueRow,
  ReportCardBatchRow,
  ReportCardDocumentRow,
  ReportCardRenderJobRow,
} from "@/features/reporting/server/report-cards";
import type {
  ReportCardClassOption,
  ReportCardGradeOption,
} from "@/features/reporting/server/report-card-management";
import type {
  ReportCardScopeSummary,
  ReportCardScopeType,
  ReportCardStatusFilter,
  ReportCardStatusPage,
  ReportCardStatusPageRow,
} from "@/features/reporting/server/paged-report-cards";

const initialState: ReportCardActionState = {};
const actionButton = "cursor-pointer transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft active:translate-y-px";

type ScopeType = ReportCardScopeType | "custom";
type BatchOperation = "generate" | "certify" | "publish" | "pdf";
type CustomSort = "asc" | "desc";

const statusLabels: Record<Exclude<ReportCardStatusFilter, "all">, string> = {
  not_generated: "Not generated",
  generated: "Generated",
  certified: "Certified",
  published: "Published",
};

const statusClasses: Record<Exclude<ReportCardStatusFilter, "all">, string> = {
  not_generated: "bg-surface-muted text-muted-foreground",
  generated: "bg-warning-soft text-[color:var(--warning)]",
  certified: "bg-success-soft text-[color:var(--success)]",
  published: "bg-brand-soft text-brand-strong",
};

type Props = {
  statusPage: ReportCardStatusPage;
  individualLearners: IndividualReportCardLearnerOption[];
  individualLearnerId: string;
  terms: { termNumber: number; name: string }[];
  grades: ReportCardGradeOption[];
  classes: ReportCardClassOption[];
  batches: ReportCardBatchRow[];
  batchIssues: ReportCardBatchIssueRow[];
  renderJobs: ReportCardRenderJobRow[];
  documents: ReportCardDocumentRow[];
  academicYear: number;
  termNumber: number;
  query: string;
  status: ReportCardStatusFilter;
  filterGradeId: string;
  filterClassId: string;
  scopeType: ScopeType;
  scopeGradeId: string;
  scopeClassId: string;
  scopeSummary: ReportCardScopeSummary | null;
};

function buildHref(input: Props, page: number) {
  const params = new URLSearchParams();
  params.set("term", String(input.termNumber));
  if (input.query) params.set("q", input.query);
  if (input.status !== "all") params.set("status", input.status);
  if (input.filterGradeId) params.set("grade", input.filterGradeId);
  if (input.filterClassId) params.set("class", input.filterClassId);
  if (input.scopeType !== "school") params.set("scope", input.scopeType);
  if (input.scopeGradeId) params.set("scopeGrade", input.scopeGradeId);
  if (input.scopeClassId) params.set("scopeClass", input.scopeClassId);
  if (page > 1) params.set("page", String(page));
  return `/reports/report-cards?${params.toString()}`;
}

function BatchButton({ operation, enrolmentIds, academicYear, termNumber, scopeType, scopeId, scopeLabel, scopeCount, disabled }: {
  operation: BatchOperation;
  enrolmentIds: string[];
  academicYear: number;
  termNumber: number;
  scopeType: ScopeType;
  scopeId?: string | null;
  scopeLabel: string;
  scopeCount: number;
  disabled: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createReportCardBatch, initialState);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) { toast.success(state.message); router.refresh(); }
    else toast.error(state.message);
  }, [router, state]);

  const config = operation === "generate"
    ? { label: "Generate snapshots", Icon: FilePlus2, className: "bg-brand text-white hover:brightness-95" }
    : operation === "certify"
      ? { label: "Certify drafts", Icon: BadgeCheck, className: "bg-success-soft text-[color:var(--success)] hover:bg-[color:var(--success)] hover:text-white" }
      : operation === "publish"
        ? { label: "Publish certified", Icon: Send, className: "bg-info-soft text-[color:var(--info)] hover:bg-[color:var(--info)] hover:text-white" }
        : { label: "Prepare PDFs", Icon: Printer, className: "bg-brand-soft text-brand-strong hover:bg-brand hover:text-white" };
  const missingScopeId = (scopeType === "grade" || scopeType === "class") && !scopeId;

  return <form action={action}>
    <input type="hidden" name="academicYear" value={academicYear} />
    <input type="hidden" name="termNumber" value={termNumber} />
    <input type="hidden" name="scopeType" value={scopeType} />
    {scopeId ? <input type="hidden" name="scopeId" value={scopeId} /> : null}
    <input type="hidden" name="scopeLabel" value={scopeLabel} />
    <input type="hidden" name="operation" value={operation} />
    {scopeType === "custom" ? enrolmentIds.map((enrolmentId) => <input key={enrolmentId} type="hidden" name="enrolmentId" value={enrolmentId} />) : null}
    <button type="submit" disabled={disabled || pending || scopeCount === 0 || missingScopeId} className={`${actionButton} inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45 ${config.className}`}>
      {pending ? <Spinner className="size-3.5" /> : <config.Icon className="size-3.5" />}{pending ? "Starting…" : config.label}
    </button>
  </form>;
}

function BatchProgress({ batch, issues, learnerByEnrolment }: { batch: ReportCardBatchRow; issues: ReportCardBatchIssueRow[]; learnerByEnrolment: Map<string, string> }) {
  const progress = batch.totalItems ? Math.round((batch.processedItems / batch.totalItems) * 100) : 0;
  const active = batch.status === "pending" || batch.status === "processing";
  const relevantIssues = issues.filter((issue) => issue.batchId === batch.id).slice(0, 5);
  return <div className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-3.5 shadow-[var(--shadow-xs)]">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold">{batch.operation.replaceAll("_", " ")}</p><p className="mt-1 text-[0.67rem] text-muted-foreground">{batch.scopeLabel} · Term {batch.termNumber}</p></div><span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.62rem] font-semibold ${active ? "bg-info-soft text-[color:var(--info)]" : batch.status === "partial" ? "bg-warning-soft text-[color:var(--warning)]" : "bg-success-soft text-[color:var(--success)]"}`}>{batch.status}</span></div>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, progress)}%` }} /></div>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.65rem] text-muted-foreground"><span>{batch.processedItems}/{batch.totalItems}</span><span>{batch.completedItems} completed</span><span>{batch.skippedItems} skipped</span><span>{batch.failedItems} failed</span></div>
    {batch.operation === "pdf" ? <div className="mt-2 text-[0.65rem] text-muted-foreground">Combined PDF: <span className="font-medium text-foreground">{batch.exportStatus.replaceAll("_", " ")}</span>{batch.exportPageCount ? ` · ${batch.exportPageCount} pages` : ""}</div> : null}
    {batch.operation === "pdf" && batch.exportStatus === "ready" ? <a href={`/api/report-card-batches/${batch.id}/export`} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-success-soft px-2.5 text-[0.68rem] font-semibold text-[color:var(--success)]"><Download className="size-3.5" />Open combined PDF</a> : null}
    {batch.exportStatus === "failed" && batch.exportError ? <div className="mt-2 flex items-start gap-1.5 text-[0.65rem] text-[color:var(--danger)]"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{batch.exportError}</div> : null}
    {relevantIssues.length ? <div className="mt-2 border-t border-border-subtle pt-2"><p className="text-[0.65rem] font-semibold text-muted-foreground">Skipped / failed learners</p>{relevantIssues.map((issue) => <p key={`${issue.batchId}:${issue.enrolmentId}`} className="mt-1 text-[0.65rem] text-muted-foreground"><span className="font-medium text-foreground">{learnerByEnrolment.get(issue.enrolmentId) ?? "Learner"}</span> — {issue.message ?? issue.resultCode ?? issue.status}</p>)}</div> : null}
  </div>;
}

function IndividualPanel({ row, termNumber, renderJobs, documents }: { row: ReportCardStatusPageRow | undefined; termNumber: number; renderJobs: ReportCardRenderJobRow[]; documents: ReportCardDocumentRow[] }) {
  const router = useRouter();
  const [generateState, generateAction, generatePending] = useActionState(generateReportCard, initialState);
  const [certifyState, certifyAction, certifyPending] = useActionState(certifyReportCardWithState, initialState);
  const [publishState, publishAction, publishPending] = useActionState(publishReportCardWithState, initialState);
  const [pdfState, pdfAction, pdfPending] = useActionState(queueReportCardRender, initialState);
  const [htmlState, htmlAction, htmlPending] = useActionState(queueReportCardRender, initialState);

  useEffect(() => {
    const state = [generateState, certifyState, publishState, pdfState, htmlState].find((item) => item.message);
    if (!state?.message) return;
    if (state.success) { toast.success(state.message); router.refresh(); }
    else toast.error(state.message);
  }, [certifyState, generateState, htmlState, pdfState, publishState, router]);

  if (!row) return <div className="rounded-[var(--radius-sm)] border border-dashed border-border p-5 text-center text-xs text-muted-foreground">Choose any current learner in the school for an exception, certification, publication or reprint.</div>;

  const pdfDocument = row.snapshotId ? documents.find((item) => item.snapshotId === row.snapshotId && item.documentFormat === "pdf") ?? null : null;
  const htmlDocument = row.snapshotId ? documents.find((item) => item.snapshotId === row.snapshotId && item.documentFormat === "html") ?? null : null;
  const pdfJob = row.snapshotId ? renderJobs.find((item) => item.snapshotId === row.snapshotId && item.documentFormat === "pdf") ?? null : null;
  const htmlJob = row.snapshotId ? renderJobs.find((item) => item.snapshotId === row.snapshotId && item.documentFormat === "html") ?? null : null;
  const lifecyclePending = certifyPending || publishPending;

  return <div className="rounded-[var(--radius-sm)] bg-surface-muted p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold">{row.name}</p><p className="mt-1 text-[0.67rem] text-muted-foreground">{row.admissionNumber ?? "No admission number"} · {row.grade} · {row.registerClass}</p></div><span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-semibold ${statusClasses[row.reportStatus]}`}>{statusLabels[row.reportStatus]}</span></div>
    {row.reportStatus === "not_generated" ? <form action={generateAction} className="mt-3"><input type="hidden" name="enrolmentId" value={row.enrolmentId} /><input type="hidden" name="termNumber" value={termNumber} /><button type="submit" disabled={generatePending} className={`${actionButton} inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] bg-brand px-3 text-xs font-semibold text-white disabled:opacity-50`}>{generatePending ? <Spinner className="size-3.5" /> : <FilePlus2 className="size-3.5" />}{generatePending ? "Generating…" : "Generate snapshot"}</button></form> : null}
    {row.snapshotId ? <div className="mt-3 flex flex-wrap gap-2">
      {row.reportStatus === "generated" ? <form action={certifyAction}><input type="hidden" name="snapshotId" value={row.snapshotId} /><button type="submit" disabled={certifyPending} className={`${actionButton} inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] bg-success-soft px-3 text-xs font-semibold text-[color:var(--success)] disabled:opacity-50`}>{certifyPending ? <Spinner className="size-3.5" /> : <BadgeCheck className="size-3.5" />}{certifyPending ? "Certifying…" : "Certify"}</button></form> : null}
      {row.reportStatus === "certified" ? <form action={publishAction}><input type="hidden" name="snapshotId" value={row.snapshotId} /><button type="submit" disabled={publishPending} className={`${actionButton} inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] bg-info-soft px-3 text-xs font-semibold text-[color:var(--info)] disabled:opacity-50`}>{publishPending ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />}{publishPending ? "Publishing…" : "Publish"}</button></form> : null}
      {row.reportStatus !== "generated" ? <>
        {htmlDocument ? <a href={`/api/report-card-documents/${htmlDocument.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] bg-success-soft px-3 text-xs font-semibold text-[color:var(--success)]"><FileText className="size-3.5" />Digital</a> : <form action={htmlAction}><input type="hidden" name="snapshotId" value={row.snapshotId} /><input type="hidden" name="documentFormat" value="html" /><input type="hidden" name="templateKey" value="TERM_REPORT" /><input type="hidden" name="templateVersion" value={row.templateVersion ?? "SCOLAPRO_TERM_REPORT_V1"} /><button type="submit" disabled={lifecyclePending || htmlPending || htmlJob?.status === "pending" || htmlJob?.status === "processing"} className={`${actionButton} inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] bg-brand-soft px-3 text-xs font-semibold text-brand-strong disabled:opacity-50`}>{htmlPending || htmlJob?.status === "processing" ? <Spinner className="size-3.5" /> : <FileText className="size-3.5" />}{htmlPending || htmlJob?.status === "processing" ? "Preparing…" : "Digital"}</button></form>}
        {pdfDocument ? <a href={`/api/report-card-documents/${pdfDocument.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] bg-success-soft px-3 text-xs font-semibold text-[color:var(--success)]"><Download className="size-3.5" />PDF</a> : <form action={pdfAction}><input type="hidden" name="snapshotId" value={row.snapshotId} /><input type="hidden" name="documentFormat" value="pdf" /><input type="hidden" name="templateKey" value="TERM_REPORT" /><input type="hidden" name="templateVersion" value={row.templateVersion ?? "SCOLAPRO_TERM_REPORT_V1"} /><button type="submit" disabled={lifecyclePending || pdfPending || pdfJob?.status === "pending" || pdfJob?.status === "processing"} className={`${actionButton} inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] bg-brand-soft px-3 text-xs font-semibold text-brand-strong disabled:opacity-50`}>{pdfPending || pdfJob?.status === "processing" ? <Spinner className="size-3.5" /> : <Download className="size-3.5" />}{pdfPending || pdfJob?.status === "processing" ? "Preparing…" : "PDF"}</button></form>}
      </> : null}
    </div> : null}
  </div>;
}

export function PagedReportCardManagement(props: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"bulk" | "individual">(props.individualLearnerId ? "individual" : "bulk");
  const [scopeType, setScopeType] = useState<ScopeType>(props.scopeType);
  const [scopeGradeId, setScopeGradeId] = useState(props.scopeGradeId);
  const [scopeClassId, setScopeClassId] = useState(props.scopeClassId);
  const [individualLearnerId, setIndividualLearnerId] = useState(props.individualLearnerId);
  const [customSearch, setCustomSearch] = useState("");
  const [customGradeId, setCustomGradeId] = useState("");
  const [customClassId, setCustomClassId] = useState("");
  const [customSort, setCustomSort] = useState<CustomSort>("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const rowByEnrolment = useMemo(() => new Map(props.statusPage.rows.map((row) => [row.enrolmentId, row])), [props.statusPage.rows]);
  const learnerNameByEnrolment = useMemo(() => new Map(props.individualLearners.map((learner) => [learner.enrolmentId, learner.label])), [props.individualLearners]);
  const appliedScopeMatches = scopeType === props.scopeType && scopeGradeId === props.scopeGradeId && scopeClassId === props.scopeClassId;
  const summary = scopeType === "custom" ? null : appliedScopeMatches ? props.scopeSummary : null;
  const scopeId = scopeType === "grade" ? scopeGradeId : scopeType === "class" ? scopeClassId : null;
  const scopeLabel = scopeType === "custom" ? `Custom selection (${selectedIds.size})` : appliedScopeMatches ? props.scopeSummary?.scopeLabel ?? "Selected scope" : "Apply scope to load totals";
  const pdfEligible = summary ? summary.certified + summary.published : 0;
  const selectedIndividual = rowByEnrolment.get(individualLearnerId);

  const filteredClasses = props.classes.filter((item) => !scopeGradeId || item.gradeId === scopeGradeId);
  const customClasses = props.classes.filter((item) => !customGradeId || item.gradeId === customGradeId);
  const tableClasses = props.classes.filter((item) => !props.filterGradeId || item.gradeId === props.filterGradeId);

  const customLearners = useMemo(() => {
    const query = customSearch.trim().toLocaleLowerCase("en");
    const filtered = props.individualLearners.filter((learner) => {
      if (customGradeId && learner.gradeId !== customGradeId) return false;
      if (customClassId && learner.registerClassId !== customClassId) return false;
      if (!query) return true;
      return `${learner.label} ${learner.helper}`.toLocaleLowerCase("en").includes(query);
    });
    return [...filtered].sort((a, b) => {
      const comparison = a.label.localeCompare(b.label, "en", { numeric: true, sensitivity: "base" });
      return customSort === "asc" ? comparison : -comparison;
    });
  }, [customClassId, customGradeId, customSearch, customSort, props.individualLearners]);

  const allCustomVisibleSelected = customLearners.length > 0 && customLearners.every((learner) => selectedIds.has(learner.enrolmentId));
  const selectedEnrolmentIds = useMemo(() => [...selectedIds], [selectedIds]);

  const applyScope = () => {
    const params = new URLSearchParams();
    params.set("term", String(props.termNumber));
    if (props.query) params.set("q", props.query);
    if (props.status !== "all") params.set("status", props.status);
    if (props.filterGradeId) params.set("grade", props.filterGradeId);
    if (props.filterClassId) params.set("class", props.filterClassId);
    if (scopeType !== "school") params.set("scope", scopeType);
    if (scopeGradeId) params.set("scopeGrade", scopeGradeId);
    if (scopeClassId) params.set("scopeClass", scopeClassId);
    router.push(`/reports/report-cards?${params.toString()}`);
  };

  const switchToBulk = () => {
    setMode("bulk");
    setIndividualLearnerId("");
    if (!props.individualLearnerId) return;
    const params = new URLSearchParams();
    params.set("term", String(props.termNumber));
    if (props.scopeType !== "school") params.set("scope", props.scopeType);
    if (props.scopeGradeId) params.set("scopeGrade", props.scopeGradeId);
    if (props.scopeClassId) params.set("scopeClass", props.scopeClassId);
    router.push(`/reports/report-cards?${params.toString()}`);
  };

  const selectIndividual = (value: string) => {
    setIndividualLearnerId(value);
    const params = new URLSearchParams();
    params.set("term", String(props.termNumber));
    if (props.scopeType !== "school") params.set("scope", props.scopeType);
    if (props.scopeGradeId) params.set("scopeGrade", props.scopeGradeId);
    if (props.scopeClassId) params.set("scopeClass", props.scopeClassId);
    if (!value) {
      router.push(`/reports/report-cards?${params.toString()}`);
      return;
    }
    const option = props.individualLearners.find((item) => item.enrolmentId === value);
    if (!option) return;
    params.set("individual", value);
    params.set("q", option.searchQuery);
    router.push(`/reports/report-cards?${params.toString()}`);
  };

  const toggleCustomVisible = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const learner of customLearners) {
        if (checked) next.add(learner.enrolmentId);
        else next.delete(learner.enrolmentId);
      }
      return next;
    });
  };

  const start = props.statusPage.totalCount === 0 ? 0 : (props.statusPage.page - 1) * props.statusPage.pageSize + 1;
  const end = Math.min(props.statusPage.totalCount, start + props.statusPage.rows.length - 1);

  return <div className="space-y-5">
    <div className="inline-flex rounded-[var(--radius-sm)] bg-surface-muted p-1 shadow-[var(--shadow-xs)]" role="tablist" aria-label="Report-card workflow mode">
      <button type="button" onClick={switchToBulk} className={`${actionButton} rounded-[var(--radius-xs)] px-3.5 py-2 text-xs font-semibold ${mode === "bulk" ? "bg-surface shadow-[var(--shadow-xs)]" : "text-muted-foreground"}`}><span className="inline-flex items-center gap-1.5"><Layers3 className="size-3.5" />Bulk</span></button>
      <button type="button" onClick={() => setMode("individual")} className={`${actionButton} rounded-[var(--radius-xs)] px-3.5 py-2 text-xs font-semibold ${mode === "individual" ? "bg-surface shadow-[var(--shadow-xs)]" : "text-muted-foreground"}`}><span className="inline-flex items-center gap-1.5"><Users className="size-3.5" />Individual</span></button>
    </div>

    {mode === "bulk" ? <>
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="mb-4"><h2 className="scolapro-section-title">Bulk report preparation</h2><p className="scolapro-section-description">Choose the exact scope for this report-card run. Custom selection uses the full current-school learner directory and is independent of the paged report-status table below.</p></div>
        <div className="grid gap-3 lg:grid-cols-4">
          <Picker label="Scope" value={scopeType} onChange={(value) => { const nextScope = value as ScopeType; setScopeType(nextScope); if (nextScope === "school" || nextScope === "custom") { setScopeGradeId(""); setScopeClassId(""); } }} placeholder="Choose scope" options={[{ value: "school", label: "Whole school" }, { value: "grade", label: "Grade" }, { value: "class", label: "Class" }, { value: "custom", label: "Custom selection" }]} />
          {scopeType === "grade" || scopeType === "class" ? <Picker label="Grade" value={scopeGradeId} onChange={(value) => { setScopeGradeId(value); setScopeClassId(""); }} placeholder="Choose grade" options={props.grades.map((item) => ({ value: item.id, label: item.label }))} /> : <div className="hidden lg:block" />}
          {scopeType === "class" ? <Picker label="Class" value={scopeClassId} onChange={setScopeClassId} placeholder="Choose class" options={filteredClasses.map((item) => ({ value: item.id, label: item.label }))} /> : <div className="hidden lg:block" />}
          {scopeType !== "custom" ? <button type="button" onClick={applyScope} disabled={(scopeType === "grade" && !scopeGradeId) || (scopeType === "class" && !scopeClassId)} className={`${actionButton} mt-auto min-h-10 rounded-[var(--radius-sm)] bg-surface-muted px-4 text-xs font-semibold disabled:opacity-45`}>Apply scope</button> : <div className="hidden lg:block" />}
        </div>

        {scopeType === "custom" ? <div className="mt-4 overflow-hidden rounded-[var(--radius-sm)] border border-border-subtle">
          <div className="border-b border-border-subtle bg-surface-muted/60 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold">Choose learners</p><p className="mt-1 text-[0.68rem] text-muted-foreground">Search, narrow and select from all current learners. Changing the report-status page does not clear this selection.</p></div><div className="text-right"><p className="text-xs font-semibold">{selectedIds.size} selected</p>{selectedIds.size ? <button type="button" onClick={() => setSelectedIds(new Set())} className={`${actionButton} mt-1 text-[0.68rem] font-semibold text-brand-strong`}>Clear selection</button> : null}</div></div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_10rem_10rem_auto]">
              <label className="relative block"><span className="sr-only">Search custom-selection learners</span><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><input value={customSearch} onChange={(event) => setCustomSearch(event.target.value)} placeholder="Search learner or admission no." className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated pl-9 pr-3 text-xs outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft" /></label>
              <Picker label="" value={customGradeId} onChange={(value) => { setCustomGradeId(value); setCustomClassId(""); }} placeholder="All grades" options={[{ value: "", label: "All grades" }, ...props.grades.map((item) => ({ value: item.id, label: item.label }))]} />
              <Picker label="" value={customClassId} onChange={setCustomClassId} placeholder="All classes" options={[{ value: "", label: "All classes" }, ...customClasses.map((item) => ({ value: item.id, label: item.label }))]} />
              <button type="button" onClick={() => setCustomSort((value) => value === "asc" ? "desc" : "asc")} className={`${actionButton} inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs font-semibold`}>{customSort === "asc" ? <ArrowDownAZ className="size-4" /> : <ArrowUpAZ className="size-4" />}{customSort === "asc" ? "A–Z" : "Z–A"}</button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-3 py-2"><CheckboxField label={`Select all shown (${customLearners.length})`} checked={allCustomVisibleSelected} onChange={(event) => toggleCustomVisible(event.target.checked)} /><span className="text-[0.65rem] text-muted-foreground">{props.individualLearners.length} current learners</span></div>
          <div className="max-h-[26rem] overflow-y-auto">
            <div className="sticky top-0 z-10 grid min-w-[42rem] grid-cols-[2.25rem_3rem_minmax(0,1fr)_minmax(6rem,0.35fr)_minmax(7rem,0.4fr)] gap-2 border-b border-border-subtle bg-surface px-3 py-2 text-[0.64rem] font-semibold text-muted-foreground"><span /><span>#</span><span>Learner</span><span>Grade</span><span>Class</span></div>
            {customLearners.length ? customLearners.map((learner, index) => <div key={learner.enrolmentId} className="grid min-w-[42rem] grid-cols-[2.25rem_3rem_minmax(0,1fr)_minmax(6rem,0.35fr)_minmax(7rem,0.4fr)] items-center gap-2 border-b border-border-subtle px-3 py-2.5 last:border-b-0"><CheckboxField label="" aria-label={`Select ${learner.label}`} checked={selectedIds.has(learner.enrolmentId)} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); if (event.target.checked) next.add(learner.enrolmentId); else next.delete(learner.enrolmentId); return next; })} /><span className="text-[0.68rem] font-semibold text-muted-foreground">{index + 1}</span><div className="min-w-0"><p className="truncate text-xs font-semibold">{learner.label}</p><p className="mt-0.5 truncate text-[0.65rem] text-muted-foreground">{learner.admissionNumber || "No admission number"}</p></div><span className="truncate text-[0.68rem] text-muted-foreground">{learner.gradeLabel}</span><span className="truncate text-[0.68rem] text-muted-foreground">{learner.classLabel}</span></div>) : <div className="px-4 py-8 text-center text-xs text-muted-foreground">No learners match these custom-selection filters.</div>}
          </div>
        </div> : null}

        {scopeType === "custom" ? selectedIds.size ? <><div className="mt-4 rounded-[var(--radius-sm)] bg-brand-soft/40 px-3 py-3"><p className="text-xs font-semibold">{selectedIds.size} learner{selectedIds.size === 1 ? "" : "s"} selected</p><p className="mt-1 text-[0.67rem] text-muted-foreground">Each lifecycle action validates the selected learners against the current report-card state; ineligible learners are retained as explicit skipped items rather than silently changing your selection.</p></div><div className="mt-4 flex flex-wrap gap-2"><BatchButton operation="generate" enrolmentIds={selectedEnrolmentIds} academicYear={props.academicYear} termNumber={props.termNumber} scopeType="custom" scopeLabel={scopeLabel} scopeCount={selectedIds.size} disabled={false} /><BatchButton operation="certify" enrolmentIds={selectedEnrolmentIds} academicYear={props.academicYear} termNumber={props.termNumber} scopeType="custom" scopeLabel={scopeLabel} scopeCount={selectedIds.size} disabled={false} /><BatchButton operation="publish" enrolmentIds={selectedEnrolmentIds} academicYear={props.academicYear} termNumber={props.termNumber} scopeType="custom" scopeLabel={scopeLabel} scopeCount={selectedIds.size} disabled={false} /><BatchButton operation="pdf" enrolmentIds={selectedEnrolmentIds} academicYear={props.academicYear} termNumber={props.termNumber} scopeType="custom" scopeLabel={scopeLabel} scopeCount={selectedIds.size} disabled={false} /></div></> : <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-border p-4 text-xs text-muted-foreground">Select one or more learners above to enable the custom bulk actions.</div> : summary ? <><div className="mt-4 grid overflow-hidden rounded-[var(--radius-sm)] border border-border-subtle sm:grid-cols-6">{[["Learners", summary.total], ["Not generated", summary.notGenerated], ["Generated", summary.generated], ["Certified", summary.certified], ["Published", summary.published], ["PDF ready", summary.pdfReady]].map(([label, value], index) => <div key={String(label)} className={`px-3 py-3 ${index ? "border-t border-border-subtle sm:border-l sm:border-t-0" : ""}`}><p className="text-[0.65rem] font-medium text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}</div><div className="mt-4 flex flex-wrap gap-2"><BatchButton operation="generate" enrolmentIds={[]} academicYear={props.academicYear} termNumber={props.termNumber} scopeType={scopeType} scopeId={scopeId} scopeLabel={scopeLabel} scopeCount={summary.total} disabled={summary.notGenerated === 0} /><BatchButton operation="certify" enrolmentIds={[]} academicYear={props.academicYear} termNumber={props.termNumber} scopeType={scopeType} scopeId={scopeId} scopeLabel={scopeLabel} scopeCount={summary.total} disabled={summary.generated === 0} /><BatchButton operation="publish" enrolmentIds={[]} academicYear={props.academicYear} termNumber={props.termNumber} scopeType={scopeType} scopeId={scopeId} scopeLabel={scopeLabel} scopeCount={summary.total} disabled={summary.certified === 0} /><BatchButton operation="pdf" enrolmentIds={[]} academicYear={props.academicYear} termNumber={props.termNumber} scopeType={scopeType} scopeId={scopeId} scopeLabel={scopeLabel} scopeCount={summary.total} disabled={pdfEligible === 0 || summary.pdfReady >= pdfEligible} /></div></> : <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-border p-4 text-xs text-muted-foreground">Choose and apply a valid scope to load aggregate report status before starting a bulk action.</div>}
      </section>
      {props.batches.length ? <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5"><div className="mb-3"><h2 className="scolapro-section-title">Batch progress</h2><p className="scolapro-section-description">Recent durable report-card jobs and learner-level exceptions.</p></div><div className="grid gap-2 lg:grid-cols-2">{props.batches.slice(0, 6).map((batch) => <BatchProgress key={batch.id} batch={batch} issues={props.batchIssues} learnerByEnrolment={learnerNameByEnrolment} />)}</div></section> : null}
    </> : <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><div className="mb-4"><h2 className="scolapro-section-title">Individual report card</h2><p className="scolapro-section-description">Choose any current learner in the school. The directory is school-wide; only the selected learner&apos;s report status and artifacts are loaded.</p></div><Picker label="Learner" value={individualLearnerId} onChange={selectIndividual} placeholder="Choose learner" searchable searchPlaceholder="Search all current learners" options={props.individualLearners.map((item) => ({ value: item.enrolmentId, label: item.label, helper: item.helper }))} /><div className="mt-3"><IndividualPanel row={selectedIndividual} termNumber={props.termNumber} renderJobs={props.renderJobs} documents={props.documents} /></div></section>}

    {mode === "bulk" ? <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
      <div className="border-b border-border-subtle px-4 py-4 sm:px-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="scolapro-section-title">Current learner reports</h2><p className="scolapro-section-description">Server-filtered status view. This table is for status review only; custom bulk selection is managed independently above.</p></div><p className="text-xs font-semibold">{props.statusPage.totalCount} learner{props.statusPage.totalCount === 1 ? "" : "s"}</p></div><form method="get" className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_10rem_10rem_9rem_11rem_auto]"><input type="hidden" name="scope" value={props.scopeType} /><input type="hidden" name="scopeGrade" value={props.scopeGradeId} /><input type="hidden" name="scopeClass" value={props.scopeClassId} /><label className="relative block"><span className="sr-only">Search learners</span><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><input name="q" defaultValue={props.query} placeholder="Search learner or admission no." className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated pl-9 pr-3 text-xs outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft" /></label><select name="grade" defaultValue={props.filterGradeId} className="min-h-10 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs"><option value="">All grades</option>{props.grades.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><select name="class" defaultValue={props.filterClassId} className="min-h-10 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs"><option value="">All classes</option>{tableClasses.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><select name="term" defaultValue={String(props.termNumber)} className="min-h-10 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs">{props.terms.map((term) => <option key={term.termNumber} value={term.termNumber}>{term.name}</option>)}</select><select name="status" defaultValue={props.status} className="min-h-10 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs"><option value="all">All statuses</option><option value="not_generated">Not generated</option><option value="generated">Generated</option><option value="certified">Certified</option><option value="published">Published</option></select><button type="submit" className="min-h-10 rounded-[var(--radius-sm)] bg-brand px-4 text-xs font-semibold text-white">Apply</button></form></div>
      {props.statusPage.rows.length ? <div className="divide-y divide-border-subtle">{props.statusPage.rows.map((row, index) => <article key={row.enrolmentId} className="grid gap-2 px-4 py-3.5 sm:grid-cols-[3rem_minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_auto] sm:items-center sm:px-5"><p className="text-[0.68rem] font-semibold text-muted-foreground">{(props.statusPage.page - 1) * props.statusPage.pageSize + index + 1}</p><div className="min-w-0"><p className="truncate text-xs font-semibold">{row.name}</p><p className="mt-1 truncate text-[0.67rem] text-muted-foreground">{row.admissionNumber ?? "No admission number"}</p></div><p className="text-[0.7rem] text-muted-foreground">{row.grade}</p><p className="text-[0.7rem] text-muted-foreground">{row.registerClass}</p><div className="flex flex-wrap items-center gap-2 sm:justify-end"><span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-semibold ${statusClasses[row.reportStatus]}`}>{statusLabels[row.reportStatus]}</span>{row.pdfReady ? <span className="text-[0.65rem] font-semibold text-[color:var(--success)]">PDF ready</span> : null}</div></article>)}</div> : <div className="px-4 py-12 text-center sm:px-5"><p className="text-sm font-semibold">No matching report cards</p><p className="mt-1 text-xs text-muted-foreground">Try a different learner search, term, grade, class or status.</p></div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-4 py-3 sm:px-5"><p className="text-[0.68rem] text-muted-foreground">Showing {start}-{end} of {props.statusPage.totalCount}</p><div className="flex items-center gap-2">{props.statusPage.page > 1 ? <Link href={buildHref(props, props.statusPage.page - 1)} className="inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-xs)] border border-border-subtle px-3 text-xs font-semibold hover:bg-surface-muted"><ChevronLeft className="size-3.5" />Previous</Link> : <span className="inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-xs)] border border-border-subtle px-3 text-xs font-semibold text-muted-foreground opacity-45"><ChevronLeft className="size-3.5" />Previous</span>}<span className="text-[0.68rem] text-muted-foreground">Page {props.statusPage.page} of {props.statusPage.pageCount}</span>{props.statusPage.page < props.statusPage.pageCount ? <Link href={buildHref(props, props.statusPage.page + 1)} className="inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-xs)] border border-border-subtle px-3 text-xs font-semibold hover:bg-surface-muted">Next<ChevronRight className="size-3.5" /></Link> : <span className="inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-xs)] border border-border-subtle px-3 text-xs font-semibold text-muted-foreground opacity-45">Next<ChevronRight className="size-3.5" /></span>}</div></div>
    </section> : null}
  </div>;
}
