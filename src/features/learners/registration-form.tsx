"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import {
  registerLearner,
  type LearnerRegistrationState,
} from "@/features/learners/server/actions";
import type { GradeOption } from "@/features/learners/server/registration-options";

const initialState: LearnerRegistrationState = {};

const fieldClassName =
  "min-h-11 w-full rounded-xl border border-border bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-sm)] outline-none transition duration-200 placeholder:text-muted-foreground/65 hover:border-[color:var(--brand)]/30 focus:border-[color:var(--brand)] focus:ring-4 focus:ring-[color:var(--brand-soft)]";

export function LearnerRegistrationForm({
  schoolId,
  academicYear,
  grades,
  defaultAdmissionDate,
}: {
  schoolId: string;
  academicYear: number;
  grades: GradeOption[];
  defaultAdmissionDate: string;
}) {
  const [state, action, pending] = useActionState(registerLearner, initialState);
  const [gradeId, setGradeId] = useState(grades[0]?.id ?? "");
  const selectedGrade = useMemo(
    () => grades.find((grade) => grade.id === gradeId) ?? grades[0],
    [gradeId, grades],
  );
  const [classId, setClassId] = useState(selectedGrade?.classes[0]?.id ?? "");
  const [sex, setSex] = useState("unspecified");

  function selectGrade(nextGradeId: string) {
    setGradeId(nextGradeId);
    const nextGrade = grades.find((grade) => grade.id === nextGradeId);
    setClassId(nextGrade?.classes[0]?.id ?? "");
  }

  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="academicYear" value={academicYear} />
      <input type="hidden" name="gradeId" value={gradeId} />
      <input type="hidden" name="registerClassId" value={classId} />
      <input type="hidden" name="sex" value={sex} />

      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold">Learner identity</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Capture identity once. School placement is stored separately below.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First names" name="firstNames" error={state.fieldErrors?.firstNames?.[0]} required />
          <Field label="Surname" name="surname" error={state.fieldErrors?.surname?.[0]} required />
          <Field label="Preferred name" name="preferredName" error={state.fieldErrors?.preferredName?.[0]} />
          <Field
            label="Date of birth"
            name="dateOfBirth"
            placeholder="YYYY-MM-DD"
            inputMode="numeric"
            error={state.fieldErrors?.dateOfBirth?.[0]}
          />
        </div>

        <div className="mt-4">
          <span className="text-sm font-medium">Sex</span>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Learner sex">
            {[
              ["female", "Female"],
              ["male", "Male"],
              ["other", "Other"],
              ["unspecified", "Not specified"],
            ].map(([value, label]) => {
              const selected = sex === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSex(value)}
                  className={[
                    "inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition duration-200",
                    selected
                      ? "border-[color:var(--brand)]/35 bg-brand-soft text-brand-strong"
                      : "border-border bg-surface text-muted-foreground hover:bg-surface-muted hover:text-foreground",
                  ].join(" ")}
                >
                  <span className={[
                    "grid size-4 place-items-center rounded-full border",
                    selected ? "border-brand bg-brand text-white" : "border-border bg-surface-elevated",
                  ].join(" ")}>
                    {selected ? <Check aria-hidden="true" className="size-2.5" strokeWidth={3} /> : null}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-surface-muted p-4 sm:p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold">Current school placement</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Academic year {academicYear}. Placement changes later without rewriting learner identity.</p>
        </div>

        <div>
          <span className="text-sm font-medium">Grade</span>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Grade">
            {grades.map((grade) => {
              const selected = grade.id === gradeId;
              return (
                <button
                  key={grade.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => selectGrade(grade.id)}
                  className={[
                    "min-h-10 rounded-xl px-3 text-sm font-medium transition duration-200",
                    selected ? "bg-brand text-white" : "bg-surface text-muted-foreground shadow-[var(--shadow-sm)] hover:text-foreground",
                  ].join(" ")}
                >
                  {grade.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <span className="text-sm font-medium">Register class</span>
          {selectedGrade?.classes.length ? (
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Register class">
              {selectedGrade.classes.map((registerClass) => {
                const selected = registerClass.id === classId;
                return (
                  <button
                    key={registerClass.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setClassId(registerClass.id)}
                    className={[
                      "min-h-10 rounded-xl border px-3 text-sm font-medium transition duration-200",
                      selected
                        ? "border-[color:var(--brand)]/35 bg-brand-soft text-brand-strong"
                        : "border-border bg-surface text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {registerClass.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 rounded-xl bg-warning-soft px-3 py-2.5 text-xs text-[color:var(--warning)]">No register classes are configured for this grade.</p>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Admission number" name="admissionNumber" error={state.fieldErrors?.admissionNumber?.[0]} />
          <Field
            label="Admission date"
            name="enrolledFrom"
            defaultValue={defaultAdmissionDate}
            placeholder="YYYY-MM-DD"
            inputMode="numeric"
            error={state.fieldErrors?.enrolledFrom?.[0]}
            required
          />
        </div>
      </section>

      {state.message ? (
        <div role="alert" className="rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-[color:var(--danger)]">
          {state.message}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 border-t border-border-subtle pt-4 sm:flex-row sm:items-center sm:justify-end">
        <Link href="/learners" className="inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-medium text-muted-foreground transition duration-200 hover:bg-surface-muted hover:text-foreground">
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending || !gradeId || !classId}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-sm)] transition duration-200 hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
          {pending ? "Registering…" : "Register learner"}
          {!pending ? <ArrowRight aria-hidden="true" className="size-4" /> : null}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  error,
  required,
  ...props
}: {
  label: string;
  name: string;
  error?: string;
  required?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const errorId = `${name}-error`;

  return (
    <div>
      <label htmlFor={name} className="text-sm font-medium">
        {label}{required ? <span className="text-[color:var(--danger)]"> *</span> : null}
      </label>
      <input
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={fieldClassName}
        {...props}
      />
      {error ? <p id={errorId} className="mt-1.5 text-xs text-[color:var(--danger)]">{error}</p> : null}
    </div>
  );
}
