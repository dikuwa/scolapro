"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
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
  certifyReportCard,
  createReportCardBatch,
  generateReportCard,
  publishReportCard,
  queueReportCardRender,
  type ReportCardActionState,
} from "@/features/reporting/server/actions";
import type {
  ReportCardBatchIssueRow,
  ReportCardBatchRow,
  ReportCardDocumentRow,
  ReportCardLearner,
  ReportCardRenderJobRow,
  ReportCardSnapshotRow,
} from "@/features/reporting/server/report-cards";

const initialState: ReportCardActionState = {};
const actionButton = "cursor-pointer transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft active:translate-y-px";
const pageSize = 50;

type ScopeType = "school" | "grade" | "class" | "custom";
type BatchOperation = "generate" | "certify" | "publish" | "pdf";
type StatusFilter = "all" | "not_generated" | "generated" | "certified" | "published";

type WorkspaceProps = {
  learners: ReportCardLearner[];
  snapshots: ReportCardSnapshotRow[];
  terms: { termNumber: number; name: string }[];
  renderJobs: ReportCardRenderJobRow[];
  documents: ReportCardDocumentRow[];
  batches: ReportCardBatchRow[];
  batchIssues: ReportCardBatchIssueRow[];
  academicYear: number;
  canManageReports: boolean;
};

function snapshotStatus(snapshot: ReportCardSnapshotRow | undefined): Exclude<StatusFilter, "all"> {
  if (!snapshot) return "not_generated";
  if (snapshot.status === "draft") return "generated";
  if (snapshot.status === "published") return "published";
  return "certified";
}

function statusLabel(snapshot: ReportCardSnapshotRow | undefined) {
  if (!snapshot) return "Not generated";
  if (snapshot.status === "draft") return "Generated";
  if (snapshot.status === "published") return "Published";
  return "Certified";
}

function statusClass(snapshot: ReportCardSnapshotRow | undefined) {
  if (!snapshot) return "bg-surface-muted text-muted-foreground";
  if (snapshot.status === "draft") return "bg-warning-soft text-[color:var(--warning)]";
  if (snapshot.status === "published") return "bg-brand-soft text-brand-strong";
  return "bg-success-soft text-[color:var(--success)]";
}

