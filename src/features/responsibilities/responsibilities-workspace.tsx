"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import {
  assignSchoolDuty,
  endSchoolDuty,
  type SchoolDutyActionState,
} from "@/features/responsibilities/server/actions";
import type {
  SchoolDutyAssignment,
  SchoolDutyCapability,
  SchoolDutyStaffCandidate,
} from "@/features/responsibilities/server/queries";

const initialState: SchoolDutyActionState = {};

function useNotice(state: SchoolDutyActionState) {
  if (state.success && state.message) toast.success(state.message);
  else if (state.message) toast.error(state.message);
}

function formatDate(value: string | null) {
  if (!value) return "Open-ended";
  return new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
}

export function ResponsibilitiesWorkspace({
  schoolId,
  today,
  capabilities,
  assignments,
  staff,
}: {
  schoolId: string;
  today: string;
  capabilities: SchoolDutyCapability[];
  assignments: SchoolDutyAssignment[];
  staff: SchoolDutyStaffCandidate[];
}) {
  const [assignmentState, assignAction, assigning] = useActionState(assignSchoolDuty, initialState);
  const [endState, endAction, ending] = useActionState(endSchoolDuty, initialState);
  const [staffMemberId, setStaffMemberId] = useState("");
  const [dutyKey, setDutyKey] = useState(capabilities[0]?.dutyKey ?? "");
  const [activeFrom, setActiveFrom] = useState(today);
  const [activeTo, setActiveTo] = useState("");

  useNotice(assignmentState);
  useNotice(endState);

  const activeAssignments = assignments.filter((item) => item.currentlyEffective);
  const historicalAssignments = assignments.filter((item) => !item.currentlyEffective);

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div>
          <h2 className="scolapro-section-title">Assign responsibility</h2>
          <p className="scolapro-section-description">
            Add a bounded operational duty without changing the staff member&apos;s base role. Access ends automatically when the duty or school placement ends.
          </p>
        </div>
        <form action={assignAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="schoolId" value={schoolId} />
          <Picker
            label="Staff member"
            name="staffMemberId"
            value={staffMemberId}
            onChange={setStaffMemberId}
            placeholder="Choose staff member"
            options={staff.map((item) => ({
              value: item.staffMemberId,
              label: item.employeeNumber ? `${item.staffName} · ${item.employeeNumber}` : item.staffName,
            }))}
          />
          <Picker
            label="Responsibility"
            name="dutyKey"
            value={dutyKey}
            onChange={setDutyKey}
            placeholder="Choose responsibility"
            options={capabilities.map((item) => ({ value: item.dutyKey, label: item.label }))}
          />
          <DateField label="Starts" name="activeFrom" value={activeFrom} onChange={setActiveFrom} required />
          <DateField label="Ends (optional)" name="activeTo" value={activeTo} onChange={setActiveTo} />
          <div className="sm:col-span-2 lg:col-span-4">
            {dutyKey ? (
              <p className="mb-3 text-xs text-muted-foreground">
                {capabilities.find((item) => item.dutyKey === dutyKey)?.description}
              </p>
            ) : null}
            <Button type="submit" loading={assigning} disabled={assigning || !staffMemberId || !dutyKey}>
              Assign responsibility
            </Button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
        <div className="border-b border-border-subtle px-4 py-4 sm:px-5">
          <h2 className="scolapro-section-title">Current responsibilities</h2>
          <p className="scolapro-section-description">
            {activeAssignments.length} active delegated {activeAssignments.length === 1 ? "responsibility" : "responsibilities"}.
          </p>
        </div>
        {activeAssignments.length ? (
          <div className="divide-y divide-border-subtle">
            {activeAssignments.map((item) => (
              <article key={item.assignmentId} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="scolapro-record-title">{item.staffName}</p>
                    <span className="rounded-[var(--radius-xs)] bg-brand-soft px-2 py-1 text-xs font-medium text-brand-strong">
                      {item.dutyLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.employeeNumber ? `Employee ${item.employeeNumber} · ` : ""}
                    {formatDate(item.activeFrom)} → {formatDate(item.activeTo)}
                  </p>
                </div>
                <form action={endAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="assignmentId" value={item.assignmentId} />
                  <DateField label="End on" name="activeTo" defaultValue={today} required />
                  <Button type="submit" variant="neutral" loading={ending} disabled={ending}>
                    End responsibility
                  </Button>
                </form>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-center sm:px-5">
            <p className="text-sm font-medium">No active delegated responsibilities</p>
            <p className="mt-1 text-xs text-muted-foreground">Base staff roles and dedicated domain custodians remain unchanged.</p>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
        <div className="border-b border-border-subtle px-4 py-4 sm:px-5">
          <h2 className="scolapro-section-title">History</h2>
          <p className="scolapro-section-description">Ended, expired, or not-yet-effective assignments remain visible for audit.</p>
        </div>
        {historicalAssignments.length ? (
          <div className="divide-y divide-border-subtle">
            {historicalAssignments.map((item) => (
              <article key={item.assignmentId} className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{item.staffName}</p>
                  <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-xs text-muted-foreground">{item.dutyLabel}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(item.activeFrom)} → {formatDate(item.activeTo)}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">No historical duty assignments yet.</p>
        )}
      </section>
    </div>
  );
}
