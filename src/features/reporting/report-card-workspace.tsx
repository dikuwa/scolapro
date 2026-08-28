"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { BadgeCheck, FileCheck2, FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { certifyReportCard, generateReportCard, type ReportCardActionState } from "@/features/reporting/server/actions";
import type { ReportCardLearner, ReportCardSnapshotRow } from "@/features/reporting/server/report-cards";

const initialState: ReportCardActionState = {};

export function ReportCardWorkspace({ learners, snapshots, terms }: { learners: ReportCardLearner[]; snapshots: ReportCardSnapshotRow[]; terms: { termNumber: number; name: string }[] }) {
  const [state, action, pending] = useActionState(generateReportCard, initialState);
  const [learnerId, setLearnerId] = useState(learners[0]?.enrolmentId ?? "");
  const [termNumber, setTermNumber] = useState(String(terms[0]?.termNumber ?? 1));

  useEffect(() => {
    if (!state.message) return;
    state.success ? toast.success(state.message) : toast.error(state.message);
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

  return <div className="space-y-5">
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="mb-4"><h2 className="scolapro-section-title">Generate report card</h2><p className="scolapro-section-description">Only approved official results are included. Regeneration creates a new immutable snapshot version rather than rewriting history.</p></div>
      <form action={action} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.35fr)_auto] lg:items-end">
        <Picker label="Learner" name="enrolmentId" value={learnerId} onChange={setLearnerId} placeholder="Choose learner" options={learners.map((learner) => ({ value: learner.enrolmentId, label: learner.name, helper: `${learner.admissionNumber ?? "No admission number"} · ${learner.grade} · ${learner.registerClass}` }))} />
        <Picker label="Term" name="termNumber" value={termNumber} onChange={setTermNumber} placeholder="Choose term" options={terms.map((term) => ({ value: String(term.termNumber), label: term.name }))} />
        <button type="submit" disabled={pending || !learnerId} className="scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white disabled:opacity-60">{pending ? <Spinner className="size-4 text-white" /> : <FilePlus2 className="size-4" />}{pending ? "Generating…" : "Generate snapshot"}</button>
      </form>
    </section>

    <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
      <div className="border-b border-border-subtle px-4 py-4 sm:px-5"><h2 className="scolapro-section-title">Current learner reports</h2><p className="scolapro-section-description">Latest snapshot status for each learner and configured term.</p></div>
      {learners.length ? <div className="divide-y divide-border-subtle">{learners.map((learner) => <div key={learner.enrolmentId} className="grid gap-3 px-4 py-4 sm:px-5 xl:grid-cols-[minmax(15rem,0.7fr)_minmax(0,1.3fr)] xl:items-start">
        <div><p className="scolapro-record-title">{learner.name}</p><p className="mt-1 text-[0.7rem] text-muted-foreground">{learner.admissionNumber ?? "No admission number"} · {learner.grade} · {learner.registerClass}</p></div>
        <div className="grid gap-2 sm:grid-cols-3">{terms.map((term) => {
          const snapshot = latestByKey.get(`${learner.enrolmentId}:${term.termNumber}`);
          return <div key={term.termNumber} className="rounded-[var(--radius-sm)] bg-surface-muted p-3">
            <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{term.name}</p>{snapshot ? <span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-medium ${snapshot.status === "certified" || snapshot.status === "published" ? "bg-success-soft text-[color:var(--success)]" : "bg-warning-soft text-[color:var(--warning)]"}`}>{snapshot.status}</span> : null}</div>
            {snapshot ? <><p className="mt-2 text-[0.68rem] text-muted-foreground">Version {snapshot.snapshotVersion} · {snapshot.templateVersion}</p>{snapshot.status === "draft" ? <form action={certifyReportCard} className="mt-2"><input type="hidden" name="snapshotId" value={snapshot.id} /><button type="submit" className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-success-soft px-2.5 text-[0.68rem] font-semibold text-[color:var(--success)]"><BadgeCheck className="size-3.5" />Certify</button></form> : <div className="mt-2 inline-flex items-center gap-1.5 text-[0.68rem] font-medium text-[color:var(--success)]"><FileCheck2 className="size-3.5" />Official snapshot</div>}</> : <p className="mt-2 text-[0.68rem] text-muted-foreground">Not generated</p>}
          </div>;
        })}</div>
      </div>)}</div> : <div className="px-4 py-10 text-center text-sm text-muted-foreground">No current learner enrolments available.</div>}
    </section>
  </div>;
}
