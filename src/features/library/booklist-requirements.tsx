"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Picker } from "@/components/ui/picker";
import { deriveGradeBooklistDemand } from "@/features/library/booklist-metrics";
import {
  removeLibraryBooklistRequirement,
  saveLibraryBooklistRequirement,
  type LibraryActionState,
} from "@/features/library/server/actions";
import type {
  LibraryBooklistItem, LibraryCopy, LibraryGrade, LibraryLearner, LibraryLoan, LibraryTitle,
} from "@/features/library/server/queries";

const initialState: LibraryActionState = {};

export function BooklistRequirements({ schoolId, gradeId, grades, titles, booklists, learners, copies, loans }: {
  schoolId: string;
  gradeId: string;
  grades: LibraryGrade[];
  titles: LibraryTitle[];
  booklists: LibraryBooklistItem[];
  learners: LibraryLearner[];
  copies: LibraryCopy[];
  loans: LibraryLoan[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleId, setTitleId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [saveState, saveAction, savePending] = useActionState(saveLibraryBooklistRequirement, initialState);
  const [removeState, removeAction, removePending] = useActionState(removeLibraryBooklistRequirement, initialState);
  // A completed save must close only the editor it was submitted from. The
  // submitted requirement is captured at submit time so a refresh that lands
  // after the user opened a different requirement cannot discard that draft.
  const editingTitleIdRef = useRef<string | null>(null);
  const submittedTitleIdRef = useRef<string | null>(null);
  useEffect(() => { editingTitleIdRef.current = editingTitleId; }, [editingTitleId]);
  const grade = grades.find((item) => item.id === gradeId);
  const activeRequirements = useMemo(() => booklists.filter((item) => item.gradeId === gradeId && item.status === "active"), [booklists, gradeId]);
  const enrolledLearners = useMemo(() => learners.filter((item) => item.gradeId === gradeId).map((item) => item.id), [learners, gradeId]);
  const demand = useMemo(() => deriveGradeBooklistDemand(activeRequirements, enrolledLearners, copies, loans), [activeRequirements, enrolledLearners, copies, loans]);
  const activeTitles = titles.filter((item) => item.resourceType === "textbook" && item.status === "active" && (!item.gradeCode || item.gradeCode === grade?.code));
  const totalRequired = demand.reduce((sum, item) => sum + item.required, 0);
  const totalAllocated = demand.reduce((sum, item) => sum + item.allocated, 0);
  const totalShortage = demand.reduce((sum, item) => sum + item.potentialShortage, 0);

  useEffect(() => {
    if (!saveState.message) return;
    if (saveState.success) {
      toast.success(saveState.message);
      // Close only the editor that was actually submitted; a different open
      // requirement keeps its unsaved draft.
      if (submittedTitleIdRef.current === editingTitleIdRef.current) queueMicrotask(() => setEditing(false));
      router.refresh();
    } else toast.error(saveState.message);
  }, [saveState, router]);
  useEffect(() => {
    if (!removeState.message) return;
    if (removeState.success) {
      toast.success(removeState.message);
      queueMicrotask(() => setConfirmRemoveId(null));
      router.refresh();
    } else toast.error(removeState.message);
  }, [removeState, router]);

  function edit(item?: LibraryBooklistItem) {
    setEditingTitleId(item?.titleId ?? null);
    setTitleId(item?.titleId ?? "");
    setQuantity(String(item?.copiesPerLearner ?? 1));
    setEditing(true);
  }

  if (!gradeId || !grade) return null;

  return <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5" aria-label="Textbook requirements">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-2.5"><BookOpenCheck className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden="true" /><div>
        <h2 className="scolapro-section-title">Official textbook requirements</h2>
        <p className="scolapro-section-description">{grade.name} · {grade.academicYear}. Set the approved textbooks and copies required per enrolled learner.</p>
      </div></div>
      <Button type="button" size="sm" variant={editing ? "neutral" : "soft"} disabled={savePending} onClick={() => editing ? setEditing(false) : edit()}>
        {editing ? "Close" : <><Plus className="size-3.5" aria-hidden="true" />Add requirement</>}
      </Button>
    </div>

    {activeRequirements.length === 0 ? <p className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-border p-4 text-sm text-muted-foreground">Not configured. No required-copy or shortage numbers are assumed until the grade booklist is saved.</p> : <>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[{ label: "Learners", count: enrolledLearners.length }, { label: "Required", count: totalRequired }, { label: "Allocated", count: totalAllocated }, { label: "Potential shortage", count: totalShortage }].map(({ label, count }) =>
          <div key={label} className="rounded-[var(--radius-xs)] bg-surface-muted px-3 py-2.5"><p className="text-[0.68rem] text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums">{count}</p></div>)}
      </div>
      <div className="mt-3 divide-y divide-border-subtle">{demand.map((item) => {
        const title = titles.find((entry) => entry.id === item.titleId);
        return <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0"><p className="text-sm font-semibold">{title?.title ?? "Unavailable textbook"}</p><p className="mt-1 text-xs text-muted-foreground">{item.copiesPerLearner} per learner · {item.required} required · {item.allocated} allocated · {item.available} free copies · {item.potentialShortage} potential shortage</p></div>
          <div className="flex flex-wrap gap-1.5">{confirmRemoveId === item.id ? <>
            <form action={removeAction}><input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="booklistId" value={item.id} /><Button type="submit" variant="danger" size="sm" loading={removePending} disabled={removePending}>Confirm removal</Button></form>
            <Button type="button" size="sm" variant="neutral" onClick={() => setConfirmRemoveId(null)}>Keep</Button>
          </> : <>
            <Button type="button" variant="ghost" size="sm" disabled={savePending} onClick={() => edit(item)}><Pencil className="size-3" aria-hidden="true" />Edit</Button>
            <Button type="button" variant="danger-ghost" size="sm" disabled={savePending} onClick={() => setConfirmRemoveId(item.id)}><Trash2 className="size-3" aria-hidden="true" />Remove</Button>
          </>}</div>
        </div>;
      })}</div>
      <p className="mt-2 text-[0.68rem] leading-5 text-muted-foreground">Potential shortages count this grade’s current allocations and free school copies; shared free copies may also be needed by other grades. Lost and withdrawn stock is excluded.</p>
    </>}

    {editing ? <form action={saveAction} onSubmit={() => { submittedTitleIdRef.current = editingTitleId; }} className="mt-4 grid gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted p-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="gradeId" value={gradeId} />
      {editingTitleId ? <div className="min-w-0"><p className="text-xs font-medium">Textbook (unchanged while editing)</p><p className="mt-1.5 flex min-h-10 items-center truncate rounded-[var(--radius-sm)] bg-surface-elevated px-3 text-sm">{titles.find((item) => item.id === editingTitleId)?.title ?? "Textbook"}</p><input type="hidden" name="titleId" value={editingTitleId} /></div> : <Picker label="Textbook" name="titleId" value={titleId} onChange={(next) => { setTitleId(next); const current = booklists.find((item) => item.gradeId === gradeId && item.titleId === next); setQuantity(String(current?.copiesPerLearner ?? 1)); }} searchable placeholder="Choose textbook" options={activeTitles.map((title) => ({ value: title.id, label: title.title, helper: title.subjectCode ?? undefined }))} />}
      <label className="block text-xs font-medium">Copies per learner<input type="number" name="copiesPerLearner" min="1" max="10" step="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm" /></label>
      <Button type="submit" size="sm" disabled={!titleId || savePending} loading={savePending}>Save</Button>
      {!activeTitles.length ? <p className="text-xs text-muted-foreground sm:col-span-3">Create an active textbook in Manage catalog before adding its requirement.</p> : null}
    </form> : null}
  </section>;
}