function BatchButton({ operation, learners, academicYear, termNumber, scopeType, scopeId, scopeLabel, scopeCount, disabled }: {
  operation: BatchOperation;
  learners: ReportCardLearner[];
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
    if (state.success) {
      toast.success(state.message);
      router.refresh();
    } else {
      toast.error(state.message);
    }
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
    {scopeType === "custom" ? learners.map((learner) => <input key={learner.enrolmentId} type="hidden" name="enrolmentId" value={learner.enrolmentId} />) : null}
    <button type="submit" disabled={disabled || pending || scopeCount === 0 || missingScopeId} className={`${actionButton} inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45 ${config.className}`}>
      {pending ? <Spinner className="size-3.5" /> : <config.Icon className="size-3.5" />}
      {pending ? "Starting…" : config.label}
    </button>
  </form>;
}

function BatchProgress({ batch, issues, learnerByEnrolment }: {
  batch: ReportCardBatchRow;
  issues: ReportCardBatchIssueRow[];
  learnerByEnrolment: Map<string, ReportCardLearner>;
}) {
  const progress = batch.totalItems ? Math.round((batch.processedItems / batch.totalItems) * 100) : 0;
  const label = batch.operation === "generate"
    ? "Generate snapshots"
    : batch.operation === "certify"
      ? "Certify snapshots"
      : batch.operation === "publish"
        ? "Publish reports"
        : "Prepare PDFs";
  const active = batch.status === "pending" || batch.status === "processing";
  const relevantIssues = issues.filter((issue) => issue.batchId === batch.id).slice(0, 6);

  return <div className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-3.5 shadow-[var(--shadow-xs)]">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-xs font-semibold">{label}</p><p className="mt-1 text-[0.67rem] text-muted-foreground">{batch.scopeLabel} · Term {batch.termNumber}</p></div>
      <span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.62rem] font-semibold ${active ? "bg-info-soft text-[color:var(--info)]" : batch.status === "partial" ? "bg-warning-soft text-[color:var(--warning)]" : "bg-success-soft text-[color:var(--success)]"}`}>{batch.status}</span>
    </div>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, progress)}%` }} /></div>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.65rem] text-muted-foreground"><span>{batch.processedItems}/{batch.totalItems}</span><span>{batch.completedItems} completed</span><span>{batch.skippedItems} skipped</span><span>{batch.failedItems} failed</span></div>
    {batch.operation === "pdf" ? <div className="mt-2 text-[0.65rem] text-muted-foreground">Combined PDF: <span className="font-medium text-foreground">{batch.exportStatus.replaceAll("_", " ")}</span>{batch.exportPageCount ? ` · ${batch.exportPageCount} pages` : ""}</div> : null}
    {batch.operation === "pdf" && batch.exportStatus === "ready" ? <a href={`/api/report-card-batches/${batch.id}/export`} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-success-soft px-2.5 text-[0.68rem] font-semibold text-[color:var(--success)] hover:bg-[color:var(--success)] hover:text-white"><Download className="size-3.5" />Open combined PDF</a> : null}
    {batch.exportStatus === "failed" && batch.exportError ? <div className="mt-2 flex items-start gap-1.5 text-[0.65rem] text-[color:var(--danger)]"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{batch.exportError}</div> : null}
    {relevantIssues.length ? <div className="mt-2 border-t border-border-subtle pt-2"><p className="text-[0.65rem] font-semibold text-muted-foreground">Skipped / failed learners</p><div className="mt-1 space-y-1">{relevantIssues.map((issue) => <p key={`${issue.batchId}:${issue.enrolmentId}`} className="text-[0.65rem] leading-5 text-muted-foreground"><span className="font-medium text-foreground">{learnerByEnrolment.get(issue.enrolmentId)?.name ?? "Learner"}</span> — {issue.message ?? issue.resultCode ?? issue.status}</p>)}</div></div> : null}
  </div>;
}

