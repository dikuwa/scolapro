"use client";

import { useState } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { saveAdmissionIntakeCandidate } from "@/features/admissions/server/actions";

const fieldClass = "scolapro-control-surface min-h-10 w-full rounded-[var(--radius-sm)] px-3 text-sm outline-none transition focus-visible:border-[color:var(--brand)]/45 focus-visible:ring-4 focus-visible:ring-brand-soft";

export function AdmissionCandidateForm({
  jobId,
  candidate,
  grades,
}: {
  jobId: string;
  candidate: Record<string, string>;
  grades: Array<{ id: string; grade_code: string; display_name: string }>;
}) {
  const [requestedGradeId, setRequestedGradeId] = useState(candidate.requested_grade_id ?? "");

  return (
    <form action={saveAdmissionIntakeCandidate} className="space-y-4">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Surname" name="surname" defaultValue={candidate.surname} required />
        <Field label="First names" name="first_names" defaultValue={candidate.first_names} required />
        <Field label="Preferred name" name="preferred_name" defaultValue={candidate.preferred_name} />
        <Field label="Date of birth" name="date_of_birth" type="date" defaultValue={candidate.date_of_birth} />
        <Field label="Sex" name="sex" defaultValue={candidate.sex} />
        <Field label="Citizenship" name="citizenship" defaultValue={candidate.citizenship} />
        <Field label="Home language" name="home_language" defaultValue={candidate.home_language} />
        <Field label="Previous school" name="previous_school" defaultValue={candidate.previous_school} />
        <Field label="Last/current grade" name="last_grade" defaultValue={candidate.last_grade} />
        <SearchableSelect
          label="Intended grade"
          name="requested_grade_id"
          value={requestedGradeId}
          onChange={setRequestedGradeId}
          options={grades.map((grade) => ({ value: grade.id, label: grade.display_name, helper: grade.grade_code }))}
          placeholder="Choose intended grade"
          searchPlaceholder="Search grades"
          clearable
          onClear={() => setRequestedGradeId("")}
        />
      </div>

      <div className="grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs font-semibold">Guardian 1</p>
          <Field label="Name" name="guardian_1_name" defaultValue={candidate.guardian_1_name} />
          <Field label="Relationship" name="guardian_1_relationship" defaultValue={candidate.guardian_1_relationship} />
          <Field label="Phone" name="guardian_1_contact" defaultValue={candidate.guardian_1_contact} />
        </div>
        <div className="space-y-3">
          <p className="text-xs font-semibold">Guardian 2</p>
          <Field label="Name" name="guardian_2_name" defaultValue={candidate.guardian_2_name} />
          <Field label="Relationship" name="guardian_2_relationship" defaultValue={candidate.guardian_2_relationship} />
          <Field label="Phone" name="guardian_2_contact" defaultValue={candidate.guardian_2_contact} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Siblings at school" name="siblings_at_school" defaultValue={candidate.siblings_at_school} />
        <Field label="Document checklist / notes" name="document_checklist" defaultValue={candidate.document_checklist} />
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium">Declarations / review notes</span>
        <textarea name="declarations" defaultValue={candidate.declarations ?? ""} rows={3} className={fieldClass} />
      </label>

      <div className="rounded-[var(--radius-sm)] bg-brand-soft p-3 text-xs leading-5 text-brand-strong">
        Save creates or replaces the staged candidate only. It does not create a learner, guardian or enrolment.
      </div>
      <button type="submit" className="min-h-10 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-white transition hover:brightness-95">
        Save candidate for review
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue ?? ""} required={required} className={fieldClass} />
    </label>
  );
}
