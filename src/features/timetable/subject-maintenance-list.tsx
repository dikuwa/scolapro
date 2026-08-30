"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Archive, Pencil, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { retireSubject, updateSubject, type TimetableActionState } from "@/features/timetable/server/actions";
import { Spinner } from "@/components/ui/spinner";

const initialState: TimetableActionState = {};
const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

function SubjectRow({ subject, editing, onEdit, onClose }: { subject: { id: string; code: string; name: string; used: boolean }; editing: boolean; onEdit: () => void; onClose: () => void }) {
  const [state, action, pending] = useActionState(updateSubject, initialState);
  const [retiring, startRetirement] = useTransition();

  useEffect(() => {
    if (!state.message) return;
    state.success ? toast.success(state.message) : toast.error(state.message);
    if (state.success) onClose();
  }, [state, onClose]);

  const retire = () => {
    startRetirement(async () => {
      const formData = new FormData();
      formData.set("subjectId", subject.id);
      const result = await retireSubject(formData);
      result.success ? toast.success(result.message) : toast.error(result.message ?? "Subject could not be removed.");
      if (result.success) onClose();
    });
  };

  return (
    <div className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted/55 px-3 py-2.5">
      {!editing ? (
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 rounded-[var(--radius-xs)] bg-brand-soft px-2 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.04em] text-brand-strong">{subject.code}</span>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{subject.name}</p>
          {subject.used ? <span className="hidden text-[0.65rem] text-muted-foreground sm:inline">In use</span> : null}
          <button type="button" onClick={onEdit} className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]" aria-label={`Edit ${subject.name}`}><Pencil className="size-3.5" aria-hidden="true" /></button>
        </div>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="subjectId" value={subject.id} />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold">Correct subject</p>
            <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-surface hover:text-foreground" aria-label="Close subject editor"><X className="size-4" aria-hidden="true" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[0.36fr_1fr]">
            <div><label htmlFor={`subject-code-${subject.id}`} className="text-xs font-medium">Code</label><input id={`subject-code-${subject.id}`} name="code" defaultValue={subject.code} className={`${fieldClass} mt-1.5 uppercase`} autoCapitalize="characters" />{state.fieldErrors?.code?.[0] ? <p className="mt-1 text-xs text-[color:var(--danger)]">{state.fieldErrors.code[0]}</p> : null}</div>
            <div><label htmlFor={`subject-name-${subject.id}`} className="text-xs font-medium">Subject name</label><input id={`subject-name-${subject.id}`} name="name" defaultValue={subject.name} className={`${fieldClass} mt-1.5`} />{state.fieldErrors?.name?.[0] ? <p className="mt-1 text-xs text-[color:var(--danger)]">{state.fieldErrors.name[0]}</p> : null}</div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
            <button type="button" disabled={retiring} onClick={retire} className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-[color:var(--danger)] transition hover:bg-[color:var(--danger-soft)] disabled:opacity-60">
              {retiring ? <Spinner className="size-3.5" /> : subject.used ? <Archive className="size-3.5" aria-hidden="true" /> : <Trash2 className="size-3.5" aria-hidden="true" />}
              {retiring ? "Working…" : subject.used ? "Archive subject" : "Delete unused subject"}
            </button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="min-h-9 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-muted-foreground transition hover:bg-surface">Cancel</button>
              <button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-9 items-center gap-2 bg-brand px-3 text-xs font-medium text-white hover:bg-brand-strong disabled:opacity-60">{pending ? <Spinner className="size-3.5 text-white" /> : <Save className="size-3.5" aria-hidden="true" />}{pending ? "Saving…" : "Save correction"}</button>
            </div>
          </div>
          {subject.used ? <p className="text-[0.66rem] leading-relaxed text-muted-foreground">This subject already has academic usage. Removing it archives the subject instead of deleting historical offerings or timetable records.</p> : null}
        </form>
      )}
    </div>
  );
}

export function SubjectMaintenanceList({ subjects }: { subjects: { id: string; code: string; name: string; used: boolean }[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  if (!subjects.length) return null;

  return (
    <div className="mt-4 border-t border-border-subtle pt-4">
      <div className="mb-2 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold">Configured subjects</p><p className="mt-0.5 text-[0.66rem] text-muted-foreground">Correct spelling or codes here. Used subjects are archived rather than destroying academic history.</p></div><span className="text-[0.66rem] text-muted-foreground">{subjects.length} active</span></div>
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {subjects.map((subject) => <SubjectRow key={subject.id} subject={subject} editing={editingId === subject.id} onEdit={() => setEditingId(subject.id)} onClose={() => setEditingId(null)} />)}
      </div>
    </div>
  );
}
