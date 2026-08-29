"use client";

import { useActionState, useEffect, useState } from "react";
import { FileText, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { submitAbsenceNotice, reasonLabels, type AbsenceActionState } from "@/features/parents/server/absence-actions";

const initialState: AbsenceActionState = {};
const categories = Object.entries(reasonLabels).map(([value, label]) => ({ value, label }));

export function AbsenceNoticeForm({ learnerId, learnerName, today }: { learnerId: string; learnerName: string; today: string }) {
  const [state, action, pending] = useActionState(submitAbsenceNotice, initialState);
  const [reasonCategory, setReasonCategory] = useState("illness");
  const [absenceFrom, setAbsenceFrom] = useState(today);
  const [absenceTo, setAbsenceTo] = useState(today);

  useEffect(() => {
    if (!state.message) return;
    state.success ? toast.success(state.message) : toast.error(state.message);
  }, [state]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="learnerId" value={learnerId} />
      <input type="hidden" name="absenceFrom" value={absenceFrom} />
      <input type="hidden" name="absenceTo" value={absenceTo} />
      <input type="hidden" name="reasonCategory" value={reasonCategory} />

      <div className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2.5">
        <p className="text-xs font-medium">{learnerName}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DateField label="Absence start date" name="absenceFrom-ui" value={absenceFrom} onChange={setAbsenceFrom} required max={today} />
        <DateField label="Absence end date" name="absenceTo-ui" value={absenceTo} onChange={setAbsenceTo} required max={today} />
      </div>

      <Picker label="Reason" name="reasonCategory-ui" value={reasonCategory} onChange={setReasonCategory} placeholder="Choose reason" options={categories} />

      <div>
        <label className="text-xs font-medium" htmlFor="absence-message">Note</label>
        <textarea id="absence-message" name="message" rows={3} placeholder="Optional additional context"
          className="mt-1.5 w-full resize-none rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3 text-xs outline-none shadow-[var(--shadow-xs)] placeholder:text-muted-foreground/65 focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" />
      </div>

      <div>
        <input id="absence-file" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" />
        <label htmlFor="absence-file" className="flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-border bg-surface-muted px-4 text-center hover:bg-brand-soft/40">
          <FileText className="size-5 text-brand" />
          <span className="text-xs font-medium">Attach supporting document (optional)</span>
          <span className="text-[0.68rem] text-muted-foreground">JPG, PNG, WebP or PDF up to 10 MB</span>
        </label>
      </div>

      <button type="submit" disabled={pending}
        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? <Spinner className="size-4 text-white" /> : <ShieldCheck className="size-4" />}
        {pending ? "Submitting…" : "Submit absence notice"}
      </button>
    </form>
  );
}
