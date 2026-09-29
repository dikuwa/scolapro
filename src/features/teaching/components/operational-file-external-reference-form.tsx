"use client";

import { useActionState, useEffect, useState } from "react";
import { Link2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  addTeacherOperationalFileExternalReference,
  type OperationalFileReferenceActionState,
} from "@/features/teaching/server/operational-file-resource-actions";

const initialState: OperationalFileReferenceActionState = { success: false, message: "" };

export function OperationalFileExternalReferenceForm({
  templateItemId,
  title,
}: {
  templateItemId: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addTeacherOperationalFileExternalReference, initialState);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      setOpen(false);
    } else {
      toast.error(state.message);
    }
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="scolapro-cta mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-2.5 text-[0.68rem] font-medium hover:bg-surface-muted"
      >
        <Plus className="size-3" aria-hidden="true" />
        Add external reference
      </button>
    );
  }

  return (
    <form action={action} className="mt-2 space-y-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-2.5">
      <input type="hidden" name="templateItemId" value={templateItemId} />
      <input type="hidden" name="title" value={title} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.68rem] font-semibold">Teacher external reference</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close external reference form"
          className="grid size-7 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <label className="block text-[0.68rem] font-medium">
        Provider / source
        <input
          name="provider"
          required
          maxLength={120}
          placeholder="NIED, Ministry, School, Google Drive…"
          className="mt-1 min-h-9 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-2.5 text-xs outline-none focus:ring-4 focus:ring-[color:var(--brand-soft)]"
        />
      </label>
      <label className="block text-[0.68rem] font-medium">
        HTTPS URL
        <span className="relative mt-1 block">
          <Link2 className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            name="url"
            type="url"
            required
            pattern="https://.*"
            placeholder="https://…"
            className="min-h-9 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated pl-8 pr-2.5 text-xs outline-none focus:ring-4 focus:ring-[color:var(--brand-soft)]"
          />
        </span>
      </label>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="scolapro-cta inline-flex min-h-8 items-center rounded-[var(--radius-sm)] bg-brand px-3 text-[0.68rem] font-semibold text-white disabled:opacity-55"
        >
          {pending ? "Saving…" : "Save reference"}
        </button>
      </div>
      {state.message ? <p aria-live="polite" className="text-[0.68rem] text-muted-foreground">{state.message}</p> : null}
    </form>
  );
}
