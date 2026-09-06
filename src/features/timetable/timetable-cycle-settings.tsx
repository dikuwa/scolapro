"use client";

import { useActionState, useEffect, useState } from "react";
import { CalendarRange, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { saveTimetableCycleSettings } from "@/features/timetable/server/cycle-actions";
import type { TimetableActionState } from "@/features/timetable/server/actions";
import type { TimetableCycleMode } from "@/features/timetable/day-labels";

const initialState: TimetableActionState = {};
const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

export function TimetableCycleSettings({
  schoolId,
  initialMode,
  initialLength,
}: {
  schoolId: string;
  initialMode: TimetableCycleMode;
  initialLength: number;
}) {
  const [state, action, pending] = useActionState(saveTimetableCycleSettings, initialState);
  const [mode, setMode] = useState<TimetableCycleMode>(initialMode);
  const [length, setLength] = useState(initialLength);
  const maxLength = mode === "weekday" ? 7 : 10;

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  useEffect(() => {
    if (length > maxLength) setLength(maxLength);
  }, [length, maxLength]);

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
          onChange={(value) => setMode(value === "rotating" ? "rotating" : "weekday")}
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
            onChange={(event) => setLength(Math.max(1, Math.min(maxLength, Number(event.target.value) || 1)))}
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
          ? `This timetable will use Day 1 through Day ${length}. Calendar-date-to-cycle-day resolution remains a separate governed calendar feature so holidays and closures can be handled correctly.`
          : `This timetable will use real weekday labels from Monday through ${["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][length - 1]}.`}
      </div>
    </section>
  );
}
