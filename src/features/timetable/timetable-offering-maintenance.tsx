"use client";

import { useActionState, useEffect, useState } from "react";
import { BookOpenCheck, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { saveOffering, type TimetableActionState } from "@/features/timetable/server/actions";
import type { TimetableWorkspace } from "@/features/timetable/server/workspace";

const initialState: TimetableActionState = {};

export function TimetableOfferingMaintenance({ schoolId, academicYear, offerings }: { schoolId: string; academicYear: number; offerings: TimetableWorkspace["offerings"] }) {
  const [state, action, pending] = useActionState(saveOffering, initialState);
  const [offeringId, setOfferingId] = useState("");
  const [periods, setPeriods] = useState("");

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  const selected = offerings.find((offering) => offering.id === offeringId) ?? null;
  const selectOffering = (value: string) => {
    setOfferingId(value);
    const offering = offerings.find((item) => item.id === value);
    setPeriods(offering ? String(offering.periodsPerCycle) : "");
  };
  const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)] disabled:cursor-not-allowed disabled:opacity-55";
  const periodCount = Number(periods);
  const validPeriodCount = Number.isInteger(periodCount) && periodCount >= 1 && periodCount <= 30;

  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-start gap-2.5 border-b border-border-subtle pb-4">
        <span className="scolapro-tone-brand grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"><PencilLine className="size-4" aria-hidden="true" /></span>
        <div><h2 className="scolapro-section-title">Offering corrections</h2><p className="scolapro-section-description !mt-0 max-w-2xl">Adjust how many periods per cycle an existing subject offering requires. The subject, grade and linked teacher allocations stay unchanged.</p></div>
      </div>

      {offerings.length ? (
        <form action={action} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.42fr)] sm:items-end">
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="academicYear" value={academicYear} />
          <input type="hidden" name="subjectId" value={selected?.subjectId ?? ""} />
          <input type="hidden" name="gradeId" value={selected?.gradeId ?? ""} />
          <Picker
            label="Existing subject offering"
            name="offering-maintenance-picker"
            value={offeringId}
            onChange={selectOffering}
            placeholder="Choose an offering to correct"
            options={offerings.map((offering) => ({ value: offering.id, label: offering.subjectName, helper: `${offering.gradeName} · ${offering.periodsPerCycle} periods/cycle` }))}
            searchable
            searchPlaceholder="Search subject or grade"
          />
          <div>
            <label htmlFor="offering-maintenance-periods" className="text-xs font-medium">Periods per cycle</label>
            <input id="offering-maintenance-periods" name="periods" type="number" min="1" max="30" value={periods} onChange={(event) => setPeriods(event.target.value)} disabled={!selected || pending} className={`${fieldClass} mt-1.5`} />
          </div>
          <div className="sm:col-span-2 flex flex-col gap-2 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="inline-flex items-center gap-1.5 text-[0.68rem] leading-relaxed text-muted-foreground"><BookOpenCheck className="size-3.5 shrink-0" aria-hidden="true" />This changes the planning target only; it does not rebuild allocations or scheduled timetable slots automatically.</p>
            <button type="submit" disabled={!selected || !validPeriodCount || pending} className="inline-flex min-h-9 w-fit shrink-0 items-center gap-2 rounded-[var(--radius-xs)] bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50">{pending ? <Spinner className="size-3.5 text-white" /> : <PencilLine className="size-3.5" aria-hidden="true" />}{pending ? "Saving…" : "Update offering"}</button>
          </div>
        </form>
      ) : (
        <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-7 text-center"><p className="text-sm font-medium">No offerings to correct</p><p className="mt-1 text-xs text-muted-foreground">Create a subject offering in the timetable builder above first.</p></div>
      )}
    </section>
  );
}
