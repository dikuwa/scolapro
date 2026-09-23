"use client";

import { useActionState, useEffect, useState } from "react";
import { Globe2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { formFieldControlOffsetClass, formFieldLabelClass } from "@/components/ui/form-field-layout";
import { Picker } from "@/components/ui/picker";
import { TimeField } from "@/components/ui/time-field";
import { saveNationalCalendarEvent, type TeachingImpactActionState } from "@/features/calendar/server/actions";
import type { LearnerCalendarEventRow } from "@/features/calendar/server/teaching-impact";

const impactOptions = [
  { value: "NORMAL", label: "Normal", helper: "Information only; teaching is unchanged" },
  { value: "NO_TEACHING", label: "No teaching", helper: "National learner teaching stops" },
  { value: "PARTIAL_DAY", label: "Partial day", helper: "Teaching occurs for part of the day" },
  { value: "ALTERED_TIMETABLE", label: "Altered timetable", helper: "Schools follow an altered timetable" },
  { value: "EXAM_TIMETABLE", label: "Exam timetable", helper: "Learners follow examination scheduling" },
];
const categories = ["Information", "Public holiday", "National programme", "Assessment", "Closure", "Other"].map((value) => ({ value, label: value }));
const inputClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

function dateLabel(event: LearnerCalendarEventRow) {
  const format = (value: string) => new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
  return event.startsOn === event.endsOn ? format(event.startsOn) : `${format(event.startsOn)} – ${format(event.endsOn)}`;
}

export function NationalCalendarManager({ year, events }: { year: number; events: LearnerCalendarEventRow[] }) {
  const [state, action, pending] = useActionState(saveNationalCalendarEvent, {} as TeachingImpactActionState);
  const [startsOn, setStartsOn] = useState(`${year}-01-01`);
  const [endsOn, setEndsOn] = useState(`${year}-01-01`);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [impact, setImpact] = useState("NORMAL");
  const [category, setCategory] = useState("Information");

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message); else toast.error(state.message);
  }, [state]);

  return <div className="space-y-5">
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-start gap-2.5 border-b border-border-subtle pb-4"><span className="scolapro-tone-brand grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"><Globe2 className="size-4" /></span><div><h2 className="scolapro-section-title">National learner baseline</h2><p className="scolapro-section-description !mt-0">Add learner-calendar facts once for every school. Normal is informational; teaching changes only when an explicit impact is selected.</p></div></div>
      <form action={action} className="mt-5 grid gap-4 lg:grid-cols-2">
        <input type="hidden" name="academicYear" value={year} />
        <div><label htmlFor="national-event-title" className={formFieldLabelClass}>Event title</label><input id="national-event-title" name="title" required maxLength={160} className={`${inputClass} ${formFieldControlOffsetClass}`} placeholder="For example, Independence Day" /></div>
        <Picker label="Category" name="category" value={category} onChange={setCategory} placeholder="Choose category" options={categories} />
        <DateField label="Starts on" name="startsOn" value={startsOn} onChange={(value) => { setStartsOn(value); if (endsOn < value) setEndsOn(value); }} min={`${year}-01-01`} max={`${year}-12-31`} required />
        <DateField label="Ends on" name="endsOn" value={endsOn} onChange={setEndsOn} min={startsOn || `${year}-01-01`} max={`${year}-12-31`} required />
        <TimeField label="Starts at (optional)" name="startsAt" value={startsAt} onChange={setStartsAt} />
        <TimeField label="Ends at (optional)" name="endsAt" value={endsAt} onChange={setEndsAt} />
        <Picker label="Teaching impact" name="impact" value={impact} onChange={setImpact} placeholder="Choose teaching impact" options={impactOptions} />
        <div><label htmlFor="national-event-description" className={formFieldLabelClass}>Description (optional)</label><textarea id="national-event-description" name="description" rows={3} maxLength={2000} className={`${inputClass} ${formFieldControlOffsetClass} resize-y py-2.5`} /></div>
        <div className="lg:col-span-2"><Button type="submit" loading={pending}>Add national event</Button></div>
      </form>
    </section>
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <h2 className="scolapro-section-title">{year} baseline events</h2>
      <p className="scolapro-section-description">Append-only records preserve the national source and historical teaching impact.</p>
      {events.length ? <div className="mt-3 divide-y divide-border-subtle">{events.map((event) => <article key={event.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-start"><div><h3 className="scolapro-record-title">{event.title}</h3><p className="mt-1 text-xs text-muted-foreground">{event.category}{event.description ? ` · ${event.description}` : ""}</p></div><p className="text-xs text-muted-foreground">{dateLabel(event)}</p><span className="w-fit rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.68rem] font-semibold text-brand-strong">{event.teachingImpact.replaceAll("_", " ")}</span></article>)}</div> : <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-5 text-sm text-muted-foreground">No national learner events are configured for {year}.</div>}
    </section>
  </div>;
}
