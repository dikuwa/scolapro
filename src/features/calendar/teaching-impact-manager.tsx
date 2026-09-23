"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { CalendarCog, Clock3, Globe2, School } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { formFieldControlOffsetClass, formFieldLabelClass } from "@/components/ui/form-field-layout";
import { Picker } from "@/components/ui/picker";
import { TimeField } from "@/components/ui/time-field";
import { saveSchoolCalendarEvent, type TeachingImpactActionState } from "@/features/calendar/server/actions";
import type {
  CalendarAudienceOption,
  LearnerCalendarEventRow,
  TeachingImpactRow,
} from "@/features/calendar/server/teaching-impact";
import type { BellScheduleSummary } from "@/features/timetable/server/bell-calendar";

const initialState: TeachingImpactActionState = {};
const impactOptions = [
  { value: "NORMAL", label: "Normal", helper: "Informational only; teaching continues normally" },
  { value: "NO_TEACHING", label: "No teaching", helper: "Blocks learner teaching and pauses the rotating cycle" },
  { value: "PARTIAL_DAY", label: "Partial day", helper: "Teaching occurs for only part of the day" },
  { value: "ALTERED_TIMETABLE", label: "Altered timetable", helper: "A different lesson timing or order applies" },
  { value: "EXAM_TIMETABLE", label: "Exam timetable", helper: "The learner day follows the examination timetable" },
];
const categoryOptions = ["Information", "Public holiday", "School holiday", "Assessment", "School programme", "Closure", "Other"].map((value) => ({ value, label: value }));
const inputClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function eventDateLabel(event: LearnerCalendarEventRow) {
  const range = event.startsOn === event.endsOn ? formatDate(event.startsOn) : `${formatDate(event.startsOn)} – ${formatDate(event.endsOn)}`;
  return event.startsAt && event.endsAt ? `${range} · ${event.startsAt.slice(0, 5)}–${event.endsAt.slice(0, 5)}` : range;
}