function IndividualReport({ learner, termNumber, snapshot, pdfJob, pdfDocument, htmlJob, htmlDocument }: {
  learner: ReportCardLearner | undefined;
  termNumber: number;
  snapshot: ReportCardSnapshotRow | undefined;
  pdfJob: ReportCardRenderJobRow | null;
  pdfDocument: ReportCardDocumentRow | null;
  htmlJob: ReportCardRenderJobRow | null;
  htmlDocument: ReportCardDocumentRow | null;
}) {
  const [pdfState, pdfAction, pdfPending] = useActionState(queueReportCardRender, initialState);
  const [htmlState, htmlAction, htmlPending] = useActionState(queueReportCardRender, initialState);

  useEffect(() => {
    const message = pdfState.message ?? htmlState.message;
    if (!message) return;
    if (pdfState.success || htmlState.success) toast.success(message);
    else toast.error(message);
  }, [htmlState, pdfState]);

  if (!learner) return null;

  return <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted p-3.5">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold">{learner.name}</p><p className="mt-1 text-[0.67rem] text-muted-foreground">{learner.admissionNumber ?? "No admission number"} · {learner.grade} · {learner.registerClass}</p></div><span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-semibold ${statusClass(snapshot)}`}>{statusLabel(snapshot)}</span></div>
    {!snapshot ? <p className="mt-3 text-[0.68rem] text-muted-foreground">No current snapshot for Term {termNumber}.</p> : <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-[0.67rem] text-muted-foreground">Version {snapshot.snapshotVersion}</span>
      {snapshot.status === "draft" ? <form action={certifyReportCard}><input type="hidden" name="snapshotId" value={snapshot.id} /><button type="submit" className={`${actionButton} inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-xs)] bg-success-soft px-2.5 text-[0.67rem] font-semibold text-[color:var(--success)]`}><BadgeCheck className="size-3.5" />Certify</button></form> : null}
      {snapshot.status === "certified" ? <form action={publishReportCard}><input type="hidden" name="snapshotId" value={snapshot.id} /><button type="submit" className={`${actionButton} inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-xs)] bg-brand-soft px-2.5 text-[0.67rem] font-semibold text-brand-strong`}><Send className="size-3.5" />Publish</button></form> : null}
      {snapshot.status !== "draft" ? <>
        {htmlDocument ? <a href={`/api/report-card-documents/${htmlDocument.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-xs)] bg-success-soft px-2.5 text-[0.67rem] font-semibold text-[color:var(--success)]"><FileText className="size-3.5" />Digital</a> : <form action={htmlAction}><input type="hidden" name="snapshotId" value={snapshot.id} /><input type="hidden" name="documentFormat" value="html" /><input type="hidden" name="templateKey" value="TERM_REPORT" /><input type="hidden" name="templateVersion" value={snapshot.templateVersion} /><button disabled={htmlPending || htmlJob?.status === "pending" || htmlJob?.status === "processing"} type="submit" className={`${actionButton} inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-xs)] bg-brand-soft px-2.5 text-[0.67rem] font-semibold text-brand-strong disabled:opacity-50`}>{htmlPending || htmlJob?.status === "processing" ? <Spinner className="size-3.5" /> : <FileText className="size-3.5" />}Digital</button></form>}
        {pdfDocument ? <a href={`/api/report-card-documents/${pdfDocument.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-xs)] bg-success-soft px-2.5 text-[0.67rem] font-semibold text-[color:var(--success)]"><Download className="size-3.5" />PDF</a> : <form action={pdfAction}><input type="hidden" name="snapshotId" value={snapshot.id} /><input type="hidden" name="documentFormat" value="pdf" /><input type="hidden" name="templateKey" value="TERM_REPORT" /><input type="hidden" name="templateVersion" value={snapshot.templateVersion} /><button disabled={pdfPending || pdfJob?.status === "pending" || pdfJob?.status === "processing"} type="submit" className={`${actionButton} inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-xs)] bg-brand-soft px-2.5 text-[0.67rem] font-semibold text-brand-strong disabled:opacity-50`}>{pdfPending || pdfJob?.status === "processing" ? <Spinner className="size-3.5" /> : <Download className="size-3.5" />}PDF</button></form>}
      </> : null}
    </div>}
  </div>;
}

export function ReportCardWorkspace(props: WorkspaceProps) {
  const { learners, snapshots, terms, renderJobs, documents, batches, batchIssues, academicYear, canManageReports } = props;
  const router = useRouter();
  const [mode, setMode] = useState<"bulk" | "individual">(canManageReports ? "bulk" : "individual");
  const [termNumber, setTermNumber] = useState(String(terms[0]?.termNumber ?? 1));
  const [scopeType, setScopeType] = useState<ScopeType>("school");
  const [scopeGradeId, setScopeGradeId] = useState("");
  const [scopeClassId, setScopeClassId] = useState("");
  const [search, setSearch] = useState("");
  const [filterGradeId, setFilterGradeId] = useState("");
  const [filterClassId, setFilterClassId] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [individualLearnerId, setIndividualLearnerId] = useState(learners[0]?.enrolmentId ?? "");
  const [individualState, individualAction, individualPending] = useActionState(generateReportCard, initialState);

  useEffect(() => {
    if (!individualState.message) return;
    if (individualState.success) toast.success(individualState.message);
    else toast.error(individualState.message);
  }, [individualState]);

  const hasActiveBatch = batches.some((batch) => batch.status === "pending" || batch.status === "processing" || batch.exportStatus === "processing" || batch.exportStatus === "waiting");
  useEffect(() => {
    if (!hasActiveBatch) return;
    const timer = window.setInterval(() => router.refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [hasActiveBatch, router]);

  const selectedTerm = Number(termNumber);
  const latestByKey = useMemo(() => {
    const map = new Map<string, ReportCardSnapshotRow>();
    for (const snapshot of snapshots) {
      const key = `${snapshot.enrolmentId}:${snapshot.termNumber}`;
      const current = map.get(key);
      if (!current || snapshot.snapshotVersion > current.snapshotVersion) map.set(key, snapshot);
    }
    return map;
  }, [snapshots]);
  const documentsByKey = useMemo(() => new Map(documents.map((document) => [`${document.snapshotId}:${document.documentFormat}`, document])), [documents]);
  const jobsByKey = useMemo(() => {
    const map = new Map<string, ReportCardRenderJobRow>();
    for (const job of renderJobs) if (!map.has(`${job.snapshotId}:${job.documentFormat}`)) map.set(`${job.snapshotId}:${job.documentFormat}`, job);
    return map;
  }, [renderJobs]);
  const learnerByEnrolment = useMemo(() => new Map(learners.map((learner) => [learner.enrolmentId, learner])), [learners]);

  const gradeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const learner of learners) if (learner.gradeId) map.set(learner.gradeId, learner.grade);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true })).map(([value, label]) => ({ value, label }));
  }, [learners]);
  const classOptions = useMemo(() => {
    const map = new Map<string, { label: string; gradeId: string | null }>();
    for (const learner of learners) if (learner.registerClassId) map.set(learner.registerClassId, { label: learner.registerClass, gradeId: learner.gradeId });
    return [...map.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label, undefined, { numeric: true })).map(([value, item]) => ({ value, label: item.label, gradeId: item.gradeId }));
  }, [learners]);

  const scopedLearners = useMemo(() => {
    if (scopeType === "grade") return learners.filter((learner) => learner.gradeId === scopeGradeId);
    if (scopeType === "class") return learners.filter((learner) => learner.registerClassId === scopeClassId);
    if (scopeType === "custom") return learners.filter((learner) => selectedIds.has(learner.enrolmentId));
    return learners;
  }, [learners, scopeClassId, scopeGradeId, scopeType, selectedIds]);

  const scopeId = scopeType === "grade" ? scopeGradeId : scopeType === "class" ? scopeClassId : null;
  const scopeLabel = scopeType === "grade"
    ? gradeOptions.find((option) => option.value === scopeGradeId)?.label ?? "Selected grade"
    : scopeType === "class"
      ? classOptions.find((option) => option.value === scopeClassId)?.label ?? "Selected class"
      : scopeType === "custom"
        ? `Custom selection (${scopedLearners.length})`
        : "Whole school";

  const summarize = (rows: ReportCardLearner[]) => {
    let notGenerated = 0;
    let generated = 0;
    let certified = 0;
    let published = 0;
    let pdfReady = 0;
    for (const learner of rows) {
      const snapshot = latestByKey.get(`${learner.enrolmentId}:${selectedTerm}`);
      if (!snapshot) notGenerated += 1;
      else if (snapshot.status === "draft") generated += 1;
      else if (snapshot.status === "published") {
        published += 1;
        if (documentsByKey.has(`${snapshot.id}:pdf`)) pdfReady += 1;
      } else {
        certified += 1;
        if (documentsByKey.has(`${snapshot.id}:pdf`)) pdfReady += 1;
      }
    }
    return { total: rows.length, notGenerated, generated, certified, published, pdfReady };
  };
  const scopeSummary = summarize(scopedLearners);
  const pdfEligible = scopeSummary.certified + scopeSummary.published;

  const filteredLearners = useMemo(() => {
    const query = search.trim().toLowerCase();
    return learners.filter((learner) => {
      if (query && !`${learner.name} ${learner.admissionNumber ?? ""} ${learner.grade} ${learner.registerClass}`.toLowerCase().includes(query)) return false;
      if (filterGradeId && learner.gradeId !== filterGradeId) return false;
      if (filterClassId && learner.registerClassId !== filterClassId) return false;
      const snapshot = latestByKey.get(`${learner.enrolmentId}:${selectedTerm}`);
      return statusFilter === "all" || snapshotStatus(snapshot) === statusFilter;
    });
  }, [filterClassId, filterGradeId, latestByKey, learners, search, selectedTerm, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredLearners.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageLearners = filteredLearners.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedLearners = learners.filter((learner) => selectedIds.has(learner.enrolmentId));
  const selectedSummary = summarize(selectedLearners);
  const selectedPdfEligible = selectedSummary.certified + selectedSummary.published;
  const allPageSelected = pageLearners.length > 0 && pageLearners.every((learner) => selectedIds.has(learner.enrolmentId));

  const setPageSelection = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const learner of pageLearners) {
        if (checked) next.add(learner.enrolmentId);
        else next.delete(learner.enrolmentId);
      }
      return next;
    });
  };

  const selectedIndividualSnapshot = latestByKey.get(`${individualLearnerId}:${selectedTerm}`);
  const selectedPdfJob = selectedIndividualSnapshot ? jobsByKey.get(`${selectedIndividualSnapshot.id}:pdf`) ?? null : null;
  const selectedHtmlJob = selectedIndividualSnapshot ? jobsByKey.get(`${selectedIndividualSnapshot.id}:html`) ?? null : null;
  const selectedPdfDocument = selectedIndividualSnapshot ? documentsByKey.get(`${selectedIndividualSnapshot.id}:pdf`) ?? null : null;
  const selectedHtmlDocument = selectedIndividualSnapshot ? documentsByKey.get(`${selectedIndividualSnapshot.id}:html`) ?? null : null;

  return <div className="space-y-5">
    {canManageReports ? <div className="inline-flex rounded-[var(--radius-sm)] bg-surface-muted p-1 shadow-[var(--shadow-xs)]" role="tablist" aria-label="Report-card workflow mode">
      <button type="button" onClick={() => setMode("bulk")} className={`${actionButton} rounded-[var(--radius-xs)] px-3.5 py-2 text-xs font-semibold ${mode === "bulk" ? "bg-surface shadow-[var(--shadow-xs)]" : "text-muted-foreground"}`}><span className="inline-flex items-center gap-1.5"><Layers3 className="size-3.5" />Bulk</span></button>
      <button type="button" onClick={() => setMode("individual")} className={`${actionButton} rounded-[var(--radius-xs)] px-3.5 py-2 text-xs font-semibold ${mode === "individual" ? "bg-surface shadow-[var(--shadow-xs)]" : "text-muted-foreground"}`}><span className="inline-flex items-center gap-1.5"><Users className="size-3.5" />Individual</span></button>
    </div> : null}

    {canManageReports && mode === "bulk" ? <>
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="mb-4"><h2 className="scolapro-section-title">Bulk report preparation</h2><p className="scolapro-section-description">Choose school, grade, class or custom scope. Generate, certify, publish and prepare PDFs as separate durable stages.</p></div>
        <div className="grid gap-3 lg:grid-cols-4">
          <Picker label="Scope" value={scopeType} onChange={(value) => { setScopeType(value as ScopeType); setPage(1); }} placeholder="Choose scope" options={[{ value: "school", label: "Whole school" }, { value: "grade", label: "Specific grade" }, { value: "class", label: "Register class" }, { value: "custom", label: "Custom selection" }]} />
          {scopeType === "grade" || scopeType === "class" ? <Picker label="Grade" value={scopeGradeId} onChange={(value) => { setScopeGradeId(value); setScopeClassId(""); }} placeholder="Choose grade" options={gradeOptions} /> : <div className="hidden lg:block" />}
          {scopeType === "class" ? <Picker label="Register class" value={scopeClassId} onChange={setScopeClassId} placeholder="Choose class" options={classOptions.filter((item) => !scopeGradeId || item.gradeId === scopeGradeId).map(({ value, label }) => ({ value, label }))} /> : <div className="hidden lg:block" />}
          <Picker label="Term" value={termNumber} onChange={(value) => { setTermNumber(value); setPage(1); }} placeholder="Choose term" options={terms.map((term) => ({ value: String(term.termNumber), label: term.name }))} />
        </div>
        {scopeType === "custom" && selectedIds.size === 0 ? <p className="mt-3 rounded-[var(--radius-sm)] bg-info-soft px-3 py-2 text-xs text-[color:var(--info)]">Select learners in the table below to build this custom scope.</p> : null}
        <div className="mt-4 grid overflow-hidden rounded-[var(--radius-sm)] border border-border-subtle sm:grid-cols-6">{[
          ["Learners", scopeSummary.total], ["Not generated", scopeSummary.notGenerated], ["Generated", scopeSummary.generated], ["Certified", scopeSummary.certified], ["Published", scopeSummary.published], ["PDF ready", scopeSummary.pdfReady],
        ].map(([label, value], index) => <div key={String(label)} className={`px-3 py-3 ${index ? "border-t border-border-subtle sm:border-l sm:border-t-0" : ""}`}><p className="text-[0.65rem] font-medium text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}</div>
        <div className="mt-4 flex flex-wrap gap-2"><BatchButton operation="generate" learners={scopedLearners} academicYear={academicYear} termNumber={selectedTerm} scopeType={scopeType} scopeId={scopeId} scopeLabel={scopeLabel} scopeCount={scopeSummary.total} disabled={scopeSummary.notGenerated === 0} /><BatchButton operation="certify" learners={scopedLearners} academicYear={academicYear} termNumber={selectedTerm} scopeType={scopeType} scopeId={scopeId} scopeLabel={scopeLabel} scopeCount={scopeSummary.total} disabled={scopeSummary.generated === 0} /><BatchButton operation="publish" learners={scopedLearners} academicYear={academicYear} termNumber={selectedTerm} scopeType={scopeType} scopeId={scopeId} scopeLabel={scopeLabel} scopeCount={scopeSummary.total} disabled={scopeSummary.certified === 0} /><BatchButton operation="pdf" learners={scopedLearners} academicYear={academicYear} termNumber={selectedTerm} scopeType={scopeType} scopeId={scopeId} scopeLabel={scopeLabel} scopeCount={scopeSummary.total} disabled={pdfEligible === 0 || scopeSummary.pdfReady >= pdfEligible} /></div>
      </section>
      {batches.length ? <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5"><div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="scolapro-section-title">Batch progress</h2><p className="scolapro-section-description">Recent scoped jobs and learner-level exceptions.</p></div>{hasActiveBatch ? <span className="inline-flex items-center gap-1.5 text-[0.68rem] text-[color:var(--info)]"><Spinner className="size-3.5" />Updating</span> : null}</div><div className="grid gap-2 lg:grid-cols-2">{batches.slice(0, 6).map((batch) => <BatchProgress key={batch.id} batch={batch} issues={batchIssues} learnerByEnrolment={learnerByEnrolment} />)}</div></section> : null}
    </> : null}

    {canManageReports && mode === "individual" ? <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><div className="mb-4"><h2 className="scolapro-section-title">Individual report card</h2><p className="scolapro-section-description">Keep the one-learner workflow for reprints and exceptions.</p></div><form action={individualAction} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.35fr)_auto] lg:items-end"><Picker label="Learner" name="enrolmentId" value={individualLearnerId} onChange={setIndividualLearnerId} placeholder="Choose learner" options={learners.map((learner) => ({ value: learner.enrolmentId, label: learner.name, helper: `${learner.admissionNumber ?? "No admission number"} · ${learner.grade} · ${learner.registerClass}` }))} /><Picker label="Term" name="termNumber" value={termNumber} onChange={(value) => { setTermNumber(value); setPage(1); }} placeholder="Choose term" options={terms.map((term) => ({ value: String(term.termNumber), label: term.name }))} /><button type="submit" disabled={individualPending || !individualLearnerId} className={`${actionButton} scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white disabled:opacity-50`}>{individualPending ? <Spinner className="size-4" /> : <FilePlus2 className="size-4" />}{individualPending ? "Generating…" : "Generate snapshot"}</button></form><IndividualReport learner={learnerByEnrolment.get(individualLearnerId)} termNumber={selectedTerm} snapshot={selectedIndividualSnapshot} pdfJob={selectedPdfJob} pdfDocument={selectedPdfDocument} htmlJob={selectedHtmlJob} htmlDocument={selectedHtmlDocument} /></section> : null}

    {!canManageReports ? <section className="rounded-[var(--radius-md)] bg-surface-muted p-4"><div className="flex items-start gap-3"><Eye className="mt-0.5 size-4 text-brand-strong" /><div><h2 className="scolapro-section-title">View-only report access</h2><p className="scolapro-section-description">Teaching roles can review status only. Bulk generation, certification, publication and printing remain management actions.</p></div></div></section> : null}

    <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
      <div className="border-b border-border-subtle px-4 py-4 sm:px-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="scolapro-section-title">Current learner reports</h2><p className="scolapro-section-description">Filtered, single-term status with 50 learners per page.</p></div><p className="text-xs font-semibold">{filteredLearners.length} learners</p></div><div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5"><label className="relative block"><span className="sr-only">Search learners</span><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search learner or admission no." className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated pl-9 pr-3 text-xs outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft" /></label><Picker label="" value={filterGradeId} onChange={(value) => { setFilterGradeId(value); setFilterClassId(""); setPage(1); }} placeholder="All grades" options={[{ value: "", label: "All grades" }, ...gradeOptions]} /><Picker label="" value={filterClassId} onChange={(value) => { setFilterClassId(value); setPage(1); }} placeholder="All classes" options={[{ value: "", label: "All classes" }, ...classOptions.filter((item) => !filterGradeId || item.gradeId === filterGradeId).map(({ value, label }) => ({ value, label }))]} /><Picker label="" value={termNumber} onChange={(value) => { setTermNumber(value); setPage(1); }} placeholder="Choose term" options={terms.map((term) => ({ value: String(term.termNumber), label: term.name }))} /><Picker label="" value={statusFilter} onChange={(value) => { setStatusFilter(value as StatusFilter); setPage(1); }} placeholder="All statuses" options={[{ value: "all", label: "All statuses" }, { value: "not_generated", label: "Not generated" }, { value: "generated", label: "Generated" }, { value: "certified", label: "Certified" }, { value: "published", label: "Published" }]} /></div></div>

      {canManageReports && selectedIds.size > 0 ? <div className="border-b border-border-subtle bg-brand-soft/40 px-4 py-3 sm:px-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold">{selectedIds.size} selected</p><p className="text-[0.65rem] text-muted-foreground">{selectedSummary.notGenerated} not generated · {selectedSummary.generated} drafts · {selectedSummary.certified} certified · {selectedSummary.published} published</p></div><div className="flex flex-wrap gap-2"><BatchButton operation="generate" learners={selectedLearners} academicYear={academicYear} termNumber={selectedTerm} scopeType="custom" scopeLabel={`Custom selection (${selectedIds.size})`} scopeCount={selectedIds.size} disabled={selectedSummary.notGenerated === 0} /><BatchButton operation="certify" learners={selectedLearners} academicYear={academicYear} termNumber={selectedTerm} scopeType="custom" scopeLabel={`Custom selection (${selectedIds.size})`} scopeCount={selectedIds.size} disabled={selectedSummary.generated === 0} /><BatchButton operation="publish" learners={selectedLearners} academicYear={academicYear} termNumber={selectedTerm} scopeType="custom" scopeLabel={`Custom selection (${selectedIds.size})`} scopeCount={selectedIds.size} disabled={selectedSummary.certified === 0} /><BatchButton operation="pdf" learners={selectedLearners} academicYear={academicYear} termNumber={selectedTerm} scopeType="custom" scopeLabel={`Custom selection (${selectedIds.size})`} scopeCount={selectedIds.size} disabled={selectedPdfEligible === 0 || selectedSummary.pdfReady >= selectedPdfEligible} /><button type="button" onClick={() => setSelectedIds(new Set())} className={`${actionButton} min-h-9 rounded-[var(--radius-xs)] px-3 text-xs font-semibold text-muted-foreground`}>Clear</button></div></div></div> : null}

      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-2 sm:px-5">{canManageReports ? <CheckboxField label={`Select all in view (${pageLearners.length})`} checked={allPageSelected} onChange={(event) => setPageSelection(event.target.checked)} /> : <span className="text-[0.68rem] text-muted-foreground">Read-only status</span>}<span className="text-[0.65rem] text-muted-foreground">Page {currentPage} of {pageCount}</span></div>
      {pageLearners.length ? <div className="divide-y divide-border-subtle">{pageLearners.map((learner) => {
        const snapshot = latestByKey.get(`${learner.enrolmentId}:${selectedTerm}`);
        const pdfDocument = snapshot ? documentsByKey.get(`${snapshot.id}:pdf`) : undefined;
        const pdfJob = snapshot ? jobsByKey.get(`${snapshot.id}:pdf`) : undefined;
        return <div key={learner.enrolmentId} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"><div className="flex min-w-0 items-start gap-2.5">{canManageReports ? <CheckboxField label="" aria-label={`Select ${learner.name}`} checked={selectedIds.has(learner.enrolmentId)} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); if (event.target.checked) next.add(learner.enrolmentId); else next.delete(learner.enrolmentId); return next; })} /> : null}<div className="min-w-0"><p className="truncate text-xs font-semibold">{learner.name}</p><p className="mt-1 text-[0.67rem] text-muted-foreground">{learner.admissionNumber ?? "No admission number"} · {learner.grade} · {learner.registerClass}</p></div></div><div className="flex flex-wrap items-center gap-2 sm:justify-end"><span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-semibold ${statusClass(snapshot)}`}>{statusLabel(snapshot)}</span>{snapshot ? <span className="text-[0.64rem] text-muted-foreground">v{snapshot.snapshotVersion}</span> : null}{pdfDocument ? <a href={`/api/report-card-documents/${pdfDocument.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-7 items-center gap-1 rounded-[var(--radius-xs)] bg-success-soft px-2 text-[0.64rem] font-semibold text-[color:var(--success)]"><Download className="size-3" />PDF</a> : pdfJob?.status === "pending" || pdfJob?.status === "processing" || pdfJob?.status === "retry" ? <span className="inline-flex items-center gap-1 text-[0.64rem] text-[color:var(--info)]"><Clock3 className="size-3" />PDF {pdfJob.status}</span> : null}</div></div>;
      })}</div> : <div className="px-4 py-10 text-center text-sm text-muted-foreground">No learners match these filters.</div>}
      <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-3 sm:px-5"><p className="text-[0.67rem] text-muted-foreground">Showing {filteredLearners.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filteredLearners.length)} of {filteredLearners.length}</p><div className="flex gap-1"><button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className={`${actionButton} inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-xs)] border border-border-subtle px-2.5 text-[0.68rem] font-semibold disabled:opacity-40`}><ChevronLeft className="size-3.5" />Previous</button><button type="button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className={`${actionButton} inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-xs)] border border-border-subtle px-2.5 text-[0.68rem] font-semibold disabled:opacity-40`}>Next<ChevronRight className="size-3.5" /></button></div></div>
    </section>
  </div>;
}
