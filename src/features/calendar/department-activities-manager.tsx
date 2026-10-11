"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { formFieldControlOffsetClass, formFieldLabelClass } from "@/components/ui/form-field-layout";
import { Picker } from "@/components/ui/picker";
import { RecordActionButton } from "@/components/ui/record-action-button";
import {
  cancelOperationalCalendarEvent,
  reviseOperationalCalendarEvent,
  saveOperationalCalendarEvent,
  type TeachingImpactActionState,
} from "@/features/calendar/server/actions";
import type { DepartmentCalendarOption, OperationalCalendarEvent, TermCalendarSummary } from "@/features/calendar/server/operational-calendar";

const initialState: TeachingImpactActionState = {};
const eventKinds = ["event","deadline","meeting","class_visit","assessment","submission","examination","teaching_cutoff","ceremony","sport","other"].map((value) => ({ value, label: value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()) }));
const inputClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)] motion-reduce:transition-none";
const dateFormatter = new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" });

function termLabel(event: OperationalCalendarEvent, terms: TermCalendarSummary[]) {
  const matches = terms.filter((term) => term.learnerStartsOn && term.learnerEndsOn && event.endsOn >= term.learnerStartsOn && event.startsOn <= term.learnerEndsOn).sort((a,b)=>a.termNumber-b.termNumber);
  if (!matches.length) return "Outside configured terms";
  if (matches.length === 1) return `Term ${matches[0].termNumber}`;
  return `Terms ${matches[0].termNumber}–${matches.at(-1)?.termNumber}`;
}

function DepartmentEventForm({ schoolId, year, departments, event, onDone }: { schoolId:string; year:number; departments:DepartmentCalendarOption[]; event?:OperationalCalendarEvent; onDone:()=>void }) {
  const [state, action, pending] = useActionState(event ? reviseOperationalCalendarEvent : saveOperationalCalendarEvent, initialState);
  const [kind, setKind] = useState(event?.eventKind ?? "event");
  const [departmentId, setDepartmentId] = useState(event?.departmentAssignmentId ?? departments[0]?.assignmentId ?? "");
  const [startsOn, setStartsOn] = useState(event?.startsOn ?? `${year}-01-01`);
  const [endsOn, setEndsOn] = useState(event?.endsOn ?? `${year}-01-01`);
  useEffect(() => {
    if (!state.message) return;
    if (state.success) { toast.success(state.message); queueMicrotask(onDone); } else toast.error(state.message);
  }, [onDone, state]);
  return <form action={action} className="grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:grid-cols-2 lg:grid-cols-4">
    <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="academicYear" value={year} /><input type="hidden" name="scopeKind" value="department" /><input type="hidden" name="audienceScope" value="department_staff" /><input type="hidden" name="targetStaffMemberId" value="" /><input type="hidden" name="learnerDayEffect" value="UNCHANGED" /><input type="hidden" name="bellScheduleId" value="" /><input type="hidden" name="linkedModule" value="" /><input type="hidden" name="linkedPath" value="" /><input type="hidden" name="startsAt" value="" /><input type="hidden" name="endsAt" value="" />{event ? <input type="hidden" name="eventId" value={event.id} /> : null}
    {!event ? <Picker label="Department" name="departmentAssignmentId" value={departmentId} onChange={setDepartmentId} options={departments.map((department)=>({value:department.assignmentId,label:department.label,helper:department.subjectNames.join(", ")}))} placeholder="Choose department" /> : <input type="hidden" name="departmentAssignmentId" value={event.departmentAssignmentId ?? ""} />}
    <Picker label="Activity type" name="eventKind" value={kind} onChange={setKind} options={eventKinds} placeholder="Choose type" />
    <div className="sm:col-span-2"><label htmlFor={`department-event-title-${event?.id ?? "new"}`} className={formFieldLabelClass}>Title</label><input id={`department-event-title-${event?.id ?? "new"}`} name="title" defaultValue={event?.title ?? ""} required maxLength={180} className={`${inputClass} ${formFieldControlOffsetClass}`} /></div>
    <DateField label="Starts on" name="startsOn" value={startsOn} onChange={(value)=>{setStartsOn(value);if(endsOn<value)setEndsOn(value);}} min={`${year}-01-01`} max={`${year}-12-31`} required />
    <DateField label="Ends on" name="endsOn" value={endsOn} onChange={setEndsOn} min={startsOn} max={`${year}-12-31`} required />
    <div className="sm:col-span-2"><label htmlFor={`department-event-notes-${event?.id ?? "new"}`} className={formFieldLabelClass}>Notes (optional)</label><textarea id={`department-event-notes-${event?.id ?? "new"}`} name="description" defaultValue={event?.description ?? ""} rows={2} maxLength={3000} className={`${inputClass} ${formFieldControlOffsetClass} resize-y py-2.5`} /></div>
    <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-4"><Button type="button" size="sm" variant="neutral" onClick={onDone}>Cancel</Button><Button type="submit" size="sm" loading={pending}>{event ? "Save changes" : "Add activity"}</Button></div>
  </form>;
}

