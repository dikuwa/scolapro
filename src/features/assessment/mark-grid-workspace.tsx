"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Filter, Save, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Picker } from "@/components/ui/picker";
import {
  cacheAssessmentMarkDraftReference,
  queueAssessmentMarkDraft,
  syncQueuedAssessmentMarkDrafts,
} from "@/features/assessment/offline/marks-draft-queue";
import type { MarkGridData, MarkGridRow } from "./server/mark-grid";
import { reopenMarkGridForCorrection, reviewMarkGrid, submitMarkGrid, validateMarkGrid, type MarkGridActionState } from "./server/mark-grid-actions";

type RowDraft=MarkGridRow & {
  draftMark:string;
  saveState:"idle"|"saving"|"saved"|"queued"|"error";
  error:string|null;
};

const initialActionState:MarkGridActionState={message:""};

const statusOptions=[
  {value:"numeric",label:"Mark"},
  {value:"absent",label:"Absent"},
  {value:"exempt",label:"Exempt"},
  {value:"incomplete",label:"Incomplete"},
  {value:"withheld",label:"Withheld"},
];

function markValue(row:RowDraft) {
  if (row.markStatus) return row.markStatus;
  return row.draftMark;
}

export function MarkGridWorkspace({data}:{data:MarkGridData}) {
  const [rows,setRows]=useState<RowDraft[]>(()=>data.rows.map((row)=>({
    ...row,
    draftMark:row.numericMark==null ? "" : String(row.numericMark),
    saveState:"idle",
    error:null,
  })));
  const [filter,setFilter]=useState<"all"|"missing"|"errors">("all");
  const [message,setMessage]=useState("");
  const [validateState,validateAction,validatePending]=useActionState(validateMarkGrid,initialActionState);
  const [submitState,submitAction,submitPending]=useActionState(submitMarkGrid,initialActionState);
  const [reviewState,reviewAction,reviewPending]=useActionState(reviewMarkGrid,initialActionState);
  const [reopenState,reopenAction,reopenPending]=useActionState(reopenMarkGridForCorrection,initialActionState);
  const inputRefs=useRef<Record<string,HTMLInputElement|null>>({});
  const scope={userId:data.userId,tenantId:data.tenantId,schoolId:data.schoolId};

  const visibleRows=useMemo(()=>rows.filter((row)=>{
    if (filter==="missing") return row.markStatus==null && row.draftMark.trim()==="";
    if (filter==="errors") return Boolean(row.error);
    return true;
  }),[rows,filter]);

  const summary=useMemo(()=>{
    const numeric=rows.map((row)=>Number(row.draftMark)).filter((value,index)=>rows[index].markStatus==null && Number.isFinite(value) && rows[index].draftMark!=="");
    return {
      captured:rows.filter((row)=>row.markStatus!=null || row.draftMark.trim()!=="").length,
      missing:rows.filter((row)=>row.markStatus==null && row.draftMark.trim()==="").length,
      average:numeric.length ? numeric.reduce((a,b)=>a+b,0)/numeric.length : null,
    };
  },[rows]);

  function patchRow(enrolmentId:string,patch:Partial<RowDraft>) {
    setRows((current)=>current.map((row)=>row.enrolmentId===enrolmentId ? {...row,...patch} : row));
  }

  async function persist(row:RowDraft, next:{draftMark?:string;markStatus?:RowDraft["markStatus"]}) {
    if (!data.editable) return;
    const draftMark=next.draftMark ?? row.draftMark;
    const markStatus=next.markStatus === undefined ? row.markStatus : next.markStatus;
    const numericMark=markStatus || draftMark.trim()==="" ? null : Number(draftMark);
    if (numericMark!=null && (!Number.isFinite(numericMark) || numericMark<0 || (data.rawMax!=null && numericMark>data.rawMax))) {
      patchRow(row.enrolmentId,{error:data.rawMax!=null ? `Enter a mark from 0 to ${data.rawMax}.` : "Enter a valid non-negative mark.",saveState:"error"});
      return;
    }

    const clientMutationId=crypto.randomUUID();
    patchRow(row.enrolmentId,{draftMark,markStatus,error:null,saveState:navigator.onLine ? "saving" : "queued"});
    const payload={
      assessmentInstanceId:data.instanceId,
      enrolmentId:row.enrolmentId,
      learnerId:row.learnerId,
      numericMark,
      markStatus,
      teacherNote:row.teacherNote,
      expectedVersion:row.version,
      clientMutationId,
    };

    if (!navigator.onLine) {
      await queueAssessmentMarkDraft(scope,payload);
      return;
    }

    try {
      const response=await fetch("/api/offline/assessment/marks",{
        method:"POST",
        credentials:"same-origin",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({scope,payload}),
      });
      const body=await response.json().catch(()=>({})) as {version?:string;code?:string;message?:string};
      if (!response.ok || !body.version) {
        const error=body.code==="stale_version"
          ? "A newer server mark exists. Reload before editing this learner."
          : body.code==="assessment_not_editable"
            ? "This assessment is no longer editable."
            : body.code==="learner_not_registered_for_subject"
              ? "Learner is not registered for this subject."
              : body.code==="mark_exceeds_maximum"
                ? `Mark exceeds the maximum of ${data.rawMax ?? "this assessment"}.`
                : "Mark could not be saved.";
        patchRow(row.enrolmentId,{saveState:"error",error});
        return;
      }
      patchRow(row.enrolmentId,{version:body.version,numericMark,markStatus,draftMark:numericMark==null?"":String(numericMark),saveState:"saved",error:null});
    } catch {
      await queueAssessmentMarkDraft(scope,payload);
      patchRow(row.enrolmentId,{saveState:"queued",error:null});
    }
  }

  function moveFocus(currentIndex:number,delta:number) {
    const target=visibleRows[currentIndex+delta];
    if (target) inputRefs.current[target.enrolmentId]?.focus();
  }

  async function handlePaste(startIndex:number,text:string) {
    const values=text.split(/\r?\n/).map((value)=>value.trim()).filter((value)=>value!=="");
    if (values.length<=1) return false;
    let applied=0;
    for (let offset=0;offset<values.length;offset++) {
      const row=visibleRows[startIndex+offset];
      if (!row) break;
      const value=Number(values[offset].split(/\t/)[0]);
      if (!Number.isFinite(value) || value<0 || (data.rawMax!=null && value>data.rawMax)) continue;
      patchRow(row.enrolmentId,{draftMark:String(value),markStatus:null});
      await persist(row,{draftMark:String(value),markStatus:null});
      applied++;
    }
    setMessage(applied ? `${applied} pasted mark${applied===1?"":"s"} saved or queued safely.` : "No valid marks were pasted.");
    return true;
  }

  async function syncNow() {
    setMessage("Syncing queued mark drafts…");
    const result=await syncQueuedAssessmentMarkDrafts(scope);
    setMessage(result.pending || result.syncing ? "Some mark drafts are still waiting to sync." : result.conflicted || result.rejected ? "Some queued marks need attention before they can sync." : "Queued mark drafts are synced.");
  }

  useEffect(()=>{
    void cacheAssessmentMarkDraftReference(scope,{assessmentInstanceId:data.instanceId,learners:data.rows});
  },[data.instanceId,data.rows,scope.schoolId,scope.tenantId,scope.userId]);

  return <div className="space-y-4">
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div><p className="text-xs text-muted-foreground">Subject</p><p className="mt-1 text-sm font-medium">{data.subject}</p></div>
        <div><p className="text-xs text-muted-foreground">Class</p><p className="mt-1 text-sm font-medium">{data.grade} · {data.className}</p></div>
        <div><p className="text-xs text-muted-foreground">Assessment</p><p className="mt-1 text-sm font-medium">{data.assessmentName}</p></div>
        <div><p className="text-xs text-muted-foreground">Maximum</p><p className="mt-1 text-sm font-medium">{data.rawMax ?? "Not configured"}</p></div>
        <div><p className="text-xs text-muted-foreground">State</p><p className="mt-1 text-sm font-medium capitalize">{data.status.replaceAll("_"," ")}</p></div>
      </div>
      {!data.editable ? <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-sm)] bg-surface-muted p-3 text-xs text-muted-foreground"><AlertTriangle className="mt-0.5 size-4 shrink-0"/>Marks are read-only while this assessment is in review, verified or locked state.</div> : null}
    </section>

    <section className="grid gap-3 sm:grid-cols-3">
      <article className="rounded-[var(--radius-sm)] bg-surface-muted p-4"><p className="text-xs text-muted-foreground">Captured</p><p className="mt-1 text-xl font-semibold">{summary.captured}/{rows.length}</p></article>
      <article className="rounded-[var(--radius-sm)] bg-surface-muted p-4"><p className="text-xs text-muted-foreground">Missing</p><p className="mt-1 text-xl font-semibold">{summary.missing}</p></article>
      <article className="rounded-[var(--radius-sm)] bg-surface-muted p-4"><p className="text-xs text-muted-foreground">Current average</p><p className="mt-1 text-xl font-semibold">{summary.average==null ? "—" : summary.average.toFixed(1)}</p><p className="mt-1 text-[0.68rem] text-muted-foreground">Read-only working calculation</p></article>
    </section>

    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="scolapro-section-title">Validate & submit</h2><p className="scolapro-section-description">Validation checks eligible learners without changing workflow state. Submission moves the assessment into governed review and stops ordinary mark editing.</p></div>
        <div className="flex flex-wrap gap-2">
          <form action={validateAction}><input type="hidden" name="instanceId" value={data.instanceId}/><Button type="submit" variant="neutral" loading={validatePending} disabled={!data.editable}>Validate</Button></form>
          <form action={submitAction}><input type="hidden" name="instanceId" value={data.instanceId}/><Button type="submit" loading={submitPending} disabled={!data.editable || summary.missing>0}>Submit for review</Button></form>
        </div>
      </div>
      {validateState.message ? <p className={`mt-3 text-xs ${validateState.success ? "text-success" : "text-muted-foreground"}`}>{validateState.message}</p> : null}
      {submitState.message ? <p className={`mt-2 text-xs ${submitState.success ? "text-success" : "text-danger"}`}>{submitState.message}</p> : null}
    </section>

    {data.status==="review" && data.canReview && data.latestSubmissionId ? <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <h2 className="scolapro-section-title">HOD / leadership review</h2>
      <p className="scolapro-section-description">Verify the submitted marks or return them with a reason. HOD authority is limited to the effective subject portfolio.</p>
      <form action={reviewAction} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <input type="hidden" name="instanceId" value={data.instanceId}/>
        <input type="hidden" name="submissionId" value={data.latestSubmissionId}/>
        <label className="text-xs font-medium">Review note<input name="note" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft" placeholder="Required when returning"/></label>
        <Button type="submit" name="decision" value="return" variant="neutral" loading={reviewPending}>Return</Button>
        <Button type="submit" name="decision" value="verify" loading={reviewPending}>Verify</Button>
      </form>
      {reviewState.message ? <p className={`mt-3 text-xs ${reviewState.success ? "text-success" : "text-danger"}`}>{reviewState.message}</p> : null}
    </section> : null}

    {["verified","locked"].includes(data.status) && data.canReopen ? <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <h2 className="scolapro-section-title">Governed correction</h2>
      <p className="scolapro-section-description">Reopening requires a reason and is blocked once immutable official results exist.</p>
      <form action={reopenAction} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <input type="hidden" name="instanceId" value={data.instanceId}/>
        <label className="text-xs font-medium">Correction reason<input name="reason" required className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft" placeholder="Why must these marks be corrected?"/></label>
        <Button type="submit" variant="neutral" loading={reopenPending}>Reopen for correction</Button>
      </form>
      {reopenState.message ? <p className={`mt-3 text-xs ${reopenState.success ? "text-success" : "text-danger"}`}>{reopenState.message}</p> : null}
    </section> : null}

    <section className="rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
      <div className="flex flex-col gap-3 border-b border-border-subtle p-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="scolapro-section-title">Mark grid</h2><p className="scolapro-section-description">Learner identity stays frozen while marks scroll. Use ↑/↓ or Enter to move between learners. Multi-line Excel paste is accepted only for valid numeric marks.</p></div>
        <div className="flex flex-wrap gap-2">
          <Picker ariaLabel="Filter mark rows" value={filter} onChange={(value)=>setFilter(value as typeof filter)} placeholder="Filter" options={[
            {value:"all",label:"All learners"},
            {value:"missing",label:"Missing only"},
            {value:"errors",label:"Errors only"},
          ]}/>
          <Button type="button" variant="neutral" onClick={()=>void syncNow()}><UploadCloud className="size-4"/>Sync drafts</Button>
        </div>
      </div>

      <div className="hidden overflow-auto md:block">
        <table className="min-w-[760px] w-full border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-surface-elevated">
            <tr className="border-b border-border-subtle text-left text-xs text-muted-foreground">
              <th className="sticky left-0 z-30 min-w-64 bg-surface-elevated px-4 py-3">Learner</th>
              <th className="w-40 px-3 py-3">Mark {data.rawMax!=null ? `/ ${data.rawMax}` : ""}</th>
              <th className="w-48 px-3 py-3">Status</th>
              <th className="w-32 px-3 py-3">Autosave</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row,index)=><tr key={row.enrolmentId} className="border-b border-border-subtle last:border-0">
              <td className="sticky left-0 z-10 bg-surface px-4 py-3"><p className="font-medium">{row.learnerName}</p><p className="mt-0.5 text-[0.68rem] text-muted-foreground">{row.admissionNumber ?? "No admission number"}</p></td>
              <td className="px-3 py-2">
                <input
                  ref={(node)=>{inputRefs.current[row.enrolmentId]=node;}}
                  aria-label={`Mark for ${row.learnerName}`}
                  inputMode="decimal"
                  disabled={!data.editable || Boolean(row.markStatus)}
                  value={row.draftMark}
                  onChange={(event)=>patchRow(row.enrolmentId,{draftMark:event.target.value,markStatus:null,saveState:"idle",error:null})}
                  onBlur={()=>void persist({...row,draftMark:rows.find((item)=>item.enrolmentId===row.enrolmentId)?.draftMark ?? row.draftMark},{})}
                  onKeyDown={(event)=>{
                    if (event.key==="ArrowDown" || event.key==="Enter") { event.preventDefault(); moveFocus(index,1); }
                    if (event.key==="ArrowUp") { event.preventDefault(); moveFocus(index,-1); }
                  }}
                  onPaste={(event)=>{const text=event.clipboardData.getData("text"); if (text.split(/\\r?\\n/).filter((value)=>value.trim()!=="").length>1) { event.preventDefault(); void handlePaste(index,text); }}}
                  className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft disabled:opacity-55"
                />
                {row.error ? <p className="mt-1 text-[0.68rem] text-danger">{row.error}</p> : null}
              </td>
              <td className="px-3 py-2"><Picker ariaLabel={`Status for ${row.learnerName}`} value={row.markStatus ?? "numeric"} onChange={(value)=>void persist(row,{draftMark:value==="numeric"?row.draftMark:"",markStatus:value==="numeric"?null:value as RowDraft["markStatus"]})} placeholder="Status" disabled={!data.editable} options={statusOptions}/></td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{row.saveState==="saving" ? "Saving…" : row.saveState==="queued" ? "Queued offline" : row.saveState==="saved" ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-3.5"/>Saved</span> : row.saveState==="error" ? "Needs attention" : "—"}</td>
            </tr>)}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border-subtle md:hidden">
        {visibleRows.map((row)=><article key={row.enrolmentId} className="p-4">
          <div><p className="text-sm font-semibold">{row.learnerName}</p><p className="text-xs text-muted-foreground">{row.admissionNumber ?? "No admission number"}</p></div>
          <div className="mt-3 grid gap-3">
            <label className="text-xs font-medium">Mark {data.rawMax!=null ? `/ ${data.rawMax}` : ""}<input inputMode="decimal" disabled={!data.editable || Boolean(row.markStatus)} value={row.draftMark} onChange={(event)=>patchRow(row.enrolmentId,{draftMark:event.target.value,markStatus:null,error:null,saveState:"idle"})} onBlur={()=>void persist({...row,draftMark:rows.find((item)=>item.enrolmentId===row.enrolmentId)?.draftMark ?? row.draftMark},{})} className="mt-1.5 min-h-11 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft disabled:opacity-55"/></label>
            <Picker label="Status" value={row.markStatus ?? "numeric"} onChange={(value)=>void persist(row,{draftMark:value==="numeric"?row.draftMark:"",markStatus:value==="numeric"?null:value as RowDraft["markStatus"]})} placeholder="Status" disabled={!data.editable} options={statusOptions}/>
            {row.error ? <p className="text-xs text-danger">{row.error}</p> : null}
          </div>
        </article>)}
      </div>

      {!visibleRows.length ? <div className="p-6 text-center text-sm text-muted-foreground"><Filter className="mx-auto mb-2 size-5"/>No learners match this filter.</div> : null}
    </section>

    {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    <div className="flex items-center gap-2 text-xs text-muted-foreground"><Save className="size-4"/>Draft marks append safely to the canonical mark history; review, verification and locking remain governed actions.</div>
  </div>;
}
