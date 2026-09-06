"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { ChevronDown, Pencil, Save, Search, Trash2 } from "lucide-react";
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
  const [classState, classAction, classPending] = useActionState(updateRegisterClass, initialState);
  const [gradeState, gradeAction, gradePending] = useActionState(updateGrade, initialState);
  const [deletePending, startDelete] = useTransition();
  const [classGradeId, setClassGradeId] = useState("");
  const [query, setQuery] = useState("");
  const [expandedGrades, setExpandedGrades] = useState<Set<string>>(() => new Set(grades.slice(0, 1).map((grade) => grade.id)));

  const orderedGrades = useMemo(() => [...grades].sort((a, b) => numericPart(b.name || b.code) - numericPart(a.name || a.code) || naturalCompare(a.name, b.name)), [grades]);
  const orderedClasses = useMemo(() => [...classes].sort((a, b) => naturalCompare(a.name || a.code, b.name || b.code)), [classes]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleGroups = useMemo(() => orderedGrades.map((grade) => {
    const allClasses = orderedClasses.filter((item) => item.gradeId === grade.id);
    const gradeMatches = `${grade.name} ${grade.code}`.toLocaleLowerCase().includes(normalizedQuery);
    const gradeClasses = !normalizedQuery || gradeMatches ? allClasses : allClasses.filter((item) => `${item.name} ${item.code}`.toLocaleLowerCase().includes(normalizedQuery));
    return { grade, classes: gradeClasses };
  }).filter(({ classes: gradeClasses, grade }) => !normalizedQuery || gradeClasses.length > 0 || `${grade.name} ${grade.code}`.toLocaleLowerCase().includes(normalizedQuery)), [normalizedQuery, orderedClasses, orderedGrades]);

  useEffect(() => {
    if (!classState.message) return;
    if (classState.success) { toast.success(classState.message); queueMicrotask(() => { setEditingClassId(null); setClassGradeId(""); }); }
    else toast.error(classState.message);
  }, [classState]);
  useEffect(() => {
    if (!gradeState.message) return;
    if (gradeState.success) { toast.success(gradeState.message); queueMicrotask(() => setEditingGradeId(null)); }
    else toast.error(gradeState.message);
  }, [gradeState]);

  function toggleGrade(gradeId: string) {
    setExpandedGrades((current) => { const next = new Set(current); if (next.has(gradeId)) next.delete(gradeId); else next.add(gradeId); return next; });
  }

  function beginClassEdit(item: RegisterClass) {
    setEditingClassId(item.id);
    setClassGradeId(item.gradeId);
    setExpandedGrades((current) => new Set(current).add(item.gradeId));
  }

  return <div className="mt-4">
    <div className="relative mb-3 max-w-md">
      <label htmlFor="class-structure-search" className="sr-only">Search grades and classes</label>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input id="class-structure-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search grades or classes" className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated py-2 pl-9 pr-3 text-sm outline-none transition duration-[var(--motion-fast)] placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" />
    </div>

    <div className="divide-y divide-border-subtle">
      {visibleGroups.map(({ grade, classes: gradeClasses }) => {
        const normalizedCode = /^\d+$/.test(grade.code) ? `G${grade.code}` : grade.code.toUpperCase();
        const editingGrade = editingGradeId === grade.id;
        const expanded = Boolean(normalizedQuery) || expandedGrades.has(grade.id) || editingGrade;
        const panelId = `grade-classes-${grade.id}`;
        return <section key={grade.id} className="py-2 first:pt-0 last:pb-0">
          {editingGrade ? <form action={gradeAction} className="grid gap-2 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:grid-cols-[0.7fr_1fr_auto] sm:items-end">
            <input type="hidden" name="gradeId" value={grade.id} />
            <div><label className="text-xs font-medium" htmlFor={`grade-code-${grade.id}`}>Grade code</label><input id={`grade-code-${grade.id}`} name="gradeCode" defaultValue={normalizedCode} className={`${fieldClass} mt-1 uppercase`} /></div>
            <div><label className="text-xs font-medium" htmlFor={`grade-name-${grade.id}`}>Display name</label><input id={`grade-name-${grade.id}`} name="displayName" defaultValue={grade.name} className={`${fieldClass} mt-1`} /></div>
            <div className="flex items-center gap-2"><button type="submit" disabled={gradePending} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white disabled:opacity-60">{gradePending ? <Spinner className="size-3.5 text-white" /> : <Save className="size-3.5" />}Save</button><button type="button" onClick={() => setEditingGradeId(null)} className="min-h-9 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-muted-foreground hover:bg-surface">Cancel</button></div>
          </form> : <div className="flex items-center gap-2">
            <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => toggleGrade(grade.id)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-sm)] px-2 text-left transition duration-[var(--motion-fast)] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)]">
              <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-base)] ${expanded ? "rotate-0" : "-rotate-90"}`} aria-hidden="true" />
              <span className="min-w-0 flex-1"><span className="scolapro-record-title block truncate">{grade.name}</span><span className="mt-0.5 block text-[0.68rem] font-medium uppercase tracking-[0.05em] text-muted-foreground">{normalizedCode} · {gradeClasses.length} {gradeClasses.length === 1 ? "class" : "classes"}</span></span>
            </button>
            <div className="flex shrink-0 gap-0.5"><button type="button" onClick={() => { setEditingGradeId(grade.id); setExpandedGrades((current) => new Set(current).add(grade.id)); }} aria-label={`Edit ${grade.name}`} className="grid size-9 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-brand-strong"><Pencil className="size-3.5" /></button><button type="button" disabled={deletePending} onClick={() => startDelete(async () => { const formData = new FormData(); formData.set("gradeId", grade.id); const result = await deleteGrade(formData); if (result.success) toast.success(result.message); else toast.error(result.message); })} aria-label={`Delete ${grade.name}`} className="grid size-9 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-danger-soft hover:text-[color:var(--danger)] disabled:opacity-50"><Trash2 className="size-3.5" /></button></div>
          </div>}

          <div id={panelId} hidden={!expanded} className="pb-2 pl-8 pt-2 sm:pl-11">
            <div className="space-y-2">{gradeClasses.length ? gradeClasses.map((item) => editingClassId === item.id ? <form key={item.id} action={classAction} className="grid gap-2 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:grid-cols-[0.8fr_1fr_1fr_auto] sm:items-end"><input type="hidden" name="classId" value={item.id} /><Picker label="Grade" name="gradeId" value={classGradeId || item.gradeId} onChange={setClassGradeId} placeholder="Choose grade" options={orderedGrades.map((option) => ({ value: option.id, label: option.name }))} /><div><label className="text-xs font-medium" htmlFor={`code-${item.id}`}>Class code</label><input id={`code-${item.id}`} name="classCode" defaultValue={item.code.toUpperCase()} className={`${fieldClass} mt-1.5 uppercase`} /></div><div><label className="text-xs font-medium" htmlFor={`name-${item.id}`}>Display name</label><input id={`name-${item.id}`} name="displayName" defaultValue={item.name} className={`${fieldClass} mt-1.5`} /></div><div className="flex items-center gap-2"><button type="submit" disabled={classPending} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white disabled:opacity-60">{classPending ? <Spinner className="size-3.5 text-white" /> : <Save className="size-3.5" />}Save</button><button type="button" onClick={() => { setEditingClassId(null); setClassGradeId(""); }} className="min-h-9 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-muted-foreground hover:bg-surface">Cancel</button></div></form> : <div key={item.id} className="flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2"><div className="min-w-0"><p className="text-xs font-medium">{item.name}</p><p className="mt-0.5 text-[0.68rem] uppercase tracking-[0.04em] text-muted-foreground">{item.code}</p></div><div className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => beginClassEdit(item)} aria-label={`Edit ${item.name}`} className="grid size-9 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface hover:text-brand-strong"><Pencil className="size-3.5" /></button><button type="button" disabled={deletePending} onClick={() => startDelete(async () => { const formData = new FormData(); formData.set("classId", item.id); const result = await deleteRegisterClass(formData); if (result.success) toast.success(result.message); else toast.error(result.message); })} aria-label={`Delete ${item.name}`} className="grid size-9 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-danger-soft hover:text-[color:var(--danger)] disabled:opacity-50"><Trash2 className="size-3.5" /></button></div></div>) : <p className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-4 text-xs text-muted-foreground">{normalizedQuery ? "No matching classes in this grade." : "No register classes yet."}</p>}</div>
          </div>
        </section>;
      })}
      {!visibleGroups.length ? <div className="py-8 text-center text-sm text-muted-foreground">{normalizedQuery ? "No grades or classes match your search." : "Add the first grade to begin academic setup."}</div> : null}
    </div>
  </div>;
}
