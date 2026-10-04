"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Picker } from "@/components/ui/picker";
import type { AcademicScheduleBasis, AcademicScheduleFilterOptions } from "@/features/reporting/server/academic-schedules";

export type OfficialScheduleDocument = "promotion" | "all_results";

export function AcademicScheduleFilters({ document, academicYear, period, basis, grade, classNames, options }: {
  document: OfficialScheduleDocument;
  academicYear: number;
  period: string;
  basis: AcademicScheduleBasis;
  grade: string;
  classNames: string[];
  options: AcademicScheduleFilterOptions;
}) {
  const [documentValue,setDocumentValue]=useState(document);
  const [periodValue,setPeriodValue]=useState(period);
  const [basisValue,setBasisValue]=useState(basis);
  const [gradeValue,setGradeValue]=useState(grade);
  const [selectedClasses,setSelectedClasses]=useState(classNames);
  const availableClasses=useMemo(()=>options.classesByGrade[gradeValue]??[],[gradeValue,options.classesByGrade]);
  const toggleClass=(className:string)=>setSelectedClasses((current)=>current.includes(className)?current.filter((value)=>value!==className):[...current,className]);
  return (
    <section className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)]" aria-labelledby="schedule-filters-title">
      <div className="mb-3"><h2 id="schedule-filters-title" className="scolapro-section-title">Document scope</h2><p className="scolapro-section-description">Official is the default. Each period, grade and selected-class scope keeps a distinct issued history.</p></div>
      <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Picker label="Document" name="document" value={documentValue} placeholder="Choose document" onChange={(value)=>{setDocumentValue(value as OfficialScheduleDocument);if(value==="all_results"&&periodValue==="all")setPeriodValue(String(options.terms.at(-1)?.number??1));}} options={[{value:"promotion",label:"Promotion Schedule"},{value:"all_results",label:"All Results Schedule"}]} />
        <label className="text-xs font-medium">Year<input name="year" type="number" min="2000" max="2200" defaultValue={academicYear} className="scolapro-control-surface mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] px-3 text-sm"/></label>
        <Picker label="Period" name="period" value={periodValue} placeholder="Choose period" onChange={setPeriodValue} options={[...options.terms.map((term)=>({value:String(term.number),label:term.label})),...(documentValue==="promotion"?[{value:"all",label:"All Terms"}]:[])]} />
        <Picker label="Grade" name="grade" value={gradeValue||"all"} placeholder="Choose grade" onChange={(value)=>{setGradeValue(value==="all"?"":value);setSelectedClasses([]);}} options={[{value:"all",label:"All grades"},...options.grades.map((value)=>({value,label:value}))]} />
        <Picker label="Result state" name="basis" value={basisValue} placeholder="Choose result state" onChange={(value)=>setBasisValue(value as AcademicScheduleBasis)} options={[{value:"official",label:"Official"},{value:"provisional",label:"Provisional preview"}]} />
        <fieldset className="sm:col-span-2 lg:col-span-5" disabled={!gradeValue||!availableClasses.length}>
          <legend className="text-xs font-medium">Class scope</legend>
          <input type="hidden" name="classes" value={selectedClasses.join(",")} />
          <div className="mt-1.5 flex min-h-10 flex-wrap items-center gap-1.5">
            <button type="button" aria-pressed={!selectedClasses.length} onClick={()=>setSelectedClasses([])} className={`inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] border px-3 text-xs font-medium ${!selectedClasses.length?"border-brand/30 bg-brand-soft text-brand-strong":"border-border-subtle"}`}><Check className={`size-3.5 ${!selectedClasses.length?"opacity-100":"opacity-0"}`}/>All classes in grade</button>
            {availableClasses.map((className)=>{const selected=selectedClasses.includes(className);return <button key={className} type="button" aria-pressed={selected} onClick={()=>toggleClass(className)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] border px-3 text-xs font-medium ${selected?"border-brand/30 bg-brand-soft text-brand-strong":"border-border-subtle"}`}><Check className={`size-3.5 ${selected?"opacity-100":"opacity-0"}`}/>{className}</button>;})}
          </div>
        </fieldset>
        <button className="min-h-10 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-white sm:col-span-2 lg:col-span-5">Refresh preview</button>
      </form>
    </section>
  );
}
