import { AlarmClock, CalendarDays } from "lucide-react";
import { getTimetableDayNames } from "@/features/timetable/day-labels";
import type { TodayTimetableContext } from "@/features/timetable/server/bell-calendar";

const impactLabels={NORMAL:"Normal teaching",NO_TEACHING:"No teaching",PARTIAL_DAY:"Partial day",ALTERED_TIMETABLE:"Altered timetable",EXAM_TIMETABLE:"Exam timetable"} as const;
export function TodayTimetableContextCard({ context, cycleMode, cycleLength }: { context:TodayTimetableContext; cycleMode:"weekday"|"rotating"; cycleLength:number }) {
  const names=getTimetableDayNames(cycleMode,cycleLength); const day=context.timetableDay?names[context.timetableDay-1]??`Day ${context.timetableDay}`:"No timetable day";
  return <section className="mb-5 rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 text-xs font-semibold text-brand-strong"><CalendarDays className="size-4"/>Today · {context.date}</div><h2 className="mt-1.5 text-base font-semibold">{impactLabels[context.teachingImpact]} · {day}</h2><p className="mt-1 text-xs text-muted-foreground">{context.bellScheduleName?`Effective bell schedule: ${context.bellScheduleName}`:"Using base teaching-period times."}</p></div><span className="scolapro-tone-sky grid size-10 place-items-center rounded-[var(--radius-sm)]"><AlarmClock className="size-4"/></span></div>
    {context.teachingImpact!=="NO_TEACHING"&&context.periods.length?<div className="mt-4 flex gap-2 overflow-x-auto pb-1">{context.periods.map(period=><div key={period.id} className="min-w-[8rem] rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2"><p className="text-[0.66rem] font-semibold text-muted-foreground">{period.number}. {period.name}</p><p className="mt-1 text-xs font-medium">{period.startsAt&&period.endsAt?`${period.startsAt.slice(0,5)}–${period.endsAt.slice(0,5)}`:"Anytime"}</p></div>)}</div>:null}
  </section>;
}