export function TeachingImpactManager({
  schoolId,
  year,
  schedules,
  events,
  overrides,
  audienceOptions,
  canManage,
}: {
  schoolId: string;
  year: number;
  schedules: BellScheduleSummary[];
  events: LearnerCalendarEventRow[];
  overrides: TeachingImpactRow[];
  audienceOptions: CalendarAudienceOption[];
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(saveSchoolCalendarEvent, initialState);
  const [startsOn, setStartsOn] = useState(`${year}-01-01`);
  const [endsOn, setEndsOn] = useState(`${year}-01-01`);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [impact, setImpact] = useState("NORMAL");
  const [audience, setAudience] = useState("all_learners");
  const [category, setCategory] = useState("Information");
  const [schedule, setSchedule] = useState("");
  const canSchedule = impact === "ALTERED_TIMETABLE" || impact === "EXAM_TIMETABLE";
  const audienceLabelByValue = useMemo(() => new Map(audienceOptions.map((option) => [option.value, option.label])), [audienceOptions]);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <section className="mt-5 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-start gap-2.5 border-b border-border-subtle pb-4">
        <span className="scolapro-tone-brand grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"><CalendarCog className="size-4" /></span>
        <div>
          <h2 className="scolapro-section-title">Learner calendar events</h2>
          <p className="scolapro-section-description !mt-0">National learner dates form the baseline. School events overlay that baseline without changing teacher or hostel calendars.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 bg-surface-muted p-3 sm:grid-cols-2 sm:p-4">
        <div className="flex gap-2"><Globe2 className="mt-0.5 size-4 shrink-0 text-brand-strong" /><p className="text-xs leading-5 text-muted-foreground"><strong className="font-semibold text-foreground">Event existence is informational by default.</strong> Normal events do not close teaching or advance a weekend into a teaching day.</p></div>
        <div className="flex gap-2"><Clock3 className="mt-0.5 size-4 shrink-0 text-[color:var(--accent-amber)]" /><p className="text-xs leading-5 text-muted-foreground"><strong className="font-semibold text-foreground">No teaching has operational effect.</strong> Attendance capture is blocked and rotating timetables skip only the affected dates.</p></div>
      </div>

      {canManage ? <form action={action} className="mt-5 grid gap-4 lg:grid-cols-2">
        <input type="hidden" name="schoolId" value={schoolId} />
        <input type="hidden" name="academicYear" value={year} />
        <div>
          <label htmlFor="calendar-event-title" className={formFieldLabelClass}>Event title</label>
          <input id="calendar-event-title" name="title" required maxLength={160} className={`${inputClass} ${formFieldControlOffsetClass}`} placeholder="For example, Regional science fair" />
        </div>
        <Picker label="Category" name="category" value={category} onChange={setCategory} placeholder="Choose category" options={categoryOptions} />
        <DateField label="Starts on" name="startsOn" value={startsOn} onChange={(value) => { setStartsOn(value); if (endsOn < value) setEndsOn(value); }} min={`${year}-01-01`} max={`${year}-12-31`} required />
        <DateField label="Ends on" name="endsOn" value={endsOn} onChange={setEndsOn} min={startsOn || `${year}-01-01`} max={`${year}-12-31`} required />
        <TimeField label="Starts at (optional)" name="startsAt" value={startsAt} onChange={setStartsAt} />
        <TimeField label="Ends at (optional)" name="endsAt" value={endsAt} onChange={setEndsAt} />
        <Picker label="Learner audience" name="audience" value={audience} onChange={setAudience} placeholder="Choose audience" options={audienceOptions} searchable />
        <Picker label="Teaching impact" name="impact" value={impact} onChange={(value) => { setImpact(value); if (value !== "ALTERED_TIMETABLE" && value !== "EXAM_TIMETABLE") setSchedule(""); }} placeholder="Choose teaching impact" options={impactOptions} />
        {canSchedule ? (
          <Picker label="Alternate bell schedule" name="bellScheduleId" value={schedule} onChange={setSchedule} placeholder="Use automatically effective schedule" options={schedules.map((item) => ({ value: item.id, label: item.name, helper: `From ${item.effectiveFrom}` }))} />
        ) : <input type="hidden" name="bellScheduleId" value="" />}
        <div className={canSchedule ? "" : "lg:col-span-2"}>
          <label htmlFor="calendar-event-description" className={formFieldLabelClass}>Description (optional)</label>
          <textarea id="calendar-event-description" name="description" rows={3} maxLength={2000} className={`${inputClass} ${formFieldControlOffsetClass} resize-y py-2.5`} placeholder="Add context without changing the teaching impact." />
        </div>
        <div className="flex items-start lg:col-span-2">
          <Button type="submit" loading={pending}>Add school event</Button>
        </div>
      </form> : null}

      <div className="mt-6 border-t border-border-subtle pt-4">
        <h3 className="text-sm font-semibold">Baseline and school overlay</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">National and school events stay identifiable. Only the stated learner teaching impact affects timetable and attendance behavior.</p>
        {events.length ? (
          <div className="mt-3 divide-y divide-border-subtle">
            {events.map((event) => {
              const audienceValue = event.audienceScope === "all_learners" ? "all_learners" : `${event.audienceScope}:${event.audienceReferenceId}`;
              return (
                <article key={event.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(9rem,0.8fr)_auto] sm:items-start">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {event.scope === "national" ? <Globe2 className="size-3.5 shrink-0 text-brand-strong" /> : <School className="size-3.5 shrink-0 text-[color:var(--accent-mint)]" />}
                      <h4 className="scolapro-record-title truncate">{event.title}</h4>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{event.category} · {audienceLabelByValue.get(audienceValue) ?? (event.scope === "national" ? "All learners" : "Scoped learners")}</p>
                    {event.description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{event.description}</p> : null}
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">{eventDateLabel(event)}{event.bellScheduleName ? <><br />{event.bellScheduleName}</> : null}</p>
                  <span className="w-fit rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.68rem] font-semibold text-brand-strong">{event.teachingImpact.replaceAll("_", " ")}</span>
                </article>
              );
            })}
          </div>
        ) : <div className="mt-3 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-5 text-sm text-muted-foreground">No learner calendar events are configured for this academic year.</div>}
      </div>

      {overrides.length ? (
        <details className="mt-4 border-t border-border-subtle pt-4">
          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Legacy single-date teaching overrides ({overrides.length})</summary>
          <div className="mt-2 divide-y divide-border-subtle">{overrides.slice(0, 8).map((item) => <div key={item.id} className="grid gap-1 py-2.5 sm:grid-cols-[7.5rem_10rem_1fr]"><span className="text-xs font-medium">{item.date}</span><span className="text-[0.68rem] font-semibold text-brand-strong">{item.impact.replaceAll("_", " ")}</span><span className="text-[0.68rem] text-muted-foreground">{item.bellScheduleName ?? item.reason ?? "—"}</span></div>)}</div>
        </details>
      ) : null}
    </section>
  );
}
