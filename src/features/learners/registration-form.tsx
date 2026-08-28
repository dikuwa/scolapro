"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { ArrowRight, Camera, Check, LoaderCircle, UserRound, X } from "lucide-react";
import { registerLearner, type LearnerRegistrationState } from "@/features/learners/server/actions";
import type { GradeOption } from "@/features/learners/server/registration-options";

const initialState: LearnerRegistrationState = {};
const fieldClassName = "mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

export function LearnerRegistrationForm({ schoolId, academicYear, grades, defaultAdmissionDate }: { schoolId: string; academicYear: number; grades: GradeOption[]; defaultAdmissionDate: string }) {
  const [state, action, pending] = useActionState(registerLearner, initialState);
  const [gradeId, setGradeId] = useState(grades[0]?.id ?? "");
  const selectedGrade = useMemo(() => grades.find((grade) => grade.id === gradeId) ?? grades[0], [gradeId, grades]);
  const [classId, setClassId] = useState(selectedGrade?.classes[0]?.id ?? "");
  const [sex, setSex] = useState("unspecified");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState("");

  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  function selectGrade(nextGradeId: string) {
    setGradeId(nextGradeId);
    const nextGrade = grades.find((grade) => grade.id === nextGradeId);
    setClassId(nextGrade?.classes[0]?.id ?? "");
  }

  function selectPhoto(file?: File) {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    if (!file) { setPhotoPreview(null); setPhotoName(""); return; }
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoName(file.name);
  }

  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="academicYear" value={academicYear} /><input type="hidden" name="gradeId" value={gradeId} /><input type="hidden" name="registerClassId" value={classId} /><input type="hidden" name="sex" value={sex} />

      <section>
        <div className="mb-4"><h2 className="scolapro-section-title">Learner identity</h2><p className="scolapro-section-description">Capture the learner once. Yearly placement and guardians remain separate linked records.</p></div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_12rem]">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First names" name="firstNames" error={state.fieldErrors?.firstNames?.[0]} required />
            <Field label="Surname" name="surname" error={state.fieldErrors?.surname?.[0]} required />
            <Field label="Preferred name" name="preferredName" error={state.fieldErrors?.preferredName?.[0]} />
            <Field label="Date of birth" name="dateOfBirth" type="date" error={state.fieldErrors?.dateOfBirth?.[0]} />
          </div>

          <div className="rounded-[var(--radius-md)] bg-surface-muted p-3">
            <p className="text-xs font-medium">Learner photo</p>
            <div className="mt-2 grid aspect-square w-full place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-border-subtle bg-surface">
              {photoPreview ? <img src={photoPreview} alt="Learner photo preview" className="size-full object-cover" /> : <UserRound className="size-10 text-muted-foreground/45" aria-hidden="true" />}
            </div>
            <input id="learner-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="user" className="sr-only" onChange={(event) => selectPhoto(event.target.files?.[0])} />
            <div className="mt-2 flex gap-1.5"><label htmlFor="learner-photo" className="inline-flex min-h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-xs)] bg-surface px-2 text-[0.7rem] font-medium text-muted-foreground shadow-[var(--shadow-xs)] hover:text-foreground"><Camera className="size-3.5" />{photoName ? "Change" : "Add photo"}</label>{photoPreview ? <button type="button" onClick={() => selectPhoto()} aria-label="Remove selected photo" className="grid size-8 place-items-center rounded-[var(--radius-xs)] bg-surface text-muted-foreground hover:text-[color:var(--danger)]"><X className="size-3.5" /></button> : null}</div>
            <p className="mt-1 text-[0.65rem] leading-4 text-muted-foreground">Private school record · JPG, PNG or WebP · max 5 MB.</p>
            {state.fieldErrors?.photo?.[0] ? <p className="mt-1 text-[0.68rem] text-[color:var(--danger)]">{state.fieldErrors.photo[0]}</p> : null}
          </div>
        </div>

        <div className="mt-4"><span className="text-xs font-medium">Sex</span><div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Learner sex">{[["female","Female"],["male","Male"],["other","Other"],["unspecified","Not specified"]].map(([value,label]) => { const selected = sex === value; return <button key={value} type="button" role="radio" aria-checked={selected} onClick={() => setSex(value)} className={`inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] border px-2.5 text-xs font-medium transition ${selected ? "border-[color:var(--brand)]/30 bg-brand-soft text-brand-strong" : "border-border-subtle bg-surface text-muted-foreground hover:text-foreground"}`}><span className={`grid size-3.5 place-items-center rounded-full border ${selected ? "border-brand bg-brand text-white" : "border-border"}`}>{selected ? <Check className="size-2" strokeWidth={3} /> : null}</span>{label}</button>; })}</div></div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5">
        <div className="mb-4"><h2 className="scolapro-section-title">Current school placement</h2><p className="scolapro-section-description">Academic year {academicYear}. Moving grade or class later will not rewrite learner identity.</p></div>
        <div><span className="text-xs font-medium">Grade</span><div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Grade">{grades.map((grade) => { const selected = grade.id === gradeId; return <button key={grade.id} type="button" role="radio" aria-checked={selected} onClick={() => selectGrade(grade.id)} className={`min-h-8 rounded-[var(--radius-xs)] px-2.5 text-xs font-medium transition ${selected ? "bg-brand text-white" : "bg-surface text-muted-foreground shadow-[var(--shadow-xs)] hover:text-foreground"}`}>{grade.label}</button>; })}</div></div>
        <div className="mt-4"><span className="text-xs font-medium">Register class</span>{selectedGrade?.classes.length ? <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Register class">{selectedGrade.classes.map((registerClass) => { const selected = registerClass.id === classId; return <button key={registerClass.id} type="button" role="radio" aria-checked={selected} onClick={() => setClassId(registerClass.id)} className={`min-h-8 rounded-[var(--radius-xs)] border px-2.5 text-xs font-medium transition ${selected ? "border-[color:var(--brand)]/30 bg-brand-soft text-brand-strong" : "border-border-subtle bg-surface text-muted-foreground hover:text-foreground"}`}>{registerClass.label}</button>; })}</div> : <p className="mt-2 rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2.5 text-xs text-[color:var(--warning)]">No register classes are configured for this grade.</p>}</div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2"><div><Field label="Admission number" name="admissionNumber" error={state.fieldErrors?.admissionNumber?.[0]} placeholder="Auto-generated if left blank" /><p className="mt-1 text-[0.68rem] text-muted-foreground">Leave blank for ScolaPro to assign a unique school admission number that stays with this learner across grades.</p></div><Field label="Admission date" name="enrolledFrom" defaultValue={defaultAdmissionDate} type="date" error={state.fieldErrors?.enrolledFrom?.[0]} required /></div>
      </section>

      {state.message ? <div role="alert" className="rounded-[var(--radius-sm)] bg-danger-soft px-3.5 py-3 text-sm text-[color:var(--danger)]">{state.message}</div> : null}
      <div className="flex flex-col-reverse gap-2 border-t border-border-subtle pt-4 sm:flex-row sm:items-center sm:justify-end"><Link href="/learners" className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-sm)] px-4 text-sm font-medium text-muted-foreground hover:bg-surface-muted hover:text-foreground">Cancel</Link><button type="submit" disabled={pending || !gradeId || !classId} className="scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60">{pending ? <LoaderCircle className="size-4 animate-spin" /> : null}{pending ? "Registering…" : "Register learner"}{!pending ? <ArrowRight className="scolapro-cta-icon size-4" /> : null}</button></div>
    </form>
  );
}

function Field({ label, name, error, required, ...props }: { label: string; name: string; error?: string; required?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  const errorId = `${name}-error`;
  return <div><label htmlFor={name} className="text-xs font-medium">{label}{required ? <span className="text-[color:var(--danger)]"> *</span> : null}</label><input id={name} name={name} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className={fieldClassName} {...props} />{error ? <p id={errorId} className="mt-1.5 text-xs text-[color:var(--danger)]">{error}</p> : null}</div>;
}
