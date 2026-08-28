"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Check, Clock3, Search, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { recordLateArrival, resolveDetention, type LateArrivalActionState } from "@/features/late-arrivals/server/actions";
import type { LateArrivalLearner, LateDetentionItem } from "@/features/late-arrivals/server/queries";

const initialState: LateArrivalActionState = {};

export function LateArrivalWorkspace({ learners, detention, today }: { learners: LateArrivalLearner[]; detention: LateDetentionItem[]; today: string }) {
  const [state, action, pending] = useActionState(recordLateArrival, initialState);
  const [query, setQuery] = useState("");
  const [enrolmentId, setEnrolmentId] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return learners;
    return learners.filter((item) => `${item.name} ${item.admissionNumber ?? ""} ${item.registerClass}`.toLowerCase().includes(needle));
  }, [learners, query]);

  useEffect(() => {
    if (!state.message) return;
    state.success ? toast.success(state.message) : toast.error(state.message);
    if (state.success) { setEnrolmentId(""); setQuery(""); }
  }, [state]);

  return (
    <div className="space-y-5">
      <section className="bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
          <div><h2 className="scolapro-section-title">Record morning late arrival</h2><p className="scolapro-section-description">This operational record is separate from the official daily attendance register.</p><label className="scolapro-control-surface mt-4 flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] px-3"><Search className="size-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find learner by name, number or class…" className="min-w-0 flex-1 bg-transparent text-xs outline-none" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear learner search"><X className="size-3.5 text-muted-foreground" /></button> : null}</label><div className="mt-2 max-h-56 overflow-y-auto border-y border-border-subtle">{filtered.slice(0, 30).map((learner) => <button key={learner.enrolmentId} type="button" onClick={() => setEnrolmentId(learner.enrolmentId)} className={`flex w-full items-center justify-between gap-3 border-b border-border-subtle px-2 py-2.5 text-left last:border-b-0 ${enrolmentId === learner.enrolmentId ? "bg-brand-soft" : "hover:bg-surface-muted"}`}><span className="min-w-0"><span className="scolapro-record-title block truncate">{learner.name}</span><span className="text-[0.68rem] text-muted-foreground">{learner.registerClass} · {learner.admissionNumber ?? "No number"}</span></span>{enrolmentId === learner.enrolmentId ? <Check className="size-4 shrink-0 text-brand" /> : null}</button>)}</div></div>
          <form action={action} className="bg-surface-muted/55 p-4"><input type="hidden" name="enrolmentId" value={enrolmentId} /><input type="hidden" name="arrivalDate" value={today} /><h3 className="scolapro-section-title">Arrival details</h3><p className="scolapro-section-description">{today}</p><label className="mt-4 block text-xs font-medium">Note<textarea name="note" rows={4} placeholder="Optional context" className="mt-1.5 w-full resize-none rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3 text-xs outline-none" /></label><button type="submit" disabled={!enrolmentId || pending} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50"><Clock3 className="size-4" />{pending ? "Recording…" : "Record late arrival"}</button></form>
        </div>
      </section>

      <section className="bg-surface shadow-[var(--shadow-xs)]"><div className="border-b border-border-subtle px-4 py-4 sm:px-5"><h2 className="scolapro-section-title">Detention queue</h2><p className="scolapro-section-description">Learners reaching the school weekly late-coming threshold remain here until detention is completed or explicitly waived.</p></div>{detention.length ? <div className="divide-y divide-border-subtle">{detention.map((item) => <div key={item.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"><div><p className="scolapro-record-title">{item.learnerName}</p><p className="mt-1 text-[0.68rem] text-muted-foreground">{item.lateCount} late arrivals · due {item.dueOn} · <span className="capitalize">{item.status.replaceAll("_", " ")}</span></p></div><div className="flex gap-2"><form action={resolveDetention}><input type="hidden" name="obligationId" value={item.id} /><input type="hidden" name="status" value="completed" /><button type="submit" className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-success-soft px-2.5 text-[0.7rem] font-semibold text-[color:var(--success)]"><ShieldCheck className="size-3.5" />Completed</button></form><form action={resolveDetention}><input type="hidden" name="obligationId" value={item.id} /><input type="hidden" name="status" value="waived" /><button type="submit" className="min-h-8 rounded-[var(--radius-xs)] bg-surface-muted px-2.5 text-[0.7rem] font-medium text-muted-foreground">Waive</button></form></div></div>)}</div> : <div className="px-5 py-9 text-center text-xs text-muted-foreground">No open detention obligations.</div>}</section>
    </div>
  );
}
