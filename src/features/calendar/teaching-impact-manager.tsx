"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { CalendarCog, ChevronDown, ChevronUp, Clock3, Globe2, Pencil, Plus, School, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { formFieldControlOffsetClass, formFieldLabelClass } from "@/components/ui/form-field-layout";
import { Picker } from "@/components/ui/picker";
import { TimeField } from "@/components/ui/time-field";
import {
  deleteTeachingImpactAdjustment,
  saveSchoolCalendarEvent,
  saveTeachingImpact,
  type TeachingImpactActionState,
} from "@/features/calendar/server/actions";
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
const inputClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition-[border-color,box-shadow] hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)] motion-reduce:transition-none";
const dateFormatter = new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" });

type AdjustmentTarget = {
  key: string;
  date: string;
  reason: string;
};

type OfficialCalendarEntry =
  | { key: string; sortDate: string; event: LearnerCalendarEventRow; relatedOverrides: TeachingImpactRow[] }
  | { key: string; sortDate: string; override: TeachingImpactRow };

function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T12:00:00`));
}

function eventDateLabel(event: LearnerCalendarEventRow) {
  const range = event.startsOn === event.endsOn ? formatDate(event.startsOn) : `${formatDate(event.startsOn)} – ${formatDate(event.endsOn)}`;
  return event.startsAt && event.endsAt ? `${range} · ${event.startsAt.slice(0, 5)}–${event.endsAt.slice(0, 5)}` : range;
}

function sourceLabel(item: TeachingImpactRow) {
  if (item.source === "national") return "National baseline";
  if (item.source === "regional") return "Regional baseline";
  if (item.baselineSource) return `School correction · ${item.baselineSource} baseline retained`;
  return item.source === "emergency" ? "Emergency adjustment" : "School adjustment";
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
  const [adjustmentState, adjustmentAction, adjustmentPending] = useActionState(saveTeachingImpact, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteTeachingImpactAdjustment, initialState);
  const [startsOn, setStartsOn] = useState(`${year}-01-01`);
  const [endsOn, setEndsOn] = useState(`${year}-01-01`);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [impact, setImpact] = useState("NO_TEACHING");
  const [audience, setAudience] = useState("all_learners");
  const [category, setCategory] = useState("Information");
  const [schedule, setSchedule] = useState("");
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [adjustmentTarget, setAdjustmentTarget] = useState<AdjustmentTarget | null>(null);
  const [adjustmentImpact, setAdjustmentImpact] = useState("NO_TEACHING");
  const [adjustmentSchedule, setAdjustmentSchedule] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const canSchedule = impact === "ALTERED_TIMETABLE" || impact === "EXAM_TIMETABLE";
  const canScheduleAdjustment = adjustmentImpact === "ALTERED_TIMETABLE" || adjustmentImpact === "EXAM_TIMETABLE";
  const audienceLabelByValue = useMemo(() => new Map(audienceOptions.map((option) => [option.value, option.label])), [audienceOptions]);
  const deduplicatedEvents = useMemo(() => {
    const byKey = new Map<string, LearnerCalendarEventRow>();
    for (const event of events) {
      const key = `${event.title.trim().toLocaleLowerCase()}|${event.startsOn}|${event.endsOn}|${event.teachingImpact}`;
      const current = byKey.get(key);
      if (!current || (current.scope !== "national" && event.scope === "national")) byKey.set(key, event);
    }
    return [...byKey.values()];
  }, [events]);
  const officialEntries = useMemo<OfficialCalendarEntry[]>(() => {
    const claimedOverrideIds = new Set<string>();
    const eventEntries: OfficialCalendarEntry[] = deduplicatedEvents.map((event) => {
      const relatedOverrides = overrides.filter((item) => item.date >= event.startsOn && item.date <= event.endsOn);
      relatedOverrides.forEach((item) => claimedOverrideIds.add(item.id));
      return { key: `event:${event.id}`, sortDate: event.startsOn, event, relatedOverrides };
    });
    const unmatchedOverrides: OfficialCalendarEntry[] = overrides
      .filter((item) => !claimedOverrideIds.has(item.id))
      .map((item) => ({ key: `override:${item.id}`, sortDate: item.date, override: item }));
    return [...eventEntries, ...unmatchedOverrides].sort((a, b) => a.sortDate.localeCompare(b.sortDate));
  }, [deduplicatedEvents, overrides]);
  const visibleEntries = showAll ? officialEntries : officialEntries.slice(0, 8);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      queueMicrotask(() => setShowAddEvent(false));
    } else toast.error(state.message);
  }, [state]);

  useEffect(() => {
    if (!adjustmentState.message) return;
    if (adjustmentState.success) {
      toast.success(adjustmentState.message);
      queueMicrotask(() => setAdjustmentTarget(null));
    } else toast.error(adjustmentState.message);
  }, [adjustmentState]);

  useEffect(() => {
    if (!deleteState.message) return;
    if (deleteState.success) {
      toast.success(deleteState.message);
      queueMicrotask(() => setConfirmDeleteId(null));
    } else toast.error(deleteState.message);
  }, [deleteState]);

  function openAdjustment(key: string, input?: { date?: string; impact?: string; reason?: string | null }) {
    setShowAddEvent(false);
    setAdjustmentImpact(input?.impact ?? "NO_TEACHING");
    setAdjustmentSchedule("");
    setAdjustmentTarget({
      key,
      date: input?.date ?? `${year}-01-01`,
      reason: input?.reason ?? "",
    });
  }

  function adjustmentForm(key: string) {
    if (!canManage || adjustmentTarget?.key !== key) return null;
    return (
      <form action={adjustmentAction} className="mt-3 grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:grid-cols-2 lg:grid-cols-4">
        <input type="hidden" name="schoolId" value={schoolId} />
        <DateField
          label="Effective date"
          name="date"
          value={adjustmentTarget.date}
          onChange={(date) => setAdjustmentTarget((current) => current ? { ...current, date } : current)}
          min={`${year}-01-01`}
          max={`${year}-12-31`}
          required
        />
        <Picker
          label="Learner-day status"
          name="impact"
          value={adjustmentImpact}
          onChange={(value) => {
            setAdjustmentImpact(value);
            if (value !== "ALTERED_TIMETABLE" && value !== "EXAM_TIMETABLE") setAdjustmentSchedule("");
          }}
          placeholder="Choose status"
          options={impactOptions}
        />
        {canScheduleAdjustment ? (
          <Picker label="Alternate bell schedule" name="bellScheduleId" value={adjustmentSchedule} onChange={setAdjustmentSchedule} placeholder="Use automatically effective schedule" options={schedules.map((item) => ({ value: item.id, label: item.name, helper: `From ${item.effectiveFrom}` }))} />
        ) : <input type="hidden" name="bellScheduleId" value="" />}
        <div className={canScheduleAdjustment ? "" : "lg:col-span-2"}>
          <label htmlFor={`calendar-adjustment-reason-${key.replaceAll(":", "-")}`} className={formFieldLabelClass}>Reason / authority</label>
          <input
            id={`calendar-adjustment-reason-${key.replaceAll(":", "-")}`}
            name="reason"
            value={adjustmentTarget.reason}
            onChange={(event) => setAdjustmentTarget((current) => current ? { ...current, reason: event.target.value } : current)}
            maxLength={500}
            className={`${inputClass} ${formFieldControlOffsetClass}`}
            placeholder="For example, Ministry circular moved the school holiday"
          />
        </div>
        <div className="flex items-end justify-end gap-2 lg:col-span-4">
          <Button type="button" size="sm" variant="neutral" onClick={() => setAdjustmentTarget(null)}>Cancel</Button>
          <Button type="submit" size="sm" loading={adjustmentPending}>Save adjustment</Button>
        </div>
      </form>
    );
  }

  const officialEventForm = canManage && showAddEvent ? (
    <form action={action} className="mt-4 grid gap-4 rounded-[var(--radius-sm)] bg-surface-muted p-3 lg:grid-cols-2">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="academicYear" value={year} />
      <div><label htmlFor="calendar-event-title" className={formFieldLabelClass}>Event title</label><input id="calendar-event-title" name="title" required maxLength={160} className={`${inputClass} ${formFieldControlOffsetClass}`} placeholder="For example, Public holiday" /></div>
      <Picker label="Category" name="category" value={category} onChange={setCategory} placeholder="Choose category" options={categoryOptions.filter((option) => option.value !== "Information")} />
      <DateField label="Starts on" name="startsOn" value={startsOn} onChange={(value) => { setStartsOn(value); if (endsOn < value) setEndsOn(value); }} min={`${year}-01-01`} max={`${year}-12-31`} required />
      <DateField label="Ends on" name="endsOn" value={endsOn} onChange={setEndsOn} min={startsOn || `${year}-01-01`} max={`${year}-12-31`} required />
      <TimeField label="Starts at (optional)" name="startsAt" value={startsAt} onChange={setStartsAt} />
      <TimeField label="Ends at (optional)" name="endsAt" value={endsAt} onChange={setEndsAt} />
      <Picker label="Learner audience" name="audience" value={audience} onChange={setAudience} placeholder="Choose audience" options={audienceOptions} searchable />
      <Picker label="Teaching impact" name="impact" value={impact} onChange={(value) => { setImpact(value); if (value !== "ALTERED_TIMETABLE" && value !== "EXAM_TIMETABLE") setSchedule(""); }} placeholder="Choose teaching impact" options={impactOptions.filter((option) => option.value !== "NORMAL")} />
      {canSchedule ? <Picker label="Alternate bell schedule" name="bellScheduleId" value={schedule} onChange={setSchedule} placeholder="Use automatically effective schedule" options={schedules.map((item) => ({ value: item.id, label: item.name, helper: `From ${item.effectiveFrom}` }))} /> : <input type="hidden" name="bellScheduleId" value="" />}
      <div className={canSchedule ? "" : "lg:col-span-2"}><label htmlFor="calendar-event-description" className={formFieldLabelClass}>Description (optional)</label><textarea id="calendar-event-description" name="description" rows={3} maxLength={2000} className={`${inputClass} ${formFieldControlOffsetClass} resize-y py-2.5`} /></div>
      <div className="flex justify-end gap-2 lg:col-span-2"><Button type="button" size="sm" variant="neutral" onClick={() => setShowAddEvent(false)}>Cancel</Button><Button type="submit" size="sm" loading={pending}>Add official date</Button></div>
    </form>
  ) : null;

  return (
    <section id="official-calendar" className="mt-5 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5" style={{ scrollMarginTop: "6rem" }}>
      <div className="flex flex-col gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2.5">
          <span className="scolapro-tone-brand grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"><CalendarCog className="size-4" /></span>
          <div>
            <h2 className="scolapro-section-title">Official calendar & adjustments</h2>
            <p className="scolapro-section-description !mt-0">Ministry dates and approved school corrections appear together. A correction stays attached to the date it changes.</p>
          </div>
        </div>
        {canManage ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" size="sm" variant="neutral" aria-expanded={adjustmentTarget?.key === "new"} onClick={() => adjustmentTarget?.key === "new" ? setAdjustmentTarget(null) : openAdjustment("new")}>
              <Plus className="size-3.5" />
              Add adjustment
            </Button>
            <Button type="button" size="sm" variant="soft" aria-expanded={showAddEvent} onClick={() => { setAdjustmentTarget(null); setShowAddEvent((current) => !current); }}>
              {showAddEvent ? "Close" : "Add official date"}
            </Button>
          </div>
        ) : null}
      </div>

      {officialEventForm}
      {adjustmentForm("new")}

      <div className="mt-4 flex gap-2 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2.5">
        <Clock3 className="mt-0.5 size-4 shrink-0 text-[color:var(--accent-amber)]" />
        <p className="text-xs leading-5 text-muted-foreground"><strong className="font-semibold text-foreground">Only a stated learner-day impact changes attendance or timetable behavior.</strong> Informational school activities remain in School events above.</p>
      </div>

      {officialEntries.length ? (
        <div className="mt-3 divide-y divide-border-subtle">
          {visibleEntries.map((entry) => {
            if ("event" in entry) {
              const event = entry.event;
              const audienceValue = event.audienceScope === "all_learners" ? "all_learners" : `${event.audienceScope}:${event.audienceReferenceId}`;
              const schoolCorrections = entry.relatedOverrides.filter((item) => item.source === "school" || item.source === "emergency");
              const effective = schoolCorrections[0] ?? entry.relatedOverrides[0];
              return (
                <article key={entry.key} className="py-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(9rem,0.8fr)_auto] sm:items-start">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {event.scope === "national" ? <Globe2 className="size-3.5 shrink-0 text-brand-strong" /> : <School className="size-3.5 shrink-0 text-[color:var(--accent-mint)]" />}
                        <h3 className="scolapro-record-title truncate">{event.title}</h3>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{event.category} · {audienceLabelByValue.get(audienceValue) ?? (event.scope === "national" ? "All learners" : "Scoped learners")}</p>
                      {event.description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{event.description}</p> : null}
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">{eventDateLabel(event)}{event.bellScheduleName ? <><br />{event.bellScheduleName}</> : null}</p>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="w-fit rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.68rem] font-semibold text-brand-strong">{(effective?.impact ?? event.teachingImpact).replaceAll("_", " ")}</span>
                      {canManage && event.audienceScope === "all_learners" ? <Button type="button" size="sm" variant="ghost" onClick={() => openAdjustment(entry.key, { date: effective?.date ?? event.startsOn, impact: effective?.impact ?? event.teachingImpact, reason: effective?.reason ?? event.title })}><Pencil className="size-3.5" />Adjust</Button> : null}
                    </div>
                  </div>
                  {schoolCorrections.map((item) => (
                    <div key={item.id} className="mt-2 flex flex-col gap-2 rounded-[var(--radius-sm)] bg-brand-soft px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 text-xs"><span className="font-semibold text-brand-strong">{sourceLabel(item)}</span><span className="text-muted-foreground"> · {formatDate(item.date)} · {item.reason ?? item.impact.replaceAll("_", " ")}</span></div>
                      {canManage ? <div className="flex shrink-0 flex-wrap gap-1.5"><Button type="button" size="sm" variant="ghost" onClick={() => openAdjustment(`override:${item.id}`, { date: item.date, impact: item.impact, reason: item.reason })}><Pencil className="size-3.5" />Edit</Button>{confirmDeleteId === item.id ? <><form action={deleteAction}><input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="date" value={item.date} /><Button type="submit" size="sm" variant="danger" loading={deletePending}><Trash2 className="size-3.5" />Delete correction</Button></form><Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}><X className="size-3.5" />Keep</Button></> : <Button type="button" size="sm" variant="danger-ghost" onClick={() => setConfirmDeleteId(item.id)}><Trash2 className="size-3.5" />Delete</Button>}</div> : null}
                    </div>
                  ))}
                  {adjustmentForm(entry.key)}
                  {schoolCorrections.map((item) => adjustmentForm(`override:${item.id}`))}
                </article>
              );
            }

            const item = entry.override;
            const isOfficialBaseline = item.source === "national" || item.source === "regional";
            const isSchoolAdjustment = item.source === "school" || item.source === "emergency";
            return (
              <article key={entry.key} className="py-3">
                <div className="grid gap-2 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-center">
                  <span className="text-xs font-medium">{formatDate(item.date)}</span>
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-[0.68rem] font-semibold text-brand-strong">{item.impact.replaceAll("_", " ")}</span><span className={isOfficialBaseline ? "rounded-[var(--radius-xs)] bg-surface-muted px-2 py-0.5 text-[0.62rem] font-semibold text-muted-foreground" : "rounded-[var(--radius-xs)] bg-brand-soft px-2 py-0.5 text-[0.62rem] font-semibold text-brand-strong"}>{sourceLabel(item)}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.bellScheduleName ?? item.reason ?? (isOfficialBaseline ? "Official calendar evidence" : "School calendar adjustment")}</p></div>
                  {canManage ? <div className="flex flex-wrap items-center justify-end gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => openAdjustment(entry.key, { date: item.date, impact: item.impact, reason: item.reason })}><Pencil className="size-3.5" />{isOfficialBaseline ? "Correct" : "Edit"}</Button>{isSchoolAdjustment ? confirmDeleteId === item.id ? <><form action={deleteAction}><input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="date" value={item.date} /><Button type="submit" size="sm" variant="danger" loading={deletePending}><Trash2 className="size-3.5" />{item.baselineSource ? "Delete correction" : "Delete"}</Button></form><Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}><X className="size-3.5" />Keep</Button></> : <Button type="button" size="sm" variant="danger-ghost" onClick={() => setConfirmDeleteId(item.id)}><Trash2 className="size-3.5" />Delete</Button> : null}</div> : null}
                </div>
                {adjustmentForm(entry.key)}
              </article>
            );
          })}
        </div>
      ) : <div className="mt-3 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-5 text-sm text-muted-foreground">No official calendar dates or school adjustments are configured for {year}.</div>}

      {officialEntries.length > 8 ? <div className="mt-2 flex justify-center border-t border-border-subtle pt-3"><Button type="button" size="sm" variant="neutral" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>{showAll ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}{showAll ? "Show fewer dates" : `Show all ${officialEntries.length} dates`}</Button></div> : null}
    </section>
  );
}
