"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { reviewProfileChange, type ProfileChangeActionState } from "@/features/profile-changes/server/actions";
import type { ProfileChangeRequestRow } from "@/features/profile-changes/server/queries";

const initialState: ProfileChangeActionState = {};
const statusOptions = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

function ReviewButtons({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(reviewProfileChange, initialState);
  useEffect(() => {
    if (!state.message) return;
    state.success ? toast.success(state.message) : toast.error(state.message);
  }, [state]);
  return <form action={action} className="flex flex-wrap items-center gap-1.5"><input type="hidden" name="requestId" value={requestId} /><input name="note" aria-label="Review note" placeholder="Optional note" className="min-h-8 w-36 rounded-[var(--radius-xs)] border border-border-subtle bg-surface px-2 text-[0.68rem] outline-none focus:border-[color:var(--brand)]/45" /><button type="submit" name="decision" value="approved" disabled={pending} className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-xs)] bg-success-soft px-2.5 text-[0.68rem] font-semibold text-[color:var(--success)] disabled:opacity-60">{pending ? <Spinner className="size-3" /> : <Check className="size-3" />}Approve</button><button type="submit" name="decision" value="rejected" disabled={pending} className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-xs)] bg-danger-soft px-2.5 text-[0.68rem] font-semibold text-[color:var(--danger)] disabled:opacity-60">{pending ? <Spinner className="size-3" /> : <X className="size-3" />}Reject</button></form>;
}

export function ProfileChangeReviewList({ requests }: { requests: ProfileChangeRequestRow[] }) {
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("pending");
  const filtered=useMemo(()=>{const needle=query.trim().toLowerCase();return requests.filter((r)=>(status==="all"||r.status===status)&&(!needle||`${r.learnerName} ${r.fieldKey} ${r.currentValue??""} ${r.proposedValue??""}`.toLowerCase().includes(needle)));},[requests,query,status]);
  return <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]"><div className="border-b border-border-subtle p-4 sm:p-5"><div><h2 className="scolapro-section-title">Correction queue</h2><p className="scolapro-section-description">Review proposed learner/guardian changes before authoritative identity or contact records are updated.</p></div><div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start"><label className="scolapro-control-surface flex min-h-10 max-w-md flex-1 items-center gap-2 rounded-[var(--radius-sm)] px-3"><Search className="size-4 text-muted-foreground"/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search learner or field…" className="min-w-0 flex-1 bg-transparent text-xs outline-none"/></label><Picker ariaLabel="Correction request status" name="correction-status-filter" value={status} onChange={setStatus} placeholder="Status" options={statusOptions} className="w-full sm:w-44" /></div></div>{filtered.length?<div className="divide-y divide-border-subtle">{filtered.map((request)=><div key={request.id} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center"><div className="min-w-0"><Link href={`/learners/${request.learnerId}`} className="scolapro-record-title hover:text-brand-strong">{request.learnerName}</Link><p className="mt-0.5 text-[0.68rem] capitalize text-muted-foreground">{request.targetType.replaceAll("_"," ")} · {request.fieldKey.replaceAll("_"," ")} · {new Date(request.requestedAt).toLocaleString()}</p>{request.reason?<p className="mt-1 text-xs text-muted-foreground">{request.reason}</p>:null}</div><div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-[var(--radius-xs)] bg-surface-muted p-2"><span className="block text-[0.62rem] font-medium uppercase tracking-wide text-muted-foreground">Current</span><span className="mt-1 block break-words">{request.currentValue||"—"}</span></div><div className="rounded-[var(--radius-xs)] bg-brand-soft p-2"><span className="block text-[0.62rem] font-medium uppercase tracking-wide text-brand-strong">Proposed</span><span className="mt-1 block break-words font-medium">{request.proposedValue||"—"}</span></div></div><div>{request.status==="pending"?<ReviewButtons requestId={request.id}/>:<span className="inline-flex rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.68rem] font-medium capitalize text-muted-foreground">{request.status}</span>}</div></div>)}</div>:<div className="p-10 text-center text-xs text-muted-foreground">No correction requests match this view.</div>}</section>;
}
