"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Check, Clock3, Save, Search, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { submitSubjectAttendance, type SubjectAttendanceState } from "@/features/attendance/server/subject-actions";
import type { SubjectPeriodRoster } from "@/features/attendance/server/subject-period";

const initialState: SubjectAttendanceState = {};
type Status = SubjectPeriodRoster["learners"][number]["status"];
const statuses = [
  { value: "present" as const, label: "Present", icon: Check, style: "bg-success-soft text-[color:var(--success)]" },
  { value: "absent" as const, label: "Absent", icon: X, style: "bg-danger-soft text-[color:var(--danger)]" },
  { value: "late" as const, label: "Late", icon: Clock3, style: "bg-warning-soft text-[color:var(--warning)]" },
  { value: "excused" as const, label: "Excused", icon: ShieldCheck, style: "bg-info-soft text-[color:var(--info)]" },
];

export function SubjectPeriodRegister({ roster, attendanceDate }: { roster: SubjectPeriodRoster; attendanceDate: string }) {
  const [state, action, pending] = useActionState(submitSubjectAttendance, initialState);
  const [rows, setRows] = useState(roster.learners);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [clientMutationId] = useState(() => crypto.randomUUID());
  useEffect(() => { if (!state.message) return; state.success ? toast.success(state.message) : toast.error(state.message); }, [state]);

  const visible = useMemo(() => { const n=query.trim().toLowerCase(); return rows.filter((row)=>!n||`${row.name} ${row.admissionNumber??""}`.toLowerCase().includes(n)); },[query,rows]);
  const exceptions = useMemo(() => rows.filter((row)=>row.status!=="present").map((row)=>({ enrolment_id:row.enrolmentId,status:row.status as "absent"|"late"|"excused"|"unknown",reason_id:row.reasonId,note:row.note })),[rows]);
  function update(id:string, changes:Partial<(typeof rows)[number]>) { setRows((current)=>current.map((row)=>row.enrolmentId===id?{...row,...changes}:row)); }
  function setStatus(id:string,status:Status){ update(id,{status,reasonId:status==="present"?null:rows.find((row)=>row.enrolmentId===id)?.reasonId??null,note:status==="present"?null:rows.find((row)=>row.enrolmentId===id)?.note??null}); setActiveId(status==="present"?null:id); }
  const presentCount=rows.filter((row)=>row.status==="present").length;

  return <form action={action} className="space-y-4">
    <input type="hidden" name="slotId" value={roster.slot.id}/><input type="hidden" name="attendanceDate" value={attendanceDate}/><input type="hidden" name="clientMutationId" value={clientMutationId}/><input type="hidden" name="replacesSubmissionId" value={roster.currentSubmissionId??""}/><input type="hidden" name="exceptions" value={JSON.stringify(exceptions)}/>
    <section className="bg-surface shadow-[var(--shadow-xs)]">
      <div className="border-b border-border-subtle bg-surface-muted/55 p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="scolapro-section-title">Lesson register</h2><p className="scolapro-section-description">Operational attendance for this lesson only. It does not replace the official morning register.</p></div><div className="flex gap-2 text-[0.7rem]"><span className="rounded-[var(--radius-xs)] bg-success-soft px-2 py-1 font-medium text-[color:var(--success)]">{presentCount} present</span><span className="rounded-[var(--radius-xs)] bg-surface px-2 py-1 text-muted-foreground">{rows.length-presentCount} exceptions</span></div></div><label className="scolapro-control-surface mt-3 flex min-h-10 w-full max-w-md items-center gap-2 rounded-[var(--radius-sm)] px-3"><Search className="size-4 text-muted-foreground"/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Find learner…" className="min-w-0 flex-1 bg-transparent text-xs outline-none"/></label></div>
      <div className="divide-y divide-border-subtle">{visible.map((row)=>{const active=activeId===row.enrolmentId;return <div key={row.enrolmentId} className={`p-3 sm:p-4 ${active?"bg-brand-soft/35":""}`}><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><button type="button" onClick={()=>setActiveId(active?null:row.enrolmentId)} className="min-w-0 text-left"><p className="scolapro-record-title truncate">{row.name}</p><p className="text-[0.68rem] text-muted-foreground">{row.admissionNumber??"No admission number"}</p></button><div className="grid grid-cols-4 gap-1">{statuses.map((item)=>{const Icon=item.icon;const selected=row.status===item.value;return <button key={item.value} type="button" onClick={()=>setStatus(row.enrolmentId,item.value)} className={`inline-flex min-h-8 items-center justify-center gap-1 rounded-[var(--radius-xs)] px-2 text-[0.68rem] font-semibold ${selected?item.style:"bg-surface-muted text-muted-foreground"}`}>{selected?<Icon className="size-3"/>:null}{item.label}</button>})}</div></div>{active&&row.status!=="present"?<div className="mt-3 grid gap-3 rounded-[var(--radius-sm)] bg-surface p-3 shadow-[var(--shadow-xs)] sm:grid-cols-2"><Picker label="Reason" name={`lesson-reason-${row.enrolmentId}`} value={row.reasonId??""} onChange={(value)=>update(row.enrolmentId,{reasonId:value||null})} placeholder="No reason" options={[{value:"",label:"No reason"},...roster.reasons.map((reason)=>({value:reason.id,label:reason.name,helper:reason.sensitive?"Restricted detail":undefined}))]}/><label className="text-xs font-medium">Note<input value={row.note??""} onChange={(e)=>update(row.enrolmentId,{note:e.target.value})} placeholder="Optional context" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs outline-none"/></label></div>:null}</div>})}</div>
      <div className="sticky bottom-[4.4rem] z-10 flex items-center justify-between gap-3 border-t border-border-subtle bg-[color:var(--surface)]/96 p-3 backdrop-blur-xl lg:bottom-0 sm:p-4"><p className="text-[0.68rem] text-muted-foreground">{roster.currentSubmissionId?"Saving creates a new lesson-attendance revision.":"Everyone starts present; record only exceptions."}</p><button type="submit" disabled={pending} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-xs font-semibold text-white disabled:opacity-60">{pending?<Spinner className="size-4 text-white"/>:<Save className="size-4"/>}{pending?"Saving…":roster.currentSubmissionId?"Save revision":"Confirm lesson"}</button></div>
    </section>
  </form>;
}
