"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { CalendarCog, Clock3, Globe2, Pencil, Plus, School, Trash2, X } from "lucide-react";
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
  const [adjustmentState, adjustmentAction, adjustmentPending] = useActionState(saveTeachingImpact, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteTeachingImpactAdjustment, initialState);
  const [startsOn, setStartsOn] = useState(`${year}-01-01`);
  const [endsOn, setEndsOn] = useState(`${year}-01-01`);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [impact, setImpact] = useState("NORMAL");
  const [audience, setAudience] = useState("all_learners");
  const [category, setCategory] = useState("Information");
  const [schedule, setSchedule] = useState("");
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjustmentDate, setAdjustmentDate] = useState(`${year}-01-01`);
  const [adjustmentImpact, setAdjustmentImpact] = useState("NO_TEACHING");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentSchedule, setAdjustmentSchedule] = useState("");
  const [confirmDeleteDate, setConfirmDeleteDate] = useState<string | null>(null);
  const canSchedule = impact === "ALTERED_TIMETABLE" || impact === "EXAM_TIMETABLE";
  const canScheduleAdjustment = adjustmentImpact === "ALTERED_TIMETABLE" || adjustmentImpact === "EXAM_TIMETABLE";
  const audienceLabelByValue = useMemo(() => new Map(audienceOptions.map((option) => [option.value, option.label])), [audienceOptions]);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      queueMicrotask(() => setShowAddEvent(false));
    } else {
      toast.error(state.message);
    }
  }, [state]);

  useEffect(() => {
    if (!adjustmentState.message) return;
    if (adjustmentState.success) {
      toast.success(adjustmentState.message);
      queueMicrotask(() => setShowAdjustment(false));
    } else {
      toast.error(adjustmentState.message);
    }
  }, [adjustmentState]);

  useEffect(() => {
    if (!deleteState.message) return;
    if (deleteState.success) {
      toast.success(deleteState.message);
      queueMicrotask(() => setConfirmDeleteDate(null));
    } else {
      toast.error(deleteState.message);
    }
  }, [deleteState]);

  function editAdjustment(input?: { date?: string; impact?: string; reason?: string | null }) {
    setAdjustmentDate(input?.date ?? `${year}-01-01`);
    setAdjustmentImpact(input?.impact ?? "NO_TEACHING");
    setAdjustmentReason(input?.reason ?? "");
    setAdjustmentSchedule("");
    setShowAdjustment(true);
  }

  return (
    <section className="mt-5 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2.5">
          <span className="scolapro-tone-brand grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"><CalendarCog className="size-4" /></span>
          <div>
            <h2 className="scolapro-section-title">Learner calendar events</h2>
            <p className="scolapro-section-description !mt-0">National learner dates form the baseline. School events overlay that baseline without changing teacher or hostel calendars.</p>
          </div>
        </div>
        {canManage ? <Button type="button" size="sm" variant="soft" aria-expanded={showAddEvent} onClick={() => setShowAddEvent((current) => !current)}>
          {showAddEvent ? "Close" : "Add school event"}
        </Button> : null}
      </div>

      <div className="mt-4 grid gap-3 bg-surface-muted p-3 sm:grid-cols-2 sm:p-4">
        <div className="flex gap-2"><Globe2 className="mt-0.5 size-4 shrink-0 text-brand-strong" /><p className="text-xs leading-5 text-muted-foreground"><strong className="font-semibold text-foreground">Event existence is informational by default.</strong> Normal events do not close teaching or advance a weekend into a teaching day.</p></div>
        <div className="flex gap-2"><Clock3 className="mt-0.5 size-4 shrink-0 text-[color:var(--accent-amber)]" /><p className="text-xs leading-5 text-muted-foreground"><strong className="font-semibold text-foreground">No teaching has operational effect.</strong> Attendance capture is blocked and rotating timetables skip only the affected dates.</p></div>
      </div>

      <div id="learner-calendar-events" className="mt-6 border-t border-border-subtle pt-4" style={{ scrollMarginTop: "6rem" }}>
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
                  <div className="flex items-center justify-end gap-2">
                    <span className="w-fit rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.68rem] font-semibold text-brand-strong">{event.teachingImpact.replaceAll("_", " ")}</span>
                    {canManage && event.audienceScope === "all_learners" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => editAdjustment({
                          date: event.startsOn,
                          impact: event.teachingImpact === "NO_TEACHING" ? "NO_TEACHING" : "NORMAL",
                          reason: event.title,
                        })}
                      >
                        <Pencil className="size-3.5" />
                        Adjust
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className="mt-3 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-5 text-sm text-muted-foreground">No learner calendar events are configured for this academic year.</div>}
      </div>

      <div id="calendar-adjustments" className="mt-6 border-t border-border-subtle pt-4" style={{ scrollMarginTop: "6rem" }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">Calendar adjustments & exceptions</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              School-level corrections override the effective learner day without deleting the national/public baseline. Use these for a shifted Ministry date, local closure, replacement school day or another approved exception.
            </p>
          </div>
          {canManage ? (
            <Button type="button" size="sm" variant="soft" onClick={() => showAdjustment ? setShowAdjustment(false) : editAdjustment()}>
              {showAdjustment ? "Close adjustment" : <><Plus className="size-3.5" />Add adjustment</>}
            </Button>
          ) : null}
        </div>

        {canManage ? (
          <form action={adjustmentAction} className={showAdjustment ? "mt-4 grid gap-4 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:grid-cols-2 lg:grid-cols-4" : "hidden"} aria-hidden={!showAdjustment}>
            <input type="hidden" name="schoolId" value={schoolId} />
            <DateField label="Effective date" name="date" value={adjustmentDate} onChange={setAdjustmentDate} min={`${year}-01-01`} max={`${year}-12-31`} required />
            <Picker
              label="Learner-day status"
              name="impact"
              value={adjustmentImpact}
              onChange={(value) => { setAdjustmentImpact(value); if (value !== "ALTERED_TIMETABLE" && value !== "EXAM_TIMETABLE") setAdjustmentSchedule(""); }}
              placeholder="Choose status"
              options={impactOptions}
            />
            {canScheduleAdjustment ? (
              <Picker label="Alternate bell schedule" name="bellScheduleId" value={adjustmentSchedule} onChange={setAdjustmentSchedule} placeholder="Use automatically effective schedule" options={schedules.map((item) => ({ value: item.id, label: item.name, helper: `From ${item.effectiveFrom}` }))} />
            ) : <input type="hidden" name="bellScheduleId" value="" />}
            <div className={canScheduleAdjustment ? "" : "lg:col-span-2"}>
              <label htmlFor="calendar-adjustment-reason" className={formFieldLabelClass}>Reason / authority</label>
              <input id="calendar-adjustment-reason" name="reason" value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} maxLength={500} className={`${inputClass} ${formFieldControlOffsetClass}`} placeholder="For example, Ministry circular moved the school holiday" />
            </div>
            <div className="flex items-end">
              <Button type="submit" loading={adjustmentPending}>Save adjustment</Button>
            </div>
          </form>
        ) : null}

        {overrides.length ? (
          <div className="mt-3 divide-y divide-border-subtle">
            {overrides.map((item) => {
              const isOfficialBaseline = item.source === "national" || item.source === "regional";
              const isSchoolAdjustment = item.source === "school" || item.source === "emergency";
              return (
                <div key={item.id} className="grid gap-2 py-3 sm:grid-cols-[7.5rem_9rem_minmax(0,1fr)_auto] sm:items-center">
                  <span className="text-xs font-medium">{formatDate(item.date)}</span>
                  <div className="space-y-1">
                    <span className="block text-[0.68rem] font-semibold text-brand-strong">{item.impact.replaceAll("_", " ")}</span>
                    <span className={[
                      "inline-flex w-fit rounded-[var(--radius-xs)] px-2 py-0.5 text-[0.62rem] font-semibold",
                      isOfficialBaseline ? "bg-surface-muted text-muted-foreground" : "bg-brand-soft text-brand-strong",
                    ].join(" ")}>
                      {isOfficialBaseline
                        ? `${item.source === "national" ? "National" : "Regional"} baseline`
                        : item.baselineSource
                          ? `School correction · restores ${item.baselineSource}`
                          : "School adjustment"}
                    </span>
                  </div>
                  <span className="text-[0.68rem] leading-5 text-muted-foreground">
                    {item.bellScheduleName ?? item.reason ?? (isOfficialBaseline ? "Official calendar evidence" : "School calendar adjustment")}
                  </span>
                  {canManage ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button type="button" size="sm" variant="ghost" onClick={() => editAdjustment({ date: item.date, impact: item.impact, reason: item.reason })}>
                        <Pencil className="size-3.5" />
                        {isOfficialBaseline ? "Correct" : "Edit"}
                      </Button>
                      {isSchoolAdjustment ? (
                        confirmDeleteDate === item.date ? (
                          <>
                            <form action={deleteAction}>
                              <input type="hidden" name="schoolId" value={schoolId} />
                              <input type="hidden" name="date" value={item.date} />
                              <Button type="submit" size="sm" variant="danger" loading={deletePending}>
                                <Trash2 className="size-3.5" />
                                {item.baselineSource ? "Delete correction" : "Delete"}
                              </Button>
                            </form>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDeleteDate(null)}>
                              <X className="size-3.5" />
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button type="button" size="sm" variant="danger-ghost" onClick={() => setConfirmDeleteDate(item.date)}>
                            <Trash2 className="size-3.5" />
                            Delete
                          </Button>
                        )
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-4 text-xs text-muted-foreground">
            No school-level calendar adjustments are configured for {year}. The national/public baseline remains in effect.
          </div>
        )}
      </div>
      {canManage ? <form action={action} className={showAddEvent ? "mt-5 grid gap-4 lg:grid-cols-2" : "hidden"} aria-hidden={!showAddEvent}>
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
    </section>
  );
}
