"use client";

import { useActionState, useEffect, useState } from "react";
import { Clock3, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { Picker, TimePicker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { savePeriod, type TimetableActionState } from "@/features/timetable/server/actions";
import type { TimetableWorkspace } from "@/features/timetable/server/workspace";

const initialState: TimetableActionState = {};

function normalizeTime(value: string | null) {
  return value ? value.slice(0, 5) : "";
}

export function TimetablePeriodMaintenance({ schoolId, academicYear, periods }: { schoolId: string; academicYear: number; periods: TimetableWorkspace["periods"] }) {
  const [state, action, pending] = useActionState(savePeriod, initialState);
  const [periodId, setPeriodId] = useState("");
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  const selected = periods.find((period) => period.id === periodId) ?? null;
  const selectPeriod = (value: string) => {
    setPeriodId(value);
    const period = periods.find((item) => item.id === value);
    setName(period?.name ?? "");
    setStart(normalizeTime(period?.startsAt ?? null));
    setEnd(normalizeTime(period?.endsAt ?? null));
  };
  const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)] disabled:cursor-not-allowed disabled:opacity-55";

  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-start gap-2.5 border-b border-border-subtle pb-4">
        <span className="scolapro-tone-amber grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"><PencilLine className="size-4" aria-hidden="true" /></span>
        <div><h2 className="scolapro-section-title">Period corrections</h2><p className="scolapro-section-description !mt-0 max-w-2xl">Select an existing teaching period to correct its label or times. Timetable links remain attached to the same period record.</p></div>
      </div>

      {periods.length ? (
        <form action={action} className="mt-4 grid gap-3 md:grid-cols-2 md:items-end">
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="academicYear" value={academicYear} />
          <input type="hidden" name="number" value={selected?.number ?? ""} />
          <Picker
            label="Existing period"
            name="period-maintenance-picker"
            value={periodId}
            onChange={selectPeriod}
            placeholder="Choose a period to correct"
            options={periods.map((period) => ({
              value: period.id,
              label: `${period.number}. ${period.name}`,
              helper: period.startsAt && period.endsAt ? `${normalizeTime(period.startsAt)}–${normalizeTime(period.endsAt)}` : "Times not set",
            }))}
          />
          <div>
            <label htmlFor="period-maintenance-name" className="text-xs font-medium">Display name</label>
            <input id="period-maintenance-name" name="name" value={name} onChange={(event) => setName(event.target.value)} disabled={!selected || pending} placeholder="Period 1" className={`${fieldClass} mt-1.5`} />
          </div>
          <TimePicker label="Starts" name="startsAt" value={start} onChange={setStart} />
          <TimePicker label="Ends" name="endsAt" value={end} onChange={setEnd} />
          <div className="md:col-span-2 flex flex-col gap-2 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="inline-flex items-center gap-1.5 text-[0.68rem] leading-relaxed text-muted-foreground"><Clock3 className="size-3.5 shrink-0" aria-hidden="true" />Changing a period updates the shared timetable definition; existing slots continue referencing it.</p>
            <button type="submit" disabled={!selected || !name.trim() || pending} className="inline-flex min-h-9 w-fit shrink-0 items-center gap-2 rounded-[var(--radius-xs)] bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50">{pending ? <Spinner className="size-3.5 text-white" /> : <PencilLine className="size-3.5" aria-hidden="true" />}{pending ? "Saving…" : "Update period"}</button>
          </div>
        </form>
      ) : (
        <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-7 text-center"><p className="text-sm font-medium">No periods to correct</p><p className="mt-1 text-xs text-muted-foreground">Add the first teaching period in the timetable builder above.</p></div>
      )}
    </section>
  );
}
