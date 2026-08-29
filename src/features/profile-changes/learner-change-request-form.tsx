"use client";

import { useActionState, useEffect, useState } from "react";
import { FilePenLine, Send } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { submitLearnerProfileChange, type ProfileChangeActionState } from "@/features/profile-changes/server/actions";

const initialState: ProfileChangeActionState = {};
const fields = [
  ["first_names", "First names"],
  ["surname", "Surname"],
  ["preferred_name", "Preferred name"],
  ["date_of_birth", "Date of birth (YYYY-MM-DD)"],
  ["sex", "Sex"],
  ["national_id", "National ID"],
  ["birth_certificate_number", "Birth certificate number"],
] as const;

export function LearnerChangeRequestForm({ learnerId }: { learnerId: string }) {
  const [state, action, pending] = useActionState(submitLearnerProfileChange, initialState);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!state.message) return;
    state.success ? toast.success(state.message) : toast.error(state.message);
    if (state.success) setOpen(false);
  }, [state]);

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-surface-muted px-3 text-xs font-semibold text-foreground transition hover:bg-brand-soft hover:text-brand-strong"><FilePenLine className="size-4" />Request a data correction</button>;
  }

  return (
    <form action={action} className="mt-3 space-y-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted p-3">
      <input type="hidden" name="learnerId" value={learnerId} />
      <div>
        <label htmlFor="profile-field" className="text-xs font-medium">Field to correct</label>
        <select id="profile-field" name="fieldKey" required className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-sm outline-none focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]">
          {fields.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="profile-value" className="text-xs font-medium">Correct value</label>
        <input id="profile-value" name="proposedValue" required className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-sm outline-none focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" />
      </div>
      <div>
        <label htmlFor="profile-reason" className="text-xs font-medium">Reason / source</label>
        <textarea id="profile-reason" name="reason" rows={2} placeholder="For example: verified against learner file or parent-provided document" className="mt-1.5 w-full resize-none rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-3 text-xs outline-none focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white disabled:opacity-60">{pending ? <Spinner className="size-3.5 text-white" /> : <Send className="size-3.5" />}{pending ? "Submitting…" : "Submit for review"}</button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)} className="min-h-9 rounded-[var(--radius-sm)] bg-surface px-3 text-xs font-semibold text-muted-foreground shadow-[var(--shadow-xs)]">Cancel</button>
      </div>
    </form>
  );
}