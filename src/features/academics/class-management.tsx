"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Pencil, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { deleteGrade, deleteRegisterClass, updateGrade, updateRegisterClass, type AcademicStructureState } from "@/features/academics/server/actions";

const initialState: AcademicStructureState = {};
const fieldClass = "min-h-9 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-2.5 text-xs outline-none transition hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

type Grade = { id: string; code: string; name: string };
type RegisterClass = { id: string; code: string; name: string; gradeId: string };

function numericPart(value: string) { const match = value.match(/\d+/); return match ? Number(match[0]) : Number.NEGATIVE_INFINITY; }
function naturalCompare(a: string, b: string) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }); }

export function ClassManagement({ grades, classes }: { grades: Grade[]; classes: RegisterClass[] }) {
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editingGradeId, setEditingGradeId] = useState<string | null>(null);
  const [expandedGradeIds, setExpandedGradeIds] = useState<Set<string>>(() => new Set());
  const [classState, classAction, classPending] = useActionState(updateRegisterClass, initialState);
  const [gradeState, gradeAction, gradePending] = useActionState(updateGrade, initialState);
  const [deletePending, startDelete] = useTransition();
  const [classGradeId, setClassGradeId] = useState("");

  const orderedGrades = useMemo(() => [...grades].sort((a, b) => {
    const numberDelta = numericPart(b.name || b.code) - numericPart(a.name || a.code);
    return numberDelta || naturalCompare(a.name, b.name);
  }), [grades]);
  const orderedClasses = useMemo(() => [...classes].sort((a, b) => naturalCompare(a.name || a.code, b.name || b.code)), [classes]);

  useEffect(() => {
    if (!classState.message) return;
    if (classState.success) {
      toast.success(classState.message);
      queueMicrotask(() => { setEditingClassId(null); setClassGradeId(""); });
    } else toast.error(classState.message);
  }, [classState]);

  useEffect(() => {
    if (!gradeState.message) return;
    if (gradeState.success) { toast.success(gradeState.message); queueMicrotask(() => setEditingGradeId(null)); }
    else toast.error(gradeState.message);
  }, [gradeState]);

  function toggleGrade(gradeId: string) {
    setExpandedGradeIds((current) => {
      const next = new Set(current);
      if (next.has(gradeId)) next.delete(gradeId); else next.add(gradeId);
      return next;
    });
  }

  function expandGrade(gradeId: string) {
    setExpandedGradeIds((current) => new Set(current).add(gradeId));
  }

  return (
    <div className="mt-4 divide-y divide-border-subtle">
      {orderedGrades.map((grade) => {
        const gradeClasses = orderedClasses.filter((item) => item.gradeId === grade.id);
        const normalizedCode = /^\d+$/.test(grade.code) ? `G${grade.code}` : grade.code.toUpperCase();
        const editingGrade = editingGradeId === grade.id;
        const expanded = expandedGradeIds.has(grade.id) || gradeClasses.some((item) => item.id === editingClassId);

        return (
          <div key={grade.id} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex min-h-12 items-center gap-2 rounded-[var(--radius-sm)] px-1 transition hover:bg-surface-muted/55">
              <button type="button" onClick={() => toggleGrade(grade.id)} aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${grade.name} classes`} className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface hover:text-foreground">
                {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </button>

              {editingGrade ? (
                <form action={gradeAction} className="grid min-w-0 flex-1 gap-2 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:grid-cols-[9rem_1fr_auto] sm:items-end">
                  <input type="hidden" name="gradeId" value={grade.id} />
                  <div><label className="text-xs font-medium" htmlFor={`grade-code-${grade.id}`}>Grade code</label><input id={`grade-code-${grade.id}`} name="gradeCode" defaultValue={normalizedCode} className={`${fieldClass} mt-1 uppercase`} /></div>
                  <div><label className="text-xs font-medium" htmlFor={`grade-name-${grade.id}`}>Display name</label><input id={`grade-name-${grade.id}`} name="displayName" defaultValue={grade.name} className={`${fieldClass} mt-1`} /></div>
                  <div className="flex items-center gap-2"><button type="submit" disabled={gradePending} className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-brand px-2.5 text-[0.7rem] font-semibold text-white disabled:opacity-60">{gradePending ? <Spinner className="size-3.5 text-white" /> : <Save className="size-3.5" />}Save</button><button type="button" onClick={() => setEditingGradeId(null)} className="min-h-8 rounded-[var(--radius-xs)] px-2.5 text-[0.7rem] font-medium text-muted-foreground hover:bg-surface">Cancel</button></div>
                </form>
              ) : (
                <>
                  <button type="button" onClick={() => toggleGrade(grade.id)} className="min-w-0 flex-1 text-left">
                    <span className="scolapro-record-title block truncate">{grade.name}</span>
                    <span className="mt-0.5 block text-[0.68rem] text-muted-foreground">{normalizedCode} · {gradeClasses.length} register class{gradeClasses.length === 1 ? "" : "es"}</span>
                  </button>
                  <div className="flex shrink-0 gap-0.5"><button type="button" onClick={() => { expandGrade(grade.id); setEditingGradeId(grade.id); }} aria-label={`Edit ${grade.name}`} className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-surface hover:text-brand-strong"><Pencil className="size-3.5" /></button><button type="button" disabled={deletePending} onClick={() => startDelete(async () => { const formData = new FormData(); formData.set("gradeId", grade.id); const result = await deleteGrade(formData); result.success ? toast.success(result.message) : toast.error(result.message); })} aria-label={`Delete ${grade.name}`} className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-danger-soft hover:text-[color:var(--danger)] disabled:opacity-50"><Trash2 className="size-3.5" /></button></div>
                </>
              )}
            </div>

            {expanded ? (
              <div className="ml-10 mt-2 space-y-2 border-l border-border-subtle pl-3 sm:ml-12">
                {gradeClasses.length ? gradeClasses.map((item) => {
                  const editing = editingClassId === item.id;
                  if (editing) return <form key={item.id} action={classAction} className="grid gap-2 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:grid-cols-[0.8fr_1fr_1fr_auto] sm:items-end"><input type="hidden" name="classId" value={item.id} /><Picker label="Grade" name="gradeId" value={classGradeId || item.gradeId} onChange={setClassGradeId} placeholder="Choose grade" options={orderedGrades.map((option) => ({ value: option.id, label: option.name }))} /><div><label className="text-xs font-medium" htmlFor={`code-${item.id}`}>Class code</label><input id={`code-${item.id}`} name="classCode" defaultValue={item.code.toUpperCase()} className={`${fieldClass} mt-1.5 uppercase`} /></div><div><label className="text-xs font-medium" htmlFor={`name-${item.id}`}>Display name</label><input id={`name-${item.id}`} name="displayName" defaultValue={item.name} className={`${fieldClass} mt-1.5`} /></div><div className="flex items-center gap-2"><button type="submit" disabled={classPending} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-[0.7rem] font-semibold text-white disabled:opacity-60">{classPending ? <Spinner className="size-3.5 text-white" /> : <Save className="size-3.5" />}Save</button><button type="button" onClick={() => { setEditingClassId(null); setClassGradeId(""); }} className="min-h-9 rounded-[var(--radius-sm)] px-2.5 text-[0.7rem] font-medium text-muted-foreground hover:bg-surface">Cancel</button></div></form>;
                  return <div key={item.id} className="flex min-h-10 items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2"><div className="min-w-0"><p className="text-xs font-medium">{item.name}</p><p className="mt-0.5 text-[0.68rem] uppercase tracking-[0.04em] text-muted-foreground">{item.code}</p></div><div className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => { expandGrade(grade.id); setEditingClassId(item.id); setClassGradeId(item.gradeId); }} aria-label={`Edit ${item.name}`} className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-surface hover:text-brand-strong"><Pencil className="size-3.5" /></button><button type="button" disabled={deletePending} onClick={() => startDelete(async () => { const formData = new FormData(); formData.set("classId", item.id); const result = await deleteRegisterClass(formData); result.success ? toast.success(result.message) : toast.error(result.message); })} aria-label={`Delete ${item.name}`} className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-danger-soft hover:text-[color:var(--danger)] disabled:opacity-50"><Trash2 className="size-3.5" /></button></div></div>;
                }) : <p className="py-2 text-xs text-muted-foreground">No register classes yet.</p>}
              </div>
            ) : null}
          </div>
        );
      })}
      {!orderedGrades.length ? <div className="py-8 text-center text-sm text-muted-foreground">Add the first grade to begin academic setup.</div> : null}
    </div>
  );
}
