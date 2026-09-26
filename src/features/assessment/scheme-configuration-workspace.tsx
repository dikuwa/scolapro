"use client";

import { useActionState, useMemo, useState } from "react";
import { BadgeCheck, BookOpenCheck, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Picker } from "@/components/ui/picker";
import {
  createManualAssessmentSchemeCandidate,
  extractAssessmentSchemeCandidate,
  publishAssessmentSchemeCandidate,
  verifyAssessmentSchemeCandidate,
  type AssessmentSchemeActionState,
  type AssessmentSchemeWorkspaceData,
} from "./server/scheme-configuration";

const initialState: AssessmentSchemeActionState={message:""};
const fieldClass="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-2 text-sm text-foreground outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft";

type ComponentDraft={
  id:string;
  code:string;
  name:string;
  type:string;
  rawMax:string;
  weight:string;
  required:boolean;
  termNumbers:number[];
  moderationRequired:boolean;
};

const newComponent=():ComponentDraft=>({
  id:crypto.randomUUID(),
  code:"",
  name:"",
  type:"test",
  rawMax:"",
  weight:"",
  required:true,
  termNumbers:[1,2,3],
  moderationRequired:false,
});

function Message({state}:{state:AssessmentSchemeActionState}) {
  return state.message ? <p className={`mt-2 text-xs ${state.success ? "text-success" : "text-danger"}`}>{state.message}</p> : null;
}

