"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Pencil, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { deleteRegisterClass, updateRegisterClass, type AcademicStructureState } from "@/features/academics/server/actions";

const initialState: AcademicStructureState = {};
const fieldClass = "min-h-9 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-2.5 text-xs outline-none transition hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

type Grade = { id: string; code: string; name: string };
type RegisterClass = { id: string; code: string; name: string; gradeId: string };

export function ClassManagement({ grades, classes }: { grades: Grade[]; classes: RegisterClass[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [state, action, pending] = useActionState(updateRegisterClass, initialState);
  const [deletePending, startDelete] = useTransition();
  const [editGradeId, setEditGradeId] = useState("");

  useEffect(() => {
    if (!state.message) return;
    state.success ? toast.success(state.message) : toast.error(state.message);
    if (state.success) setEditingId(null);
  }, [state]);

  return (
    <div className="mt-4 divide-y divide-border-subtle">
      {grades.map((grade) => {
        const gradeClasses = classes.filter((item) => item.gradeId === grade.id);
        const normalizedCode = /^\d+$/.test(grade.code) ? `G${grade.code}` : grade.code.toUpperCase();
        return (
          <div key={grade.id} className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(10rem,0.32fr)_1fr] sm:items-start">
            <div>
              <p className="scolapro-record-title">{grade.name}</p>
              <p className="mt-0.5 text-[0.68rem] font-medium uppercase tracking-[0.05em] text-muted-foreground">{normalizedCode}</p>
            </div>
            <div className="space-y-2">
              {gradeClasses.length ? gradeClasses.map((item) => {
                const editing = editingId === item.id;
                if (editing) {
                  return (
                    <form key={item.id} action={action} className="grid gap-2 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:grid-cols-[0.8fr_1fr_1fr_auto] sm:items-end">
                      <input type="hidden" name="classId" value={item.id} />
                      <Picker label="Grade" name="gradeId" value={editGradeId || item.gradeId} onChange={setEditGradeId} placeholder="Choose grade" options={grades.map((option) => ({ value: option.id, label: option.name }))} />
                      <div><label className="text-xs font-medium" htmlFor={`code-${item.id}`}>Class code</label><input id={`code-${item.id}`} name="classCode" defaultValue={item.code.toUpperCase()} className={`${fieldClass} mt-1.5 uppercase`} /></div>
                      <div><label className="text-xs font-medium" htmlFor={`name-${item.id}`}>Display name</label><input id={`name-${item.id}`} name="displayName" defaultValue={item.name} className={`${fieldClass} mt-1.5`} /></div>
                      <div className="flex gap-1.5">
                        <button type="submit" disabled={pending} aria-label="Save class changes" className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-brand text-white hover:bg-brand-strong disabled:opacity-60">{pending ? <Spinner className="size-3.5 text-white" /> : <Save className="size-3.5" />}</button>
                        <button type="button" onClick={() => setEditingId(null)} aria-label="Cancel editing" className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-surface text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
                      </div>
                    </form>
                  );
                }
                return (
                  <div key={item.id} className="flex min-h-10 items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2">
                    <div className="min-w-0"><p className="text-xs font-medium">{item.name}</p><p className="mt-0.5 text-[0.68rem] uppercase tracking-[0.04em] text-muted-foreground">{item.code}</p></div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => { setEditingId(item.id); setEditGradeId(item.gradeId); }} aria-label={`Edit ${item.name}`} className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-surface hover:text-brand-strong"><Pencil className="size-3.5" /></button>
                      <button type="button" disabled={deletePending} onClick={() => startDelete(async () => {
                        const formData = new FormData(); formData.set("classId", item.id);
                        const result = await deleteRegisterClass(formData);
                        result.success ? toast.success(result.message) : toast.error(result.message);
                      })} aria-label={`Delete ${item.name}`} className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-danger-soft hover:text-[color:var(--danger)] disabled:opacity-50"><Trash2 className="size-3.5" /></button>
                    </div>
                  </div>
                );
              }) : <p className="py-2 text-xs text-muted-foreground">No register classes yet</p>}
            </div>
          </div>
        );
      })}
      {!grades.length ? <div className="py-8 text-center text-sm text-muted-foreground">Add the first grade to begin academic setup.</div> : null}
    </div>
  );
}
