"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, Clock3, ExternalLink, Eye, FileCheck2, FilePlus2, FileText, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { certifyReportCard, generateReportCard, publishReportCard, queueReportCardRender, type ReportCardActionState } from "@/features/reporting/server/actions";
import type { ReportCardDocumentRow, ReportCardLearner, ReportCardRenderJobRow, ReportCardSnapshotRow } from "@/features/reporting/server/report-cards";

const initialState: ReportCardActionState = {};
const actionButton = "cursor-pointer transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft active:translate-y-px";

function HtmlRenderControl({ snapshot, job, document }: { snapshot: ReportCardSnapshotRow; job: ReportCardRenderJobRow | null; document: ReportCardDocumentRow | null }) {
  const [state, action, pending] = useActionState(queueReportCardRender, initialState);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  if (document) {
    return <a href={`/api/report-card-documents/${document.id}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-success-soft px-2.5 text-[0.68rem] font-semibold text-[color:var(--success)] transition-colors hover:bg-[color:var(--success)] hover:text-white"><FileCheck2 className="size-3.5" />Open digital report<ExternalLink className="size-3" /></a>;
  }

  if (job?.status === "processing" || job?.status === "pending") {
    return <div className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-info-soft px-2.5 text-[0.68rem] font-semibold text-[color:var(--info)]"><Clock3 className="size-3.5" />{job.status === "processing" ? "Rendering digital report" : "Digital report queued"}</div>;
  }

  const retrying = job?.status === "retry";
  const failed = job?.status === "dead";

  return <div className="mt-2 space-y-1.5">
    {failed ? <div className="flex items-start gap-1.5 text-[0.68rem] text-[color:var(--danger)]"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /><span>Rendering failed after {job.attemptCount} attempt{job.attemptCount === 1 ? "" : "s"}. It can be queued again.</span></div> : retrying ? <div className="flex items-start gap-1.5 text-[0.68rem] text-[color:var(--warning)]"><RotateCcw className="mt-0.5 size-3.5 shrink-0" /><span>Renderer retry pending after {job.attemptCount} attempt{job.attemptCount === 1 ? "" : "s"}.</span></div> : null}
    <form action={action}>
      <input type="hidden" name="snapshotId" value={snapshot.id} />
      <input type="hidden" name="templateKey" value="TERM_REPORT" />
      <input type="hidden" name="templateVersion" value={snapshot.templateVersion} />
      <input type="hidden" name="documentFormat" value="html" />
      <button type="submit" disabled={pending || retrying} className={`${actionButton} inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-brand-soft px-2.5 text-[0.68rem] font-semibold text-brand-strong hover:bg-brand hover:text-white disabled:cursor-not-allowed disabled:opacity-60`}>
        {pending ? <Spinner className="size-3.5" /> : <FileText className="size-3.5" />}
        {pending ? "Queueing…" : failed ? "Queue render again" : "Generate digital report"}
      </button>
    </form>
  </div>;
}

function ReadOnlyReportState({ snapshot }: { snapshot: ReportCardSnapshotRow | undefined }) {
  if (!snapshot) return <p className="mt-2 text-[0.68rem] text-muted-foreground">Not generated</p>;
  return <div className="mt-2 flex items-start gap-1.5 text-[0.68rem] text-muted-foreground"><Eye className="mt-0.5 size-3.5 shrink-0" /><span>View only · version {snapshot.snapshotVersion}. Changes, publishing and printing are restricted to School Administration and school management.</span></div>;
}

export function ReportCardWorkspace({ learners, snapshots, terms, renderJobs, documents, canManageReports }: { learners: ReportCardLearner[]; snapshots: ReportCardSnapshotRow[]; terms: { termNumber: number; name: string }[]; renderJobs: ReportCardRenderJobRow[]; documents: ReportCardDocumentRow[]; canManageReports: boolean }) {
  const [state, action, pending] = useActionState(generateReportCard, initialState);
  const [learnerId, setLearnerId] = useState(learners[0]?.enrolmentId ?? "");
  const [termNumber, setTermNumber] = useState(String(terms[0]?.termNumber ?? 1));

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  const latestByKey = useMemo(() => {
    const map = new Map<string, ReportCardSnapshotRow>();
    for (const snapshot of snapshots) {
      const key = `${snapshot.enrolmentId}:${snapshot.termNumber}`;
      const current = map.get(key);
      if (!current || snapshot.snapshotVersion > current.snapshotVersion) map.set(key, snapshot);
    }
    return map;
  }, [snapshots]);

  const htmlJobsBySnapshot = useMemo(() => {
    const map = new Map<string, ReportCardRenderJobRow>();
    for (const job of renderJobs) {
      if (job.documentFormat !== "html") continue;
      if (!map.has(job.snapshotId)) map.set(job.snapshotId, job);
    }
    return map;
  }, [renderJobs]);

  const htmlDocumentsBySnapshot = useMemo(() => {
    const map = new Map<string, ReportCardDocumentRow>();
    for (const document of documents) {
      if (document.documentFormat !== "html") continue;
      if (!map.has(document.snapshotId)) map.set(document.snapshotId, document);
    }
    return map;
  }, [documents]);

  return <div className="space-y-5">
    {canManageReports ? <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="mb-4"><h2 className="scolapro-section-title">Generate report card</h2><p className="scolapro-section-description">Only approved official results are included. Regeneration creates a new immutable snapshot version rather than rewriting history.</p></div>
      <form action={action} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.35fr)_auto] lg:items-end">
        <Picker label="Learner" name="enrolmentId" value={learnerId} onChange={setLearnerId} placeholder="Choose learner" options={learners.map((learner) => ({ value: learner.enrolmentId, label: learner.name, helper: `${learner.admissionNumber ?? "No admission number"} · ${learner.grade} · ${learner.registerClass}` }))} />
        <Picker label="Term" name="termNumber" value={termNumber} onChange={setTermNumber} placeholder="Choose term" options={terms.map((term) => ({ value: String(term.termNumber), label: term.name }))} />
        <button type="submit" disabled={pending || !learnerId} className={`${actionButton} scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60`}>{pending ? <Spinner className="size-4 text-white" /> : <FilePlus2 className="size-4" />}{pending ? "Generating…" : "Generate snapshot"}</button>
      </form>
    </section> : <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface text-brand-strong shadow-[var(--shadow-xs)]"><Eye className="size-4" /></span><div><h2 className="scolapro-section-title">View-only report access</h2><p className="scolapro-section-description">You can review report-card status for learners within your assigned teaching scope. Only School Administration, the Principal and Deputy Principal can generate, certify, publish or render official report cards.</p></div></div></section>}

    <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
      <div className="border-b border-border-subtle px-4 py-4 sm:px-5"><h2 className="scolapro-section-title">Current learner reports</h2><p className="scolapro-section-description">Latest snapshot status for each learner and configured term.{canManageReports ? " Digital rendering is available after certification; PDF rendering remains separate until its renderer is implemented." : " This list is read-only for teaching roles."}</p></div>
      {learners.length ? <div className="divide-y divide-border-subtle">{learners.map((learner) => <div key={learner.enrolmentId} className="grid gap-3 px-4 py-4 sm:px-5 xl:grid-cols-[minmax(15rem,0.7fr)_minmax(0,1.3fr)] xl:items-start">
        <div><p className="scolapro-record-title">{learner.name}</p><p className="mt-1 text-[0.7rem] text-muted-foreground">{learner.admissionNumber ?? "No admission number"} · {learner.grade} · {learner.registerClass}</p></div>
        <div className="grid gap-2 sm:grid-cols-3">{terms.map((term) => {
          const snapshot = latestByKey.get(`${learner.enrolmentId}:${term.termNumber}`);
          const renderJob = snapshot ? htmlJobsBySnapshot.get(snapshot.id) ?? null : null;
          const document = snapshot ? htmlDocumentsBySnapshot.get(snapshot.id) ?? null : null;
          return <div key={term.termNumber} className="rounded-[var(--radius-sm)] bg-surface-muted p-3">
            <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{term.name}</p>{snapshot ? <span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-medium ${snapshot.status === "certified" || snapshot.status === "published" ? "bg-success-soft text-[color:var(--success)]" : "bg-warning-soft text-[color:var(--warning)]"}`}>{snapshot.status}</span> : null}</div>
            {!canManageReports ? <ReadOnlyReportState snapshot={snapshot} /> : snapshot ? <><p className="mt-2 text-[0.68rem] text-muted-foreground">Version {snapshot.snapshotVersion} · {snapshot.templateVersion}</p>{snapshot.status === "draft" ? <form action={certifyReportCard} className="mt-2"><input type="hidden" name="snapshotId" value={snapshot.id} /><button type="submit" className={`${actionButton} inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-success-soft px-2.5 text-[0.68rem] font-semibold text-[color:var(--success)] hover:bg-[color:var(--success)] hover:text-white`}><BadgeCheck className="size-3.5" />Certify</button></form> : snapshot.status === "certified" ? <><form action={publishReportCard} className="mt-2"><input type="hidden" name="snapshotId" value={snapshot.id} /><button type="submit" className={`${actionButton} inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-brand-soft px-2.5 text-[0.68rem] font-semibold text-brand-strong hover:bg-brand hover:text-white`}><Send className="size-3.5" />Publish to guardians</button></form><HtmlRenderControl snapshot={snapshot} job={renderJob} document={document} /></> : <><div className="mt-2 inline-flex items-center gap-1.5 text-[0.68rem] font-medium text-[color:var(--success)]"><FileCheck2 className="size-3.5" />Published official snapshot</div><HtmlRenderControl snapshot={snapshot} job={renderJob} document={document} /></>}</> : <p className="mt-2 text-[0.68rem] text-muted-foreground">Not generated</p>}
          </div>;
        })}</div>
      </div>)}</div> : <div className="px-4 py-10 text-center text-sm text-muted-foreground">No current learner enrolments available.</div>}
    </section>
  </div>;
}
