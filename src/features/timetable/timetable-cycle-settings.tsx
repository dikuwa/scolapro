"use client";

import { useActionState, useEffect, useState } from "react";
import { CalendarDays, CalendarRange } from "lucide-react";
import { toast } from "sonner";
import { DateField } from "@/components/ui/date-field";
import {
  FormActionSlot,
  FormFieldFeedback,
  formFieldLabelClass,
} from "@/components/ui/form-field-layout";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { saveTimetableCycleAnchor, saveTimetableCycleSettings } from "@/features/timetable/server/cycle-actions";
import type { TimetableActionState } from "@/features/timetable/server/actions";
import type { TimetableCycleMode } from "@/features/timetable/day-labels";

const initialState: TimetableActionState = {};
const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

/**
 * Timetable workflow editor.
 *
 * Renders the day-system and cycle-length controls only. The surrounding
 * "Timetable workflow" card owns the title, description and action, so this
 * component must never repeat that heading or wrap itself in a second card.
 */
export function TimetableWorkflowSettings({
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
  const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  const changeMode = (value: string) => {
    const nextMode: TimetableCycleMode = value === "rotating" ? "rotating" : "weekday";
    setMode(nextMode);
    const nextMax = nextMode === "weekday" ? 7 : 10;
    setLength((current) => Math.min(current, nextMax));
  };

  const changeLength = (value: number) => {
    const nextLength = Math.max(1, Math.min(maxLength, value || 1));
    setLength(nextLength);
  };

  return (
    <div>
      <form action={action} className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.35fr)]">
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
          <label htmlFor="timetable-cycle-length" className={formFieldLabelClass}>Cycle length</label>
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
          <FormFieldFeedback
            helper={`Maximum ${maxLength} ${mode === "weekday" ? "weekdays" : "cycle days"}.`}
            error={state.fieldErrors?.cycleLength?.[0]}
          />
        </div>
        <FormActionSlot className="sm:col-span-2">
          <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60">
            {pending ? <Spinner className="size-4 text-white" /> : <CalendarRange className="size-4" aria-hidden="true" />}
            {pending ? "Saving…" : "Save workflow"}
          </button>
        </FormActionSlot>
      </form>

      <p className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2.5 text-[0.68rem] leading-relaxed text-muted-foreground">
        {mode === "rotating"
          ? `This timetable uses Day 1 through Day ${length}. Set one real school date as the cycle anchor below; closures and holidays are then skipped when resolving later dates.`
          : `This timetable uses real weekday labels from Monday through ${weekdayNames[length - 1]}.`}
      </p>
    </div>
  );
}

/**
 * Calendar anchor editor for rotating cycles.
 *
 * Renders the anchor date and cycle-day controls only. The surrounding
 * "Calendar anchor" card owns the title, description and action, so this
 * component must never render a second "Timetable workflow" panel or heading.
 */
export function TimetableCalendarAnchorSettings({
  schoolId,
  academicYear,
  cycleLength,
  initialAnchorDate,
  initialAnchorDay,
}: {
  schoolId: string;
  academicYear: number;
  cycleLength: number;
  initialAnchorDate: string | null;
  initialAnchorDay: number | null;
}) {
  const [anchorState, anchorAction, anchorPending] = useActionState(saveTimetableCycleAnchor, initialState);
  const [anchorDate, setAnchorDate] = useState(initialAnchorDate ?? "");
  const [anchorDay, setAnchorDay] = useState(initialAnchorDay ?? 1);
  const boundedLength = Math.max(1, cycleLength);

  useEffect(() => {
    if (!anchorState.message) return;
    if (anchorState.success) toast.success(anchorState.message);
    else toast.error(anchorState.message);
  }, [anchorState]);

  return (
    <div>
      <form action={anchorAction} className="grid items-start gap-4 sm:grid-cols-[minmax(12rem,0.65fr)_minmax(9rem,0.35fr)]">
        <input type="hidden" name="schoolId" value={schoolId} />
        <input type="hidden" name="academicYear" value={academicYear} />
        <DateField
          label="Known school date"
          name="anchorDate"
          value={anchorDate}
          onChange={setAnchorDate}
          required
          error={anchorState.fieldErrors?.anchorDate?.[0]}
        />
        <div>
          <label htmlFor="timetable-cycle-anchor-day" className={formFieldLabelClass}>Cycle day</label>
          <input
            id="timetable-cycle-anchor-day"
            name="anchorDay"
            type="number"
            min="1"
            max={boundedLength}
            value={anchorDay}
            onChange={(event) => setAnchorDay(Math.max(1, Math.min(boundedLength, Number(event.target.value) || 1)))}
            className={`${fieldClass} mt-1.5`}
          />
          <FormFieldFeedback
            helper={`Day 1 to Day ${boundedLength}.`}
            error={anchorState.fieldErrors?.anchorDay?.[0]}
          />
        </div>
        <FormActionSlot className="sm:col-span-2">
          <button type="submit" disabled={anchorPending} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60">
            {anchorPending ? <Spinner className="size-4 text-white" /> : <CalendarDays className="size-4" aria-hidden="true" />}
            {anchorPending ? "Saving…" : initialAnchorDate ? "Update anchor" : "Save anchor"}
          </button>
        </FormActionSlot>
      </form>

      {initialAnchorDate && initialAnchorDay ? (
        <p className="mt-3 text-xs text-muted-foreground">Current {academicYear} anchor: <span className="font-medium text-foreground">{initialAnchorDate} = Day {initialAnchorDay}</span>.</p>
      ) : (
        <p className="mt-3 text-xs text-[color:var(--accent-amber)]">No {academicYear} calendar anchor is configured yet. The numbered timetable can still be built, but date-to-Day-N resolution remains unavailable until this is set.</p>
      )}
    </div>
  );
}
