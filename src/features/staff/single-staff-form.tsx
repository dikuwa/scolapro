"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { createSingleStaff, type SingleStaffState } from "@/features/staff/server/actions";

const initialState: SingleStaffState = {};
const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";
const assignmentOptions = [
  { value: "teacher", label: "Teacher", helper: "Teaching staff who can later be allocated to subjects and classes" },
  { value: "management", label: "Management", helper: "Principal, deputy, HOD or other management placement" },
  { value: "support", label: "Support staff", helper: "Administrative, library, technical or support placement" },
  { value: "staff", label: "General staff", helper: "General school staff placement" },
  { value: "temporary", label: "Temporary", helper: "Temporary or short-term staff placement" },
  { value: "other", label: "Other", helper: "Another governed staff placement type" },
];

function FieldError({ messages }: { messages?: string[] }) {
  return messages?.[0] ? <p className="mt-1 text-xs text-[color:var(--danger)]">{messages[0]}</p> : null;
}

export function SingleStaffForm({ schoolId, today }: { schoolId: string; today: string }) {
  const [state, action, pending] = useActionState(createSingleStaff, initialState);
  const [assignmentType, setAssignmentType] = useState("teacher");

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><UserPlus className="size-4" aria-hidden="true" /></span>
        <div><h2 className="scolapro-section-title">Add staff member</h2><p className="scolapro-section-description">Create one staff record and school placement. A ScolaPro login is optional and can be invited separately.</p></div>
      </div>

      <form action={action} className="mt-5 space-y-4" noValidate>
        <input type="hidden" name="schoolId" value={schoolId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="staff-employee-number" className="text-xs font-medium">Employee number</label>
            <input id="staff-employee-number" name="employeeNumber" className={`${fieldClass} mt-1.5 uppercase`} placeholder="EMP-001" autoCapitalize="characters" />
            <p className="mt-1 text-[0.68rem] text-muted-foreground">Used as the stable identity key. Existing matching staff can be linked instead of duplicated.</p>
            <FieldError messages={state.fieldErrors?.employeeNumber} />
          </div>
          <div>
            <label htmlFor="staff-position-title" className="text-xs font-medium">Position title <span className="font-normal text-muted-foreground">(optional)</span></label>
            <input id="staff-position-title" name="positionTitle" className={`${fieldClass} mt-1.5`} placeholder="Science Teacher" />
            <p className="mt-1 text-[0.68rem] text-muted-foreground">Human-readable school position; access permissions are assigned separately.</p>
            <FieldError messages={state.fieldErrors?.positionTitle} />
          </div>
          <div>
            <label htmlFor="staff-first-name" className="text-xs font-medium">First name</label>
            <input id="staff-first-name" name="firstName" className={`${fieldClass} mt-1.5`} placeholder="First name" autoComplete="given-name" />
            <FieldError messages={state.fieldErrors?.firstName} />
          </div>
          <div>
            <label htmlFor="staff-last-name" className="text-xs font-medium">Last name</label>
            <input id="staff-last-name" name="lastName" className={`${fieldClass} mt-1.5`} placeholder="Last name" autoComplete="family-name" />
            <FieldError messages={state.fieldErrors?.lastName} />
          </div>
          <div>
            <Picker label="Placement type" name="assignmentType" value={assignmentType} onChange={setAssignmentType} placeholder="Choose placement type" options={assignmentOptions} />
            <FieldError messages={state.fieldErrors?.assignmentType} />
          </div>
          <div>
            <label htmlFor="staff-effective-from" className="text-xs font-medium">Placement starts</label>
            <input id="staff-effective-from" name="effectiveFrom" type="date" defaultValue={today} className={`${fieldClass} mt-1.5`} />
            <FieldError messages={state.fieldErrors?.effectiveFrom} />
          </div>
        </div>

        <div className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-3 text-[0.68rem] leading-relaxed text-muted-foreground">
          Adding staff here does not create a user account or grant application roles. Staff can already be used for school operations such as timetable allocation; invite them later only if they need to sign in.
        </div>

        <div className="flex justify-end border-t border-border-subtle pt-4">
          <button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:opacity-60">
            {pending ? <Spinner className="size-4 text-white" /> : <Plus className="size-4" aria-hidden="true" />}
            {pending ? "Adding…" : "Add staff member"}
          </button>
        </div>
      </form>
    </section>
  );
}
