"use client";

import { useActionState, useEffect, useState } from "react";
import { ChevronDown, LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { saveGrade, saveRegisterClass, type AcademicStructureState } from "@/features/academics/server/actions";

const initialState: AcademicStructureState = {};
const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

function FieldError({ messages }: { messages?: string[] }) {
  return messages?.[0] ? <p className="mt-1 text-xs text-[color:var(--danger)]">{messages[0]}</p> : null;
}

export function AcademicStructureForms({
  schoolId,
  academicYear,
  grades,
}: {
  schoolId: string;
  academicYear: number;
  grades: { id: string; code: string; name: string }[];
}) {
  const [gradeState, gradeAction, gradePending] = useActionState(saveGrade, initialState);
  const [classState, classAction, classPending] = useActionState(saveRegisterClass, initialState);
  const [gradeId, setGradeId] = useState(grades[0]?.id ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedGrade = grades.find((grade) => grade.id === gradeId);

  useEffect(() => {
    if (!gradeState.message) return;
    if (gradeState.success) toast.success(gradeState.message);
    else toast.error(gradeState.message);
  }, [gradeState]);

  useEffect(() => {
    if (!classState.message) return;
    if (classState.success) toast.success(classState.message);
    else toast.error(classState.message);
  }, [classState]);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <h2 className="text-sm font-semibold">Add or update grade</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Grades are scoped to this school and academic year. Use stable codes such as g8 or grade-8.</p>
        <form action={gradeAction} className="mt-5 space-y-4" noValidate>
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="academicYear" value={academicYear} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="gradeCode" className="text-xs font-medium">Grade code</label>
              <input id="gradeCode" name="gradeCode" className={`${fieldClass} mt-1.5`} placeholder="g8" />
              <FieldError messages={gradeState.fieldErrors?.gradeCode} />
            </div>
            <div>
              <label htmlFor="gradeName" className="text-xs font-medium">Display name</label>
              <input id="gradeName" name="displayName" className={`${fieldClass} mt-1.5`} placeholder="Grade 8" />
              <FieldError messages={gradeState.fieldErrors?.displayName} />
            </div>
          </div>
          <div className="flex justify-end border-t border-border-subtle pt-4">
            <button type="submit" disabled={gradePending} className="scolapro-cta inline-flex min-h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:opacity-60">
              {gradePending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
              {gradePending ? "Saving…" : "Save grade"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Add or update register class</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Register classes belong to a configured grade and are reused by enrolment, attendance and class-teacher workflows.</p>
        <form action={classAction} className="mt-5 space-y-4" noValidate>
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="academicYear" value={academicYear} />
          <input type="hidden" name="gradeId" value={gradeId} />

          <div className="relative">
            <p className="text-xs font-medium">Grade</p>
            <button type="button" onClick={() => setPickerOpen((value) => !value)} aria-expanded={pickerOpen} className="mt-1.5 flex min-h-10 w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-left text-sm shadow-[var(--shadow-xs)] transition hover:border-border">
              <span>{selectedGrade ? selectedGrade.name : "Configure a grade first"}</span>
              <ChevronDown className={`size-4 text-muted-foreground transition-transform ${pickerOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {pickerOpen ? (
              <div className="absolute z-30 mt-1.5 max-h-56 w-full overflow-auto rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-1.5 shadow-[var(--shadow-md)]">
                {grades.map((grade) => (
                  <button key={grade.id} type="button" onClick={() => { setGradeId(grade.id); setPickerOpen(false); }} className={`w-full rounded-[var(--radius-xs)] px-2.5 py-2 text-left text-sm transition hover:bg-surface-muted ${grade.id === gradeId ? "bg-brand-soft text-brand-strong" : ""}`}>
                    <span className="font-medium">{grade.name}</span><span className="ml-2 text-xs text-muted-foreground">{grade.code}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <FieldError messages={classState.fieldErrors?.gradeId} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="classCode" className="text-xs font-medium">Class code</label>
              <input id="classCode" name="classCode" className={`${fieldClass} mt-1.5`} placeholder="8a" />
              <FieldError messages={classState.fieldErrors?.classCode} />
            </div>
            <div>
              <label htmlFor="className" className="text-xs font-medium">Display name</label>
              <input id="className" name="displayName" className={`${fieldClass} mt-1.5`} placeholder="Grade 8A" />
              <FieldError messages={classState.fieldErrors?.displayName} />
            </div>
          </div>
          <div className="flex justify-end border-t border-border-subtle pt-4">
            <button type="submit" disabled={classPending || !grades.length} className="scolapro-cta inline-flex min-h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60">
              {classPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
              {classPending ? "Saving…" : "Save class"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
