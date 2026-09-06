"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Check, Clock3, Search, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { DateField } from "@/components/ui/date-field";
import { recordLateArrival, resolveDetention, type LateArrivalActionState } from "@/features/late-arrivals/server/actions";
import type { LateArrivalLearner, LateDetentionHistoryItem, LateDetentionItem } from "@/features/late-arrivals/server/queries";

const initialState: LateArrivalActionState = {};

export function LateArrivalWorkspace({ learners, detention, history, today }: { learners: LateArrivalLearner[]; detention: LateDetentionItem[]; history: LateDetentionHistoryItem[]; today: string }) {
  const [state, action, pending] = useActionState(recordLateArrival, initialState);
  const [query, setQuery] = useState("");
  const [enrolmentId, setEnrolmentId] = useState("");
  const [arrivalDate, setArrivalDate] = useState(today);
  const selectedLearner = learners.find((item) => item.enrolmentId === enrolmentId) ?? null;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return learners;
    return learners.filter((item) => `${item.name} ${item.admissionNumber ?? ""} ${item.registerClass}`.toLowerCase().includes(needle));
  }, [learners, query]);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
          <div>
            <h2 className="scolapro-section-title">Record morning late arrival</h2>
            <p className="scolapro-section-description">This operational record is separate from the official daily attendance register.</p>
            <label className="scolapro-control-surface mt-4 flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] px-3"><Search className="size-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find learner by name, number or class…" className="min-w-0 flex-1 bg-transparent text-xs outline-none" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear learner search"><X className="size-3.5 text-muted-foreground" /></button> : null}</label>
            <div className="mt-2 max-h-64 overflow-y-auto rounded-[var(--radius-sm)] border border-border-subtle bg-surface">
              {filtered.map((learner) => <button key={learner.enrolmentId} type="button" onClick={() => setEnrolmentId(learner.enrolmentId)} className={`flex w-full items-center justify-between gap-3 border-b border-border-subtle px-3 py-2.5 text-left last:border-b-0 ${enrolmentId === learner.enrolmentId ? "bg-brand-soft" : "hover:bg-surface-muted"}`}>
                <span className="min-w-0"><span className="scolapro-record-title block truncate">{learner.name}</span><span className="text-[0.68rem] text-muted-foreground">{learner.registerClass} · {learner.admissionNumber ?? "No number"}</span></span>
                <span className="flex shrink-0 items-center gap-2">{learner.weekLateCount ? <span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.65rem] font-semibold ${learner.weekLateCount >= 3 ? "bg-danger-soft text-[color:var(--danger)]" : "bg-warning-soft text-[color:var(--warning)]"}`}>{learner.weekLateCount} this week</span> : null}{enrolmentId === learner.enrolmentId ? <Check className="size-4 text-brand" /> : null}</span>
              </button>)}
              {!filtered.length ? <p className="px-3 py-5 text-center text-xs text-muted-foreground">No learners match this search.</p> : null}
            </div>
          </div>

          <form action={action} className="rounded-[var(--radius-md)] bg-surface-muted/55 p-4">
            <input type="hidden" name="enrolmentId" value={enrolmentId} />
            <h3 className="scolapro-section-title">Arrival details</h3>
            <p className="scolapro-section-description">Choose the actual date the learner arrived late. Historical capture is allowed; future dates are blocked.</p>
            {selectedLearner ? <div className="mt-3 rounded-[var(--radius-sm)] bg-surface px-3 py-2.5 shadow-[var(--shadow-xs)]"><p className="text-xs font-semibold">{selectedLearner.name}</p><p className="mt-0.5 text-[0.68rem] text-muted-foreground">{selectedLearner.registerClass} · {selectedLearner.weekLateCount} late this week{selectedLearner.lastLateDate ? ` · last ${selectedLearner.lastLateDate}` : ""}</p></div> : <div className="mt-3 rounded-[var(--radius-sm)] border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">Select a learner from the list first.</div>}
            <DateField label="Late-arrival date" name="arrivalDate" value={arrivalDate} onChange={setArrivalDate} max={today} required className="mt-4" />
            <label className="mt-4 block text-xs font-medium">Note<textarea name="note" rows={3} placeholder="Optional context" className="mt-1.5 w-full resize-none rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3 text-xs outline-none focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></label>
            <button type="submit" disabled={!enrolmentId || !arrivalDate || pending} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50"><Clock3 className="size-4" />{pending ? "Recording…" : "Record late arrival"}</button>
          </form>
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
        <div className="border-b border-border-subtle px-4 py-4 sm:px-5"><div className="flex items-start justify-between gap-3"><div><h2 className="scolapro-section-title">Detention queue</h2><p className="scolapro-section-description">Learners reaching the weekly late-coming threshold remain here until detention is completed or explicitly waived.</p></div><span className="rounded-[var(--radius-xs)] bg-warning-soft px-2.5 py-1.5 text-xs font-semibold text-[color:var(--warning)]">{detention.length} open</span></div></div>
        {detention.length ? <div className="divide-y divide-border-subtle">{detention.map((item) => <div key={item.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"><div><p className="scolapro-record-title">{item.learnerName}</p><p className="mt-1 text-[0.68rem] text-muted-foreground">{item.lateCount} late arrivals · due {item.dueOn} · <span className="capitalize">{item.status.replaceAll("_", " ")}</span></p></div><div className="flex gap-2"><form action={resolveDetention}><input type="hidden" name="obligationId" value={item.id} /><input type="hidden" name="status" value="completed" /><button type="submit" className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-success-soft px-2.5 text-[0.7rem] font-semibold text-[color:var(--success)]"><ShieldCheck className="size-3.5" />Completed</button></form><form action={resolveDetention}><input type="hidden" name="obligationId" value={item.id} /><input type="hidden" name="status" value="waived" /><button type="submit" className="min-h-8 rounded-[var(--radius-xs)] bg-surface-muted px-2.5 text-[0.7rem] font-medium text-muted-foreground">Waive</button></form></div></div>)}</div> : <div className="px-5 py-9 text-center text-xs text-muted-foreground">No open detention obligations.</div>}
      </section>

      <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
        <div className="border-b border-border-subtle px-4 py-4 sm:px-5"><h2 className="scolapro-section-title">Detention history</h2><p className="scolapro-section-description">Resolved obligations leave the active queue but remain available as an auditable learner history.</p></div>
        {history.length?<div className="divide-y divide-border-subtle">{history.map((item)=><article key={item.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"><div><p className="scolapro-record-title">{item.learnerName}</p><p className="mt-1 text-[0.68rem] text-muted-foreground">{item.lateCount} qualifying late arrivals · due {item.dueOn}{item.latestSessionDate?` · session ${item.latestSessionDate}`:""}{item.resolutionNote?` · ${item.resolutionNote}`:""}</p></div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.65rem] font-semibold capitalize ${item.status==="completed"?"bg-success-soft text-[color:var(--success)]":item.status==="waived"?"bg-info-soft text-[color:var(--info)]":"bg-warning-soft text-[color:var(--warning)]"}`}>{item.status.replaceAll("_"," ")}</span>{item.sessionCount?<span className="text-[0.68rem] text-muted-foreground">{item.sessionCount} session{item.sessionCount===1?"":"s"}</span>:null}</div></article>)}</div>:<div className="px-5 py-9 text-center text-xs text-muted-foreground">No detention history yet.</div>}
      </section>
    </div>
  );
}
