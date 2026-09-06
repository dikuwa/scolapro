"use client";

import { useActionState, useEffect, useState } from "react";
import { CalendarDays, CalendarRange, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { saveTimetableCycleAnchor, saveTimetableCycleSettings } from "@/features/timetable/server/cycle-actions";
import type { TimetableActionState } from "@/features/timetable/server/actions";
import type { TimetableCycleMode } from "@/features/timetable/day-labels";

const initialState: TimetableActionState = {};
const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

export function TimetableCycleSettings({
  schoolId,
  academicYear,
  initialMode,
  initialLength,
  initialAnchorDate,
  initialAnchorDay,
}: {
  schoolId: string;
  academicYear: number;
  initialMode: TimetableCycleMode;
  initialLength: number;
  initialAnchorDate: string | null;
  initialAnchorDay: number | null;
}) {
  const [state, action, pending] = useActionState(saveTimetableCycleSettings, initialState);
  const [anchorState, anchorAction, anchorPending] = useActionState(saveTimetableCycleAnchor, initialState);
  const [mode, setMode] = useState<TimetableCycleMode>(initialMode);
  const [length, setLength] = useState(initialLength);
  const [anchorDay, setAnchorDay] = useState(initialAnchorDay ?? 1);
  const maxLength = mode === "weekday" ? 7 : 10;

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  useEffect(() => {
    if (!anchorState.message) return;
    if (anchorState.success) toast.success(anchorState.message);
    else toast.error(anchorState.message);
  }, [anchorState]);

  const changeMode = (value: string) => {
    const nextMode: TimetableCycleMode = value === "rotating" ? "rotating" : "weekday";
    setMode(nextMode);
    const nextMax = nextMode === "weekday" ? 7 : 10;
    setLength((current) => Math.min(current, nextMax));
  };

  const changeLength = (value: number) => {
    const nextLength = Math.max(1, Math.min(maxLength, value || 1));
    setLength(nextLength);
    setAnchorDay((current) => Math.min(current, nextLength));
  };

  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-start gap-2.5">
        <span className="scolapro-tone-sky grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"><CalendarRange className="size-4" aria-hidden="true" /></span>
        <div>
          <h2 className="scolapro-section-title">Timetable workflow</h2>
          <p className="scolapro-section-description !mt-0 max-w-2xl">Choose whether this school runs on normal weekday names or a numbered rotating timetable cycle. Existing schools stay Monday-Friday unless changed here.</p>
        </div>
      </div>

      <form action={action} className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.35fr)_auto] sm:items-end">
        <input type="hidden" name="schoolId" value={schoolId} />
        <Picker
          label="Day system"
          name="cycleMode"
          value={mode}
          onChange={changeMode}
          placeholder="Choose timetable day system"
          options={[
            { value: "weekday", label: "Standard week", helper: "Monday, Tuesday, Wednesday…" },
            { value: "rotating", label: "Rotating cycle", helper: "Day 1, Day 2… up to Day 10" },
          ]}
        />
        <div>
          <label htmlFor="timetable-cycle-length" className="text-xs font-medium">Cycle length</label>
          <input
            id="timetable-cycle-length"
            name="cycleLength"
            type="number"
            min="1"
            max={maxLength}
            value={length}
            onChange={(event) => changeLength(Number(event.target.value))}
            className={`${fieldClass} mt-1.5`}
          />
          <p className="mt-1 text-[0.68rem] text-muted-foreground">Maximum {maxLength} {mode === "weekday" ? "weekdays" : "cycle days"}.</p>
          {state.fieldErrors?.cycleLength?.[0] ? <p className="mt-1 text-xs text-[color:var(--danger)]">{state.fieldErrors.cycleLength[0]}</p> : null}
        </div>
        <button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60">
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CalendarRange className="size-4" aria-hidden="true" />}
          {pending ? "Saving…" : "Save workflow"}
        </button>
      </form>

      <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2.5 text-[0.68rem] leading-relaxed text-muted-foreground">
        {mode === "rotating"
          ? `This timetable uses Day 1 through Day ${length}. Set one real school date below as the cycle anchor; closures and holidays will then be skipped when resolving later dates.`
          : `This timetable uses real weekday labels from Monday through ${["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][length - 1]}.`}
      </div>

      {mode === "rotating" ? (
        <div className="mt-5 border-t border-border-subtle pt-5">
          <div className="flex items-start gap-2.5">
            <span className="scolapro-tone-mint grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"><CalendarDays className="size-4" aria-hidden="true" /></span>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Calendar anchor</h3>
              <p className="mt-0.5 max-w-2xl text-xs leading-5 text-muted-foreground">For {academicYear}, choose a known school date and the rotating day printed on the timetable for that date. ScolaPro uses this anchor plus school-day overrides to resolve other calendar dates.</p>
            </div>
          </div>

          <form action={anchorAction} className="mt-4 grid gap-4 sm:grid-cols-[minmax(12rem,0.65fr)_minmax(9rem,0.35fr)_auto] sm:items-end">
            <input type="hidden" name="schoolId" value={schoolId} />
            <input type="hidden" name="academicYear" value={academicYear} />
            <div>
              <label htmlFor="timetable-cycle-anchor-date" className="text-xs font-medium">Known school date</label>
              <input
                id="timetable-cycle-anchor-date"
                name="anchorDate"
                type="date"
                defaultValue={initialAnchorDate ?? ""}
                required
                className={`${fieldClass} mt-1.5`}
              />
              {anchorState.fieldErrors?.anchorDate?.[0] ? <p className="mt-1 text-xs text-[color:var(--danger)]">{anchorState.fieldErrors.anchorDate[0]}</p> : null}
            </div>
            <div>
              <label htmlFor="timetable-cycle-anchor-day" className="text-xs font-medium">Cycle day</label>
              <input
                id="timetable-cycle-anchor-day"
                name="anchorDay"
                type="number"
                min="1"
                max={length}
                value={anchorDay}
                onChange={(event) => setAnchorDay(Math.max(1, Math.min(length, Number(event.target.value) || 1)))}
                className={`${fieldClass} mt-1.5`}
              />
              <p className="mt-1 text-[0.68rem] text-muted-foreground">Day 1 to Day {length}.</p>
              {anchorState.fieldErrors?.anchorDay?.[0] ? <p className="mt-1 text-xs text-[color:var(--danger)]">{anchorState.fieldErrors.anchorDay[0]}</p> : null}
            </div>
            <button type="submit" disabled={anchorPending} className="scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60">
              {anchorPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CalendarDays className="size-4" aria-hidden="true" />}
              {anchorPending ? "Saving…" : initialAnchorDate ? "Update anchor" : "Save anchor"}
            </button>
          </form>

          {initialAnchorDate && initialAnchorDay ? (
            <p className="mt-3 text-xs text-muted-foreground">Current {academicYear} anchor: <span className="font-medium text-foreground">{initialAnchorDate} = Day {initialAnchorDay}</span>.</p>
          ) : (
            <p className="mt-3 text-xs text-[color:var(--accent-amber)]">No {academicYear} calendar anchor is configured yet. The numbered timetable can still be built, but date-to-Day-N resolution remains unavailable until this is set.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
