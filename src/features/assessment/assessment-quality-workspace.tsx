"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, BarChart3, CheckCircle2, Minus } from "lucide-react";
import { Picker } from "@/components/ui/picker";
import type { AssessmentQualityWorkspace } from "@/features/assessment/server/quality-readiness";

const readinessOptions=[
  {value:"",label:"All readiness"},
  {value:"draft",label:"Draft / open"},
  {value:"submitted",label:"Submitted / review"},
  {value:"returned",label:"Returned"},
  {value:"verified",label:"Verified"},
  {value:"locked",label:"Locked"},
];

function metric(value:number|null,suffix="") {
  return value===null ? "—" : `${value}${suffix}`;
}

export function AssessmentQualityWorkspaceView({ workspace }: { workspace: AssessmentQualityWorkspace }) {
  const router=useRouter();
  const search=useSearchParams();

  function setFilter(key:string,value:string) {
    const params=new URLSearchParams(search.toString());
    if (value) params.set(key,value); else params.delete(key);
    router.push(`/assessment/quality?${params.toString()}`);
  }

  const readiness=workspace.summary.readiness;
  const hasDetailed=workspace.summary.detailedInstances>0;

  return <div className="space-y-5">
    <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><span className="scolapro-tone-brand grid size-8 place-items-center rounded-[var(--radius-sm)]"><BarChart3 className="size-4"/></span><div><h2 className="scolapro-section-title">Assessment quality & readiness</h2><p className="scolapro-section-description !mt-0">{workspace.scopeLabel} · {workspace.academicYear}{workspace.termNumber ? ` · Term ${workspace.termNumber}` : ""}</p></div></div>
          <p className="mt-3 max-w-3xl text-xs leading-5 text-muted-foreground">Descriptive review indicators from canonical assessment evidence. They support completion and moderation review; they do not score, rank or accuse teachers.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[30rem]">
          {[
            ["Instances",workspace.summary.instances],
            ["Completion",workspace.summary.completionPercent===null ? "—" : `${workspace.summary.completionPercent}%`],
            ["Required missing",workspace.summary.missingRequiredRecords],
            ["Final-result only",workspace.summary.finalResultOnlyInstances],
          ].map(([label,value])=><div key={String(label)} className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2.5 text-center"><p className="text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-base font-semibold">{value}</p></div>)}
        </div>
      </div>
    </section>

    <section className="grid gap-3 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:grid-cols-2 lg:grid-cols-5">
      <Picker label="Subject" placeholder="All subjects" value={search.get("subject") ?? ""} onChange={(value)=>setFilter("subject",value)} options={[{value:"",label:"All subjects"},...workspace.options.subjects]} searchable/>
      <Picker label="Class" placeholder="All classes" value={search.get("class") ?? ""} onChange={(value)=>setFilter("class",value)} options={[{value:"",label:"All classes"},...workspace.options.classes]} searchable/>
      <Picker label="Teacher" placeholder="All teachers" value={search.get("teacher") ?? ""} onChange={(value)=>setFilter("teacher",value)} options={[{value:"",label:"All teachers"},...workspace.options.teachers]} searchable/>
      <Picker label="Readiness" placeholder="All readiness" value={search.get("readiness") ?? ""} onChange={(value)=>setFilter("readiness",value)} options={readinessOptions}/>
      <Picker label="Term" placeholder="All terms" value={search.get("term") ?? ""} onChange={(value)=>setFilter("term",value)} options={[{value:"",label:"All terms"},{value:"1",label:"Term 1"},{value:"2",label:"Term 2"},{value:"3",label:"Term 3"}]}/>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {[
        ["Draft",readiness.draft ?? 0],
        ["Submitted",readiness.submitted ?? 0],
        ["Returned",readiness.returned ?? 0],
        ["Verified",readiness.verified ?? 0],
        ["Locked",readiness.locked ?? 0],
      ].map(([label,value])=><article key={String(label)} className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></article>)}
    </section>

    {!hasDetailed && workspace.summary.finalResultOnlyInstances>0 ? <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-5"><div className="flex items-start gap-3"><Minus className="mt-0.5 size-5 text-muted-foreground"/><div><h2 className="scolapro-section-title">Component analysis not applicable</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">The selected scope uses final-result-only assessment schemes. Completion and moderation readiness remain visible, but ScolaPro does not invent component statistics where the effective scheme has no detailed components.</p></div></div></section> : null}

    {workspace.gaps.length ? <section className="space-y-3">
      <div><h2 className="scolapro-section-title">CA vs examination</h2><p className="scolapro-section-description">Descriptive percentage-point gaps only where the effective detailed scheme has numeric evidence in both CA and examination components.</p></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{workspace.gaps.map((gap)=><article key={gap.key} className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">{gap.subjectName}</h3><p className="mt-0.5 text-xs text-muted-foreground">{gap.className}{gap.teacherName ? ` · ${gap.teacherName}` : ""}</p></div><span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-xs font-semibold">{gap.examMinusCa>0?"+":""}{gap.examMinusCa} pp</span></div><dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-xs text-muted-foreground">CA average</dt><dd className="mt-0.5 font-semibold">{gap.caAverage}%</dd></div><div><dt className="text-xs text-muted-foreground">Exam average</dt><dd className="mt-0.5 font-semibold">{gap.examAverage}%</dd></div></dl></article>)}</div>
    </section> : null}

    {workspace.rows.length ? <section className="space-y-3">
      <div><h2 className="scolapro-section-title">Component review indicators</h2><p className="scolapro-section-description">Average, median, high, low, completion and missing required records are calculated from current mark revisions only.</p></div>
      <div className="grid gap-3 lg:grid-cols-2">{workspace.rows.map((row)=><article key={row.assessmentInstanceId} className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold">{row.subjectName} · {row.className}</h3><p className="mt-0.5 text-xs text-muted-foreground">{row.componentName ?? "Final result"}{row.teacherName ? ` · ${row.teacherName}` : ""}</p></div><span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.66rem] font-semibold capitalize">{row.readinessStatus}</span></div>
        {row.analysisStatus==="final_result_only" ? <div className="mt-3 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-3 text-xs leading-5 text-muted-foreground">Final-result-only scheme — component average/median/high/low is intentionally not calculated.</div> : <>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">{[
            ["Average",metric(row.averagePercent,"%")],
            ["Median",metric(row.medianPercent,"%")],
            ["High",metric(row.highPercent,"%")],
            ["Low",metric(row.lowPercent,"%")],
            ["Complete",metric(row.completionPercent,"%")],
            ["Missing",row.missingRequiredRecords],
          ].map(([label,value])=><div key={String(label)} className="rounded-[var(--radius-sm)] bg-surface-muted px-2 py-2 text-center"><p className="text-[0.58rem] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold">{value}</p></div>)}</div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.68rem] text-muted-foreground"><span>Captured <strong className="text-foreground">{row.capturedRecords}/{row.expectedLearners}</strong></span><span>Numeric <strong className="text-foreground">{row.numericRecords}</strong></span><span>Status records <strong className="text-foreground">{row.statusRecords}</strong></span>{row.moderationRequired ? <span className="inline-flex items-center gap-1 text-warning"><AlertTriangle className="size-3"/>Moderation required</span> : <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-3"/>Standard review</span>}</div>
        </>}
      </article>)}</div>
    </section> : <section className="rounded-[var(--radius-md)] border border-dashed border-border p-6 text-center"><h2 className="scolapro-section-title">No assessment evidence in this scope</h2><p className="mt-1 text-sm text-muted-foreground">Quality/readiness appears when governed assessment instances exist for the selected year, term and access scope.</p></section>}
  </div>;
}