export function DepartmentActivitiesManager({ schoolId, year, terms, events, departments, canManage, title = "Department activities" }: { schoolId:string;year:number;terms:TermCalendarSummary[];events:OperationalCalendarEvent[];departments:DepartmentCalendarOption[];canManage:boolean;title?:string }) {
  const [showAdd,setShowAdd]=useState(false); const [editingId,setEditingId]=useState<string|null>(null); const [confirmId,setConfirmId]=useState<string|null>(null);
  const [cancelState,cancelAction,cancelPending]=useActionState(cancelOperationalCalendarEvent,initialState);
  const ordered=useMemo(()=>[...events].sort((a,b)=>a.startsOn.localeCompare(b.startsOn)||a.title.localeCompare(b.title)),[events]);
  useEffect(()=>{if(!cancelState.message)return;if(cancelState.success){toast.success(cancelState.message);queueMicrotask(()=>setConfirmId(null));}else toast.error(cancelState.message);},[cancelState]);
  return <section id="department-activities" className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
    <div className="flex flex-col gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-2.5"><span className="scolapro-tone-brand grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"><CalendarDays className="size-4" /></span><div><h2 className="scolapro-section-title">{title}</h2><p className="scolapro-section-description !mt-0">Department-scoped activities are visible only to governed HOD portfolios and allocated teachers.</p></div></div>{canManage&&departments.length?<Button type="button" size="sm" variant="soft" onClick={()=>setShowAdd((value)=>!value)}>{showAdd?"Close":<><Plus className="size-3.5" />Add activity</>}</Button>:null}</div>
    {showAdd&&canManage?<div className="mt-4"><DepartmentEventForm schoolId={schoolId} year={year} departments={departments} onDone={()=>setShowAdd(false)} /></div>:null}
    {ordered.length?<div className="mt-3 divide-y divide-border-subtle">{ordered.map((event)=><article key={event.id} className="py-3"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div><h3 className="scolapro-record-title">{event.title}</h3><p className="mt-1 text-xs text-muted-foreground">{event.departmentLabel ?? "Department"} · {event.eventKind.replaceAll("_"," ")}{event.description?` · ${event.description}`:""}</p></div><div className="text-xs text-muted-foreground">{dateFormatter.format(new Date(`${event.startsOn}T12:00:00`))}<span className="ml-2 rounded-[var(--radius-xs)] bg-brand-soft px-2 py-0.5 text-[0.62rem] font-semibold text-brand-strong">{termLabel(event,terms)}</span></div>{canManage&&event.canMutate?<div className="flex justify-end gap-1"><RecordActionButton icon={Pencil} label="Edit" actionKind="edit" expanded={false} onClick={()=>setEditingId(editingId===event.id?null:event.id)} />{confirmId===event.id?<><form action={cancelAction}><input type="hidden" name="eventId" value={event.id}/><Button type="submit" size="sm" variant="danger" loading={cancelPending}><Trash2 className="size-3.5"/>Cancel activity</Button></form><Button type="button" size="sm" variant="ghost" onClick={()=>setConfirmId(null)}>Keep</Button></>:<Button type="button" size="sm" variant="danger-ghost" onClick={()=>setConfirmId(event.id)}><Trash2 className="size-3.5"/>Delete</Button>}</div>:null}</div>{editingId===event.id?<div className="mt-3"><DepartmentEventForm schoolId={schoolId} year={year} departments={departments} event={event} onDone={()=>setEditingId(null)} /></div>:null}</article>)}</div>:<p className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-4 text-xs text-muted-foreground">No department activities are configured for {year}.</p>}
  </section>;
}
