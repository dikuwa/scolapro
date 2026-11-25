"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { completeAcceptedAdmission } from "@/features/admissions/server/actions";

type RegisterClass = {
  id: string;
  grade_id: string;
  academic_year: number;
  class_code: string;
  display_name: string;
};

const genders = [
  { value: "unspecified", label: "Not specified" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
];

export function AcceptedAdmissionEnrolment({
  applicationId,
  academicYear,
  requestedGradeId,
  reuseExistingLearner,
  registerClasses,
  today,
}: {
  applicationId: string;
  academicYear: number;
  requestedGradeId: string | null;
  reuseExistingLearner: boolean;
  registerClasses: RegisterClass[];
  today: string;
}) {
  const eligibleClasses = registerClasses.filter(
    (item) => item.academic_year === academicYear && item.grade_id === requestedGradeId,
  );
  const [editing, setEditing] = useState(false);
  const [classId, setClassId] = useState("");
  const [gender, setGender] = useState("unspecified");
  const [enrolledFrom, setEnrolledFrom] = useState(String(academicYear) === today.slice(0, 4) ? today : "");
  const [confirmed, setConfirmed] = useState(false);
  const [dateCommitted, setDateCommitted] = useState(true);

  function reset() {
    setEditing(false);
    setClassId("");
    setGender("unspecified");
    setEnrolledFrom(String(academicYear) === today.slice(0, 4) ? today : "");
    setConfirmed(false);
    setDateCommitted(true);
  }

  if (!requestedGradeId) {
    return <p className="text-xs text-muted-foreground">Set an intended grade before enrolment.</p>;
  }
  if (!eligibleClasses.length) {
    return <p className="text-xs text-muted-foreground">No register class configured for this admission grade and year.</p>;
  }
  if (!editing) {
    return <div className="min-w-0 lg:col-span-4"><button type="button" onClick={() => setEditing(true)}
      className="min-h-9 rounded-[var(--radius-sm)] bg-brand-soft px-3 text-xs font-semibold text-brand-strong">
      Complete enrolment
    </button></div>;
  }

  return (
    <div className="min-w-0 lg:col-span-4">
      <form action={completeAcceptedAdmission} className="w-full max-w-2xl space-y-4 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted p-4">
        <input type="hidden" name="applicationId" value={applicationId} />
        <p className="text-sm font-semibold">Complete accepted admission · {academicYear}</p>
        <p className="text-xs text-muted-foreground">This creates a learner enrolment and marks the accepted application as enrolled. The operation is final.</p>
        <SearchableSelect
          label="Register class"
          name="registerClassId"
          value={classId}
          onChange={setClassId}
          options={eligibleClasses.map((item) => ({
            value: item.id,
            label: item.display_name,
            helper: item.class_code,
          }))}
          placeholder="Choose register class"
          searchPlaceholder="Search classes"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="block text-xs font-medium">Admission number (optional)</span>
            <input name="admissionNumber" maxLength={120} autoComplete="off"
              className="scolapro-control-surface min-h-10 w-full rounded-[var(--radius-sm)] px-3 text-sm" />
          </label>
          {!reuseExistingLearner ? (
            <label className="block space-y-1">
              <span className="block text-xs font-medium">Preferred name (optional)</span>
              <input name="preferredName" maxLength={120}
                className="scolapro-control-surface min-h-10 w-full rounded-[var(--radius-sm)] px-3 text-sm" />
            </label>
          ) : null}
          {reuseExistingLearner ? (
            <div className="self-center text-xs text-muted-foreground">Existing reviewed learner identity will be reused.</div>
          ) : (
            <Picker label="Gender" name="gender" value={gender} onChange={setGender} options={genders}
              placeholder="Choose gender" />
          )}
          {reuseExistingLearner ? <input type="hidden" name="gender" value="unspecified" /> : null}
          <input type="hidden" name="enrolledFrom" value={enrolledFrom} />
          <DateField label="Enrolled from" name={`enrolledFrom-${applicationId}`} value={enrolledFrom} onChange={setEnrolledFrom} onDraftValidityChange={setDateCommitted} required />
        </div>
        <CheckboxField checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}
          label="I have verified the applicant, class and enrolment date. Create the official enrolment." />
        <EnrolmentFormActions canSubmit={Boolean(classId && enrolledFrom && dateCommitted && confirmed)} onCancel={reset} />
      </form>
    </div>
  );
}

function EnrolmentFormActions({ canSubmit, onCancel }: { canSubmit: boolean; onCancel: () => void }) {
  // This child is inside the form; its status tracks the server action.
  const { pending } = useFormStatus();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending || !canSubmit}
          className="min-h-10 rounded-[var(--radius-sm)] bg-brand px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "Enrolling…" : "Confirm enrolment"}
        </button>
        <button type="button" onClick={onCancel} disabled={pending}
          className="min-h-10 rounded-[var(--radius-sm)] bg-surface px-4 text-xs font-semibold text-foreground shadow-[var(--shadow-xs)] disabled:cursor-not-allowed disabled:opacity-50">
          Cancel
        </button>
      </div>
      {pending ? <p role="status" className="text-xs text-muted-foreground">Saving the official enrolment…</p> : null}
    </div>
  );
}
