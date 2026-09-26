"use client";

import { useActionState, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import {
  submitPreparationBatch,
  type LessonPreparationActionState,
  type LessonPreparationWorkspaceData,
} from "./server/lesson-preparation";

const initialState:LessonPreparationActionState={message:""};

function monday(value:string) {
  const date=new Date(`${value}T12:00:00`);
  const day=date.getDay() || 7;
  date.setDate(date.getDate()-day+1);
  return date.toISOString().slice(0,10);
}
function addDays(value:string,days:number) {
  const date=new Date(`${value}T12:00:00`);
  date.setDate(date.getDate()+days);
  return date.toISOString().slice(0,10);
}

const cadenceLabel:Record<LessonPreparationWorkspaceData["reviewCadence"],string>={
  weekly:"Weekly",
  fortnightly:"Fortnightly",
  selected:"Selected preparations",
  term_batch:"Term batch",
};

export function PreparationBatchSubmission({data}:{data:LessonPreparationWorkspaceData}) {
  const firstPrepared=data.rows.find((row)=>row.preparationId && ["prepared","returned"].includes(row.preparationStatus ?? ""));
  const [mode,setMode]=useState<"selected"|"week"|"fortnight"|"term">(
    data.reviewCadence==="weekly" ? "week" :
    data.reviewCadence==="fortnightly" ? "fortnight" :
    data.reviewCadence==="term_batch" ? "term" : "selected",
  );
  const [anchor,setAnchor]=useState(firstPrepared?.plannedOn ?? new Date().toISOString().slice(0,10));
  const [termId,setTermId]=useState(data.terms[0]?.id ?? "");
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [state,action,pending]=useActionState(submitPreparationBatch,initialState);

  const candidates=useMemo(()=>data.rows.filter((row)=>
    row.preparationId && ["prepared","returned"].includes(row.preparationStatus ?? "")
  ),[data.rows]);

  const weekStart=monday(anchor);
  const weekEnd=addDays(weekStart,6);
  const fortnightEnd=addDays(weekStart,13);
  const selectedTerm=data.terms.find((term)=>term.id===termId) ?? null;

  const included=useMemo(()=>{
    if (mode==="selected") return candidates.filter((row)=>row.preparationId && selectedIds.includes(row.preparationId));
    if (mode==="week") return candidates.filter((row)=>row.plannedOn>=weekStart && row.plannedOn<=weekEnd);
    if (mode==="fortnight") return candidates.filter((row)=>row.plannedOn>=weekStart && row.plannedOn<=fortnightEnd);
    if (!selectedTerm?.startsOn || !selectedTerm.endsOn) return [];
    return candidates.filter((row)=>row.plannedOn>=selectedTerm.startsOn! && row.plannedOn<=selectedTerm.endsOn!);
  },[candidates,fortnightEnd,mode,selectedIds,selectedTerm,weekEnd,weekStart]);

  return <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="scolapro-section-title">Submit preparation batch</h2>
        <p className="scolapro-section-description">School review cadence: {cadenceLabel[data.reviewCadence]}. Submission groups existing prepared lessons; it does not copy or rewrite lesson content.</p>
      </div>
      <span className="rounded-[var(--radius-xs)] bg-brand-soft px-2 py-1 text-[0.64rem] font-semibold uppercase tracking-wide text-brand-strong">{included.length} selected</span>
    </div>

    <form action={action} className="mt-4 space-y-4">
      <Picker
        label="Submission scope"
        value={mode}
        onChange={(value)=>setMode(value as typeof mode)}
        options={[
          {value:"selected",label:"Selected preparations"},
          {value:"week",label:"Week batch"},
          {value:"fortnight",label:"Fortnight batch"},
          {value:"term",label:"Term batch"},
        ]}
        placeholder="Choose submission scope"
      />

      {mode==="week" || mode==="fortnight" ? <div className="grid gap-3 sm:grid-cols-2">
        <DateField label={mode==="week" ? "Week containing" : "Fortnight starting week"} name="anchorDate" value={anchor} onChange={setAnchor}/>
        <div className="rounded-[var(--radius-sm)] bg-surface-muted p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Submission range</p>
          <p className="mt-1">{weekStart} → {mode==="week" ? weekEnd : fortnightEnd}</p>
        </div>
      </div> : null}

      {mode==="term" ? <Picker
        label="Term"
        value={termId}
        onChange={setTermId}
        options={data.terms.map((term)=>({value:term.id,label:term.name,helper:term.startsOn && term.endsOn ? `${term.startsOn} → ${term.endsOn}` : "Dates not configured"}))}
        placeholder="Choose term"
      /> : null}

      {mode==="selected" ? <div className="rounded-[var(--radius-sm)] border border-border-subtle p-3">
        <p className="text-xs font-medium">Prepared lessons</p>
        {candidates.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {candidates.map((row)=><CheckboxField
            key={row.preparationId}
            label={`${row.plannedOn} · ${row.subject} · ${row.className}`}
            checked={Boolean(row.preparationId && selectedIds.includes(row.preparationId))}
            onChange={(event)=>row.preparationId && setSelectedIds((current)=>event.currentTarget.checked ? [...new Set([...current,row.preparationId!])] : current.filter((id)=>id!==row.preparationId))}
          />)}
        </div> : <p className="mt-2 text-xs text-muted-foreground">No prepared or returned lessons are currently available.</p>}
      </div> : null}

      {included.map((row)=><input key={row.preparationId} type="hidden" name="preparationId" value={row.preparationId ?? ""}/>)}
      <input type="hidden" name="scopeMode" value={mode}/>
      <input type="hidden" name="weekStart" value={mode==="week" || mode==="fortnight" ? weekStart : ""}/>
      <input type="hidden" name="weekEnd" value={mode==="week" ? weekEnd : mode==="fortnight" ? fortnightEnd : ""}/>
      <input type="hidden" name="termLabel" value={mode==="term" ? selectedTerm?.name ?? "" : ""}/>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">{included.length ? `${included.length} preparation${included.length===1?"":"s"} will enter the governed HOD review queue.` : "No submittable preparations fall inside this scope."}</p>
        <Button type="submit" loading={pending} disabled={!included.length}><Send className="size-4"/>Submit batch</Button>
      </div>
      {state.message ? <p className={`text-xs ${state.success ? "text-success" : "text-danger"}`}>{state.message}</p> : null}
    </form>
  </section>;
}
