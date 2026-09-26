"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { Filter, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Picker } from "@/components/ui/picker";
import {
  queueAssessmentMarkDraft,
  syncQueuedAssessmentMarkDrafts,
  type OfflineAssessmentMarkDraftPayload,
} from "./offline/marks-draft-queue";
import {
  submitMarkGridForReview,
  type MarkGridActionState,
  type MarkGridLearner,
  type MarkGridWorkspaceData,
} from "./server/mark-grid";
import type { OfflineScope } from "@/lib/offline/db";

const initialState:MarkGridActionState={message:""};
const statusOptions=[
  {value:"",label:"Numeric mark"},
  {value:"absent",label:"Absent"},
  {value:"exempt",label:"Exempt"},
  {value:"incomplete",label:"Incomplete"},
  {value:"withheld",label:"Withheld"},
];

type LocalDraft={
  numericMark:string;
  status:string;
  version:string|null;
  state:"idle"|"saving"|"saved"|"queued"|"error";
  message?:string;
};

function initialDraft(row:MarkGridLearner):LocalDraft{
  return {
    numericMark:row.currentMark==null?"":String(row.currentMark),
    status:row.currentStatus??"",
    version:row.currentVersion,
    state:"idle",
  };
}

export function MarkGridWorkspace({data,offlineScope}:{data:MarkGridWorkspaceData;offlineScope:OfflineScope}){
  const router=useRouter();
  const selected=data.instances.find((item)=>item.id===data.selectedInstanceId)??null;
  const [filter,setFilter]=useState<"all"|"missing"|"errors">("all");
  const [drafts,setDrafts]=useState<Record<string,LocalDraft>>(()=>Object.fromEntries(data.learners.map((row)=>[row.enrolmentId,initialDraft(row)])));
  const [submitState,submitAction,submitPending]=useActionState(submitMarkGridForReview,initialState);
  const timers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
  const inputs=useRef(new Map<string,HTMLInputElement>());
  const editable=Boolean(selected&&["open","returned"].includes(selected.status));

  const visible=useMemo(()=>data.learners.filter((row)=>{
    const draft=drafts[row.enrolmentId]??initialDraft(row);
    if(filter==="missing") return !draft.numericMark&&!draft.status;
    if(filter==="errors") return draft.state==="error";
    return true;
  }),[data.learners,drafts,filter]);

  async function persist(row:MarkGridLearner,next:LocalDraft){
    if(!selected) return;
    const numeric=next.status||next.numericMark.trim()===""?null:Number(next.numericMark);
    if(numeric!=null&&(!Number.isFinite(numeric)||numeric<0||(selected.rawMax!=null&&numeric>selected.rawMax))){
      setDrafts((current)=>({...current,[row.enrolmentId]:{...next,state:"error",message:selected.rawMax==null?"Enter a valid non-negative mark.":`Mark must be between 0 and ${selected.rawMax}.`}}));
      return;
    }
    const payload:OfflineAssessmentMarkDraftPayload={
      assessmentInstanceId:selected.id,
      enrolmentId:row.enrolmentId,
      learnerId:row.learnerId,
      numericMark:numeric,
      markStatus:(next.status||null) as OfflineAssessmentMarkDraftPayload["markStatus"],
      teacherNote:null,
      expectedVersion:next.version,
      clientMutationId:crypto.randomUUID(),
    };
    if(!navigator.onLine){
      await queueAssessmentMarkDraft(offlineScope,payload);
      setDrafts((current)=>({...current,[row.enrolmentId]:{...next,state:"queued",message:"Saved on this device."}}));
      return;
    }
    setDrafts((current)=>({...current,[row.enrolmentId]:{...next,state:"saving"}}));
    try{
      const response=await fetch("/api/offline/assessment/marks",{
        method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},
        body:JSON.stringify({scope:offlineScope,payload}),
      });
      const body=await response.json().catch(()=>({})) as {version?:string;code?:string;message?:string};
      if(!response.ok){
        const message=body.code==="stale_version"?"A newer draft exists. Reload before editing this learner.":body.code==="assessment_not_editable"?"This assessment is no longer editable.":body.message??"Mark could not be saved.";
        setDrafts((current)=>({...current,[row.enrolmentId]:{...next,state:"error",message}}));
        return;
      }
      setDrafts((current)=>({...current,[row.enrolmentId]:{...next,version:body.version??next.version,state:"saved",message:"Saved"}}));
    }catch{
      await queueAssessmentMarkDraft(offlineScope,payload);
      setDrafts((current)=>({...current,[row.enrolmentId]:{...next,state:"queued",message:"Queued after connection loss."}}));
    }
  }

  function scheduleSave(row:MarkGridLearner,next:LocalDraft){
    setDrafts((current)=>({...current,[row.enrolmentId]:next}));
    const existing=timers.current.get(row.enrolmentId);
    if(existing) clearTimeout(existing);
    timers.current.set(row.enrolmentId,setTimeout(()=>void persist(row,next),350));
  }

  function onMark(row:MarkGridLearner,value:string){
    const current=drafts[row.enrolmentId]??initialDraft(row);
    scheduleSave(row,{...current,numericMark:value,status:"",state:"idle",message:undefined});
  }
  function onStatus(row:MarkGridLearner,value:string){
    const current=drafts[row.enrolmentId]??initialDraft(row);
    scheduleSave(row,{...current,status:value,numericMark:"",state:"idle",message:undefined});
  }

  function handleKey(rowIndex:number,event:React.KeyboardEvent<HTMLInputElement>){
    if(event.key!=="ArrowDown"&&event.key!=="ArrowUp"&&event.key!=="Enter") return;
    event.preventDefault();
    const delta=event.key==="ArrowUp"?-1:1;
    const target=visible[rowIndex+delta];
    if(target) inputs.current.get(target.enrolmentId)?.focus();
  }

  function handlePaste(startIndex:number,event:React.ClipboardEvent<HTMLInputElement>){
    const text=event.clipboardData.getData("text/plain");
    if(!text.includes("\n")&&!text.includes("\t")) return;
    event.preventDefault();
    const values=text.split(/\r?\n/).flatMap((line)=>line.split("\t")).map((value)=>value.trim()).filter((value)=>value!=="");
    const updates:Array<Promise<void>>=[];
    values.forEach((value,offset)=>{
      const row=visible[startIndex+offset];
      if(!row||!/^\d+(?:\.\d+)?$/.test(value)) return;
      const numeric=Number(value);
      if(selected?.rawMax!=null&&numeric>selected.rawMax) return;
      const current=drafts[row.enrolmentId]??initialDraft(row);
      const next={...current,numericMark:value,status:"",state:"idle" as const,message:undefined};
      setDrafts((state)=>({...state,[row.enrolmentId]:next}));
      updates.push(persist(row,next));
    });
    void Promise.all(updates);
  }

  if(!selected) return <section className="rounded-[var(--radius-md)] bg-surface-muted p-6 text-sm text-muted-foreground">No accessible assessment instances are available for mark entry.</section>;

  return <div className="space-y-4">
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <Picker
          label="Assessment"
          value={selected.id}
          onChange={(value)=>router.push(`/assessment/marks?instance=${encodeURIComponent(value)}`)}
          placeholder="Choose assessment"
          searchable
          options={data.instances.map((item)=>({value:item.id,label:`${item.subject} · ${item.grade} · ${item.className}`,helper:`${item.displayName} · ${item.status}`}))}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={filter==="all"?"soft":"ghost"} size="sm" onClick={()=>setFilter("all")}><Filter className="size-4"/>All</Button>
          <Button type="button" variant={filter==="missing"?"soft":"ghost"} size="sm" onClick={()=>setFilter("missing")}>Missing</Button>
          <Button type="button" variant={filter==="errors"?"soft":"ghost"} size="sm" onClick={()=>setFilter("errors")}>Errors</Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div><p className="text-xs text-muted-foreground">Assessment</p><p className="mt-1 text-sm font-medium">{selected.displayName}</p></div>
        <div><p className="text-xs text-muted-foreground">Component</p><p className="mt-1 text-sm font-medium">{selected.componentName}</p></div>
        <div><p className="text-xs text-muted-foreground">Maximum</p><p className="mt-1 text-sm font-medium">{selected.rawMax??"Not configured"}</p></div>
        <div><p className="text-xs text-muted-foreground">Term</p><p className="mt-1 text-sm font-medium">{selected.termNumber??"—"}</p></div>
        <div><p className="text-xs text-muted-foreground">State</p><p className="mt-1 text-sm font-medium capitalize">{selected.status.replaceAll("_"," ")}</p></div>
      </div>
      {!editable?<p className="mt-3 text-xs text-warning">This assessment is read-only in its current lifecycle state. Marks cannot be changed through ordinary entry.</p>:null}
    </section>

    <section className="overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
      <div className="hidden overflow-auto md:block">
        <table className="min-w-[760px] w-full border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-surface-muted text-left text-xs text-muted-foreground">
            <tr><th className="sticky left-0 z-30 min-w-64 border-r border-border-subtle bg-surface-muted px-4 py-3">Learner</th><th className="w-40 px-3 py-3">Mark / {selected.rawMax??"max"}</th><th className="w-52 px-3 py-3">Status</th><th className="w-36 px-3 py-3">Calculated total</th><th className="w-36 px-3 py-3">Draft state</th></tr>
          </thead>
          <tbody>{visible.map((row,index)=>{
            const draft=drafts[row.enrolmentId]??initialDraft(row);
            return <tr key={row.enrolmentId} className="border-t border-border-subtle">
              <th className="sticky left-0 z-10 border-r border-border-subtle bg-surface px-4 py-2.5 text-left font-medium">{row.name}</th>
              <td className="px-3 py-2"><input ref={(node)=>{if(node)inputs.current.set(row.enrolmentId,node);}} aria-label={`Mark for ${row.name}`} inputMode="decimal" className="min-h-9 w-28 rounded-[var(--radius-xs)] border border-border-subtle bg-surface-elevated px-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft disabled:opacity-55" value={draft.numericMark} disabled={!editable||Boolean(draft.status)} onChange={(event)=>onMark(row,event.target.value)} onKeyDown={(event)=>handleKey(index,event)} onPaste={(event)=>handlePaste(index,event)}/></td>
              <td className="px-3 py-2"><Picker value={draft.status} onChange={(value)=>onStatus(row,value)} disabled={!editable} placeholder="Numeric mark" options={statusOptions}/></td>
              <td className="px-3 py-2 font-medium">{row.calculatedTotal==null?"—":`${row.calculatedTotal.toFixed(2)}%`}</td>
              <td className="px-3 py-2 text-xs"><span className={draft.state==="error"?"text-danger":draft.state==="queued"?"text-warning":"text-muted-foreground"}>{draft.message??(row.missing?"Missing":"Saved")}</span></td>
            </tr>;
          })}</tbody>
        </table>
      </div>

      <div className="divide-y divide-border-subtle md:hidden">{visible.map((row)=>{
        const draft=drafts[row.enrolmentId]??initialDraft(row);
        return <article key={row.enrolmentId} className="p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{row.name}</p><p className="mt-0.5 text-xs text-muted-foreground">Calculated total: {row.calculatedTotal==null?"—":`${row.calculatedTotal.toFixed(2)}%`}</p></div><span className="text-[0.68rem] text-muted-foreground">{draft.message??(row.missing?"Missing":"Saved")}</span></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium">Mark / {selected.rawMax??"max"}<input aria-label={`Mark for ${row.name}`} inputMode="decimal" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft disabled:opacity-55" value={draft.numericMark} disabled={!editable||Boolean(draft.status)} onChange={(event)=>onMark(row,event.target.value)}/></label>
            <Picker label="Status" value={draft.status} onChange={(value)=>onStatus(row,value)} disabled={!editable} placeholder="Numeric mark" options={statusOptions}/>
          </div>
          {draft.state==="error"?<p className="mt-2 text-xs text-danger">{draft.message}</p>:null}
        </article>;
      })}</div>
    </section>

    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-semibold">Draft → Validate → Submit</p><p className="mt-1 text-xs text-muted-foreground">Autosave preserves working marks. Submission is explicit and moves the assessment into the governed HOD review lifecycle.</p></div>
        {editable?<form action={submitAction}><input type="hidden" name="assessmentInstanceId" value={selected.id}/><Button type="submit" loading={submitPending}><Send className="size-4"/>Validate & submit</Button></form>:null}
      </div>
      {submitState.message?<p className={`mt-2 text-xs ${submitState.success?"text-success":"text-danger"}`}>{submitState.message}</p>:null}
      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={()=>void syncQueuedAssessmentMarkDrafts(offlineScope)}>Sync queued drafts</Button>
    </section>
  </div>;
}
