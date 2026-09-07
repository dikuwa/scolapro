"use client";

import { useActionState, useEffect, useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { toast } from "sonner";
import { DateField } from "@/components/ui/date-field";
import { Picker, TimePicker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { saveBellPeriod, saveBellSchedule, type BellActionState } from "@/features/timetable/server/bell-actions";
import type { BellScheduleSummary } from "@/features/timetable/server/bell-calendar";
import type { TimetableWorkspace } from "@/features/timetable/server/workspace";

const initialState: BellActionState = {};
const weekdays = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

export function BellScheduleManager({ schoolId, academicYear, schedules, periods }: { schoolId:string; academicYear:number; schedules:BellScheduleSummary[]; periods:TimetableWorkspace["periods"] }) {
  const [scheduleState,scheduleAction,schedulePending] = useActionState(saveBellSchedule,initialState);
  const [periodState,periodAction,periodPending] = useActionState(saveBellPeriod,initialState);
  const [from,setFrom] = useState(`${academicYear}-01-01`); const [to,setTo] = useState("");
  const [scheduleId,setScheduleId] = useState(""); const [periodId,setPeriodId] = useState("");
  const [start,setStart] = useState(""); const [end,setEnd] = useState("");
  useEffect(()=>{ if(scheduleState.message) (scheduleState.success?toast.success:toast.error)(scheduleState.message); },[scheduleState]);
  useEffect(()=>{ if(periodState.message) (periodState.success?toast.success:toast.error)(periodState.message); },[periodState]);
  const fieldClass="min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";
  return <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
    <div className="flex items-start gap-2.5 border-b border-border-subtle pb-4"><span className="scolapro-tone-sky grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"><CalendarClock className="size-4" /></span><div><h2 className="scolapro-section-title">Bell schedules</h2><p className="scolapro-section-description !mt-0">Add effective-dated schedules for seasonal or weekday-specific timing. No summer or winter pattern is assumed for a school.</p></div></div>
    <form action={scheduleAction} className="mt-4 grid gap-3 md:grid-cols-2 md:items-end">
      <input type="hidden" name="schoolId" value={schoolId}/><input type="hidden" name="academicYear" value={academicYear}/>
      <div><label htmlFor="bell-name" className="text-xs font-medium">Schedule name</label><input id="bell-name" name="name" placeholder="Term 2 early close" className={`${fieldClass} mt-1.5`}/></div>
      <div className="grid grid-cols-2 gap-3"><DateField label="Effective from" name="effectiveFrom" value={from} onChange={setFrom} required/><DateField label="Effective to" name="effectiveTo" value={to} onChange={setTo} min={from||undefined}/></div>
      <fieldset className="md:col-span-2"><legend className="text-xs font-medium">Applies on</legend><div className="mt-1.5 flex flex-wrap gap-2">{weekdays.map((label,index)=><label key={label} className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs transition hover:border-border"><input type="checkbox" name="weekday" value={index+1} defaultChecked={index<5} className="accent-[color:var(--brand)]"/>{label}</label>)}</div></fieldset>
      <button type="submit" disabled={schedulePending} className="scolapro-cta inline-flex min-h-9 w-fit items-center gap-2 bg-brand px-3 text-xs font-medium text-white hover:bg-brand-strong disabled:opacity-60">{schedulePending?<Spinner className="size-3.5 text-white"/>:<Plus className="size-3.5"/>}{schedulePending?"Saving…":"Add bell schedule"}</button>
    </form>
    {schedules.length ? <form action={periodAction} className="mt-5 grid gap-3 border-t border-border-subtle pt-4 md:grid-cols-2 md:items-end">
      <Picker label="Bell schedule" name="scheduleId" value={scheduleId} onChange={setScheduleId} placeholder="Choose schedule" options={schedules.map(item=>({value:item.id,label:item.name,helper:`${item.effectiveFrom}${item.effectiveTo?` – ${item.effectiveTo}`:" onward"}`}))}/>
      <Picker label="Teaching period" name="periodId" value={periodId} onChange={setPeriodId} placeholder="Choose period" options={periods.map(item=>({value:item.id,label:`${item.number}. ${item.name}`,helper:item.startsAt&&item.endsAt?`${item.startsAt.slice(0,5)}–${item.endsAt.slice(0,5)}`:"Anytime"}))}/>
      <TimePicker label="Starts" name="startsAt" value={start} onChange={setStart}/><TimePicker label="Ends" name="endsAt" value={end} onChange={setEnd}/>
      <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2.5"><p className="text-[0.68rem] text-muted-foreground">Leave both times empty for <span className="font-semibold text-foreground">Anytime</span>. The base period remains linked to every timetable slot.</p><button type="submit" disabled={!scheduleId||!periodId||periodPending} className="scolapro-cta inline-flex min-h-9 items-center gap-2 bg-brand px-3 text-xs font-medium text-white disabled:opacity-50">{periodPending?<Spinner className="size-3.5 text-white"/>:null}{periodPending?"Saving…":"Save bell time"}</button></div>
    </form>:<p className="mt-4 text-xs text-muted-foreground">Create a bell schedule before assigning date-specific period times.</p>}
  </section>;
}