export function AssessmentSchemeConfigurationWorkspace({data}:{data:AssessmentSchemeWorkspaceData}) {
  const first=data.offerings[0];
  const [offeringId,setOfferingId]=useState(first?.id ?? "");
  const [captureMode,setCaptureMode]=useState("detailed");
  const [terms,setTerms]=useState<number[]>([1,2,3]);
  const [components,setComponents]=useState<ComponentDraft[]>([newComponent()]);
  const [extractState,extractAction,extractPending]=useActionState(extractAssessmentSchemeCandidate,initialState);
  const [manualState,manualAction,manualPending]=useActionState(createManualAssessmentSchemeCandidate,initialState);
  const [verifyState,verifyAction,verifyPending]=useActionState(verifyAssessmentSchemeCandidate,initialState);
  const [publishState,publishAction,publishPending]=useActionState(publishAssessmentSchemeCandidate,initialState);

  const selected=data.offerings.find((item)=>item.id===offeringId) ?? first;
  const candidates=useMemo(()=>data.candidates.filter((item)=>item.offeringId===offeringId),[data.candidates,offeringId]);
  const active=data.activeSchemes.find((item)=>item.offeringId===offeringId);

  function toggleTerm(term:number) {
    setTerms((current)=>current.includes(term) ? current.filter((value)=>value!==term) : [...current,term].sort());
  }
  function updateComponent(id:string,patch:Partial<ComponentDraft>) {
    setComponents((current)=>current.map((item)=>item.id===id ? {...item,...patch} : item));
  }
  function serializedComponents() {
    if (captureMode==="final_result") return [];
    return components.map((item,index)=>({
      code:item.code.trim() || `component_${index+1}`,
      name:item.name.trim() || `Component ${index+1}`,
      type:item.type,
      rawMax:item.rawMax ? Number(item.rawMax) : null,
      weight:item.weight ? Number(item.weight) : null,
      required:item.required,
      termNumbers:item.termNumbers,
      moderationRequired:item.moderationRequired,
      calculationMethod:"weighted",
    }));
  }

  if (!data.offerings.length) return <section className="rounded-[var(--radius-md)] bg-surface-muted p-6 text-sm text-muted-foreground">No current-year subject offerings are available for assessment scheme configuration.</section>;

  return <div className="space-y-5">
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <h2 className="scolapro-section-title">Subject, grade & curriculum version</h2>
      <p className="scolapro-section-description">Assessment configuration is bound to the authoritative subject offering and curriculum version. Grade level alone never decides whether a subject is exam-only.</p>
      <div className="mt-4 max-w-2xl">
        <Picker
          label="Subject offering"
          value={offeringId}
          onChange={setOfferingId}
          placeholder="Choose subject and grade"
          searchable
          options={data.offerings.map((item)=>({value:item.id,label:`${item.subject} · ${item.grade}`,helper:item.curriculumVersion ? `Curriculum ${item.curriculumVersion}` : "Curriculum version not linked"}))}
        />
      </div>
      <div className="mt-4 grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted p-4 sm:grid-cols-3">
        <div><p className="text-xs text-muted-foreground">Subject</p><p className="mt-1 text-sm font-medium">{selected?.subject}</p></div>
        <div><p className="text-xs text-muted-foreground">Grade</p><p className="mt-1 text-sm font-medium">{selected?.grade}</p></div>
        <div><p className="text-xs text-muted-foreground">Curriculum version</p><p className="mt-1 text-sm font-medium">{selected?.curriculumVersion ?? "Not linked"}</p></div>
      </div>
      {active ? <p className="mt-3 text-xs text-muted-foreground">Active scheme: <strong>{active.schemeKey} · {active.version}</strong> · Terms {active.termNumbers.join(", ")}</p> : <p className="mt-3 text-xs text-muted-foreground">No active scheme is published for this offering yet.</p>}
    </section>

    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-start gap-3"><BookOpenCheck className="mt-0.5 size-5 text-brand"/><div><h2 className="scolapro-section-title">Extract from verified syllabus metadata</h2><p className="scolapro-section-description">Extraction creates a candidate only. It cannot publish official assessment configuration without human verification.</p></div></div>
      <form action={extractAction} className="mt-4">
        <input type="hidden" name="offeringId" value={offeringId}/>
        <Button type="submit" loading={extractPending} disabled={!selected?.curriculumVersionId}>Extract candidate</Button>
      </form>
      <Message state={extractState}/>
    </section>

    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <h2 className="scolapro-section-title">Manual candidate</h2>
      <p className="scolapro-section-description">Use this when the verified curriculum source has no structured machine-readable assessment configuration. The candidate still requires separate verification and publication.</p>
      <form action={manualAction} className="mt-4 space-y-4">
        <input type="hidden" name="offeringId" value={offeringId}/>
        <input type="hidden" name="termNumbers" value={terms.join(",")}/>
        <input type="hidden" name="components" value={JSON.stringify(serializedComponents())}/>
        <div className="grid gap-4 md:grid-cols-2">
          <Picker label="Capture mode" name="captureMode" value={captureMode} onChange={setCaptureMode} placeholder="Capture mode" options={[
            {value:"detailed",label:"Detailed assessment components",helper:"Tasks, tests, practicals, projects, examinations or other configured components"},
            {value:"final_result",label:"Final-result capture",helper:"Use only where the verified scheme permits direct final-result capture"},
          ]}/>
          <div><p className="text-xs font-medium">Applicable terms</p><div className="mt-2 flex flex-wrap gap-2">{[1,2,3].map((term)=><CheckboxField key={term} name={`term-${term}`} label={`Term ${term}`} checked={terms.includes(term)} onChange={()=>toggleTerm(term)}/>)}</div></div>
        </div>

        {captureMode==="detailed" ? <div className="space-y-3">
          {components.map((component,index)=><article key={component.id} className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted p-4">
            <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">Component {index+1}</p><Button type="button" size="sm" variant="ghost" onClick={()=>setComponents((current)=>current.filter((item)=>item.id!==component.id))} disabled={components.length===1}><Trash2 className="size-4"/>Remove</Button></div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-medium">Name<input className={fieldClass} value={component.name} onChange={(event)=>updateComponent(component.id,{name:event.target.value})}/></label>
              <Picker label="Type" value={component.type} onChange={(value)=>updateComponent(component.id,{type:value})} placeholder="Type" options={[
                "task","test","practical","project","oral","exam_paper","exam_total","final_result","other",
              ].map((value)=>({value,label:value.replaceAll("_"," ")}))}/>
              <label className="text-xs font-medium">Raw maximum<input className={fieldClass} inputMode="decimal" value={component.rawMax} onChange={(event)=>updateComponent(component.id,{rawMax:event.target.value})}/></label>
              <label className="text-xs font-medium">Weight<input className={fieldClass} inputMode="decimal" value={component.weight} onChange={(event)=>updateComponent(component.id,{weight:event.target.value})}/></label>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <CheckboxField name={`required-${component.id}`} label="Required" checked={component.required} onChange={(event)=>updateComponent(component.id,{required:event.target.checked})}/>
              <CheckboxField name={`moderation-${component.id}`} label="Moderation required" checked={component.moderationRequired} onChange={(event)=>updateComponent(component.id,{moderationRequired:event.target.checked})}/>
              {[1,2,3].map((term)=><CheckboxField key={term} name={`component-${component.id}-term-${term}`} label={`Term ${term}`} checked={component.termNumbers.includes(term)} onChange={()=>updateComponent(component.id,{termNumbers:component.termNumbers.includes(term) ? component.termNumbers.filter((value)=>value!==term) : [...component.termNumbers,term].sort()})}/>)}
            </div>
          </article>)}
          <Button type="button" variant="neutral" onClick={()=>setComponents((current)=>[...current,newComponent()])}><Plus className="size-4"/>Add component</Button>
        </div> : null}

        <div className="flex justify-end"><Button type="submit" loading={manualPending}>Save candidate</Button></div>
      </form>
      <Message state={manualState}/>
    </section>

    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <h2 className="scolapro-section-title">Verification & publication</h2>
      <p className="scolapro-section-description">Verification records human accountability. Publication is a separate finality action and creates a versioned canonical assessment scheme.</p>
      <div className="mt-4 space-y-3">
        {candidates.length ? candidates.map((candidate)=><article key={candidate.id} className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="text-sm font-semibold">{candidate.sourceLabel}</p><p className="mt-1 text-xs text-muted-foreground">{candidate.captureMode.replaceAll("_"," ")} · Terms {candidate.termNumbers.join(", ")} · {candidate.components.length} component{candidate.components.length===1?"":"s"}</p></div>
            <span className="self-start rounded-full bg-surface px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">{candidate.status}</span>
          </div>
          {candidate.components.length ? <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr className="text-muted-foreground"><th className="px-2 py-1.5">Component</th><th className="px-2 py-1.5">Max</th><th className="px-2 py-1.5">Weight</th><th className="px-2 py-1.5">Terms</th><th className="px-2 py-1.5">Moderation</th></tr></thead><tbody>{candidate.components.map((component,index)=><tr key={`${component.code}-${index}`} className="border-t border-border-subtle"><td className="px-2 py-2 font-medium">{component.name}</td><td className="px-2 py-2">{component.rawMax ?? "—"}</td><td className="px-2 py-2">{component.weight ?? "—"}</td><td className="px-2 py-2">{component.termNumbers.join(", ")}</td><td className="px-2 py-2">{component.moderationRequired ? "Required" : "No"}</td></tr>)}</tbody></table></div> : null}
          {candidate.status==="candidate" ? <form action={verifyAction} className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><input type="hidden" name="candidateId" value={candidate.id}/><label className="text-xs font-medium">Verification note<input className={fieldClass} name="note" placeholder="Optional verification note"/></label><Button type="submit" variant="soft" loading={verifyPending}><BadgeCheck className="size-4"/>Verify candidate</Button></form> : null}
          {candidate.status==="verified" ? <form action={publishAction} className="mt-3 flex justify-end"><input type="hidden" name="candidateId" value={candidate.id}/><Button type="submit" loading={publishPending}><Send className="size-4"/>Publish verified scheme</Button></form> : null}
        </article>) : <p className="text-sm text-muted-foreground">No candidates exist for this subject offering yet.</p>}
      </div>
      <Message state={verifyState}/><Message state={publishState}/>
    </section>
  </div>;
}
