"use client";

import { useActionState, useEffect, useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { saveGrade, saveRegisterClass, type AcademicStructureState } from "@/features/academics/server/actions";

const initialState: AcademicStructureState = {};
const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

function FieldError({ messages }: { messages?: string[] }) {
  return messages?.[0] ? <p className="mt-1 text-xs text-[color:var(--danger)]">{messages[0]}</p> : null;
}

function gradeCode(code: string, name: string) {
  const normalized = /^\d+$/.test(code) ? `G${code}` : code.toUpperCase();
  const numberFromName = name.match(/\b(\d{1,2})\b/)?.[1];
  return numberFromName && normalized === `G${numberFromName}` ? normalized : normalized;
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
    <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <h2 className="scolapro-section-title">Add or update grade</h2>
        <p className="scolapro-section-description">Grades belong to this school and academic year. Use short, stable uppercase codes such as G8, G9 or G10.</p>
        <form action={gradeAction} className="mt-5 space-y-4" noValidate>
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="academicYear" value={academicYear} />
          <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
            <div>
              <label htmlFor="gradeCode" className="text-xs font-medium">Grade code</label>
              <input id="gradeCode" name="gradeCode" className={`${fieldClass} mt-1.5 uppercase`} placeholder="G8" autoCapitalize="characters" />
              <p className="mt-1 text-[0.68rem] text-muted-foreground">Stored as an uppercase identifier.</p>
              <FieldError messages={gradeState.fieldErrors?.gradeCode} />
            </div>
            <div>
              <label htmlFor="gradeName" className="text-xs font-medium">Display name</label>
              <input id="gradeName" name="displayName" className={`${fieldClass} mt-1.5`} placeholder="Grade 8" />
              <p className="mt-1 text-[0.68rem] text-muted-foreground">Human-readable label shown throughout ScolaPro.</p>
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
        <h2 className="scolapro-section-title">Add register class</h2>
        <p className="scolapro-section-description">Register classes belong to one configured grade and are reused by enrolment, attendance and class-teacher workflows.</p>
        <form action={classAction} className="mt-5 space-y-4" noValidate>
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="academicYear" value={academicYear} />

          <Picker
            label="Grade"
            name="gradeId"
            value={gradeId}
            onChange={setGradeId}
            placeholder="Configure a grade first"
            disabled={!grades.length}
            options={grades.map((grade) => ({ value: grade.id, label: grade.name, helper: gradeCode(grade.code, grade.name) }))}
          />
          <FieldError messages={classState.fieldErrors?.gradeId} />

          <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
            <div>
              <label htmlFor="classCode" className="text-xs font-medium">Class code</label>
              <input id="classCode" name="classCode" className={`${fieldClass} mt-1.5 uppercase`} placeholder="10A" autoCapitalize="characters" />
              <p className="mt-1 text-[0.68rem] text-muted-foreground">Short uppercase identifier, for example 10A.</p>
              <FieldError messages={classState.fieldErrors?.classCode} />
            </div>
            <div>
              <label htmlFor="className" className="text-xs font-medium">Display name</label>
              <input id="className" name="displayName" className={`${fieldClass} mt-1.5`} placeholder="Grade 10/A" />
              <p className="mt-1 text-[0.68rem] text-muted-foreground">Shown to teachers, learners and administrators.</p>
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