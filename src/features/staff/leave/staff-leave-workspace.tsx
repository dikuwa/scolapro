"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  CalendarOff,
  CheckCircle2,
  FileLock2,
  Scale,
  Settings2,
  ShieldCheck,
  WalletCards,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import {
  cancelStaffLeave,
  configureStaffLeaveType,
  decideStaffLeave,
  postStaffLeaveLedgerEntry,
  submitStaffLeave,
  uploadStaffLeaveEvidence,
  type StaffLeaveActionState,
} from "@/features/staff/leave/server/actions";
import type {
  StaffLeaveRequestRow,
  StaffLeaveWorkspace,
} from "@/features/staff/leave/server/workspace";

const initialState: StaffLeaveActionState = {};
const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

function useActionToast(state: StaffLeaveActionState) {
  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
}

function ErrorText({ messages }: { messages?: string[] }) {
  return messages?.[0] ? <p className="mt-1 text-xs text-[color:var(--danger)]">{messages[0]}</p> : null;
}

function fmtDate(value: string) {
  return new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
}

function statusClass(status: StaffLeaveRequestRow["status"]) {
  if (status === "approved") return "bg-[color:var(--success-soft)] text-[color:var(--success)]";
  if (status === "rejected") return "bg-[color:var(--danger-soft)] text-[color:var(--danger)]";
  if (status === "cancelled") return "bg-surface-muted text-muted-foreground";
  return "bg-[color:var(--warning-soft)] text-[color:var(--warning)]";
}

export function StaffLeaveWorkspaceView({
  schoolId,
  viewerStaffId,
  canManage,
  today,
  workspace,
}: {
  schoolId: string;
  viewerStaffId: string | null;
  canManage: boolean;
  today: string;
  workspace: StaffLeaveWorkspace;
}) {
  const submitted = workspace.requests.filter((row) => row.status === "submitted").length;
  const activeAbsences = workspace.requests.filter((row) => row.absenceStatus === "active").length;
  const approved = workspace.requests.filter((row) => row.status === "approved").length;
  const trackedTypes = workspace.types.filter((type) => type.tracksBalance && type.status === "active").length;

  return (
    <div className="space-y-5">
      <section className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-4">
        {[
          ["Awaiting review", submitted, CalendarOff],
          ["Approved", approved, CheckCircle2],
          ["Active absences", activeAbsences, ShieldCheck],
          ["Tracked balances", trackedTypes, WalletCards],
        ].map(([label, value, Icon], index) => {
          const SummaryIcon = Icon as typeof CalendarOff;
          return (
            <div key={String(label)} className={`flex items-center justify-between gap-3 px-4 py-4 sm:px-5 ${index ? "border-t border-border-subtle sm:border-l sm:border-t-0" : ""}`}>
              <div><p className="text-xs font-medium text-muted-foreground">{label as string}</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">{value as number}</p></div>
              <span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><SummaryIcon className="size-4" aria-hidden="true" /></span>
            </div>
          );
        })}
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-start gap-3">
          <span className="scolapro-tone-sky grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><CalendarOff className="size-4" aria-hidden="true" /></span>
          <div>
            <h2 className="scolapro-section-title">My leave request</h2>
            <p className="scolapro-section-description">Submit dates and requested units for review. ScolaPro does not infer Ministry entitlements or automatically change the school timetable.</p>
          </div>
        </div>
        {viewerStaffId ? (
          <LeaveRequestForm schoolId={schoolId} today={today} workspace={workspace} />
        ) : (
          <div className="mt-4 rounded-[var(--radius-sm)] bg-[color:var(--warning-soft)] px-3 py-3 text-xs leading-5 text-[color:var(--warning)]">Your account is not linked to a current staff identity, so you can manage school leave but cannot submit a personal leave request.</div>
        )}
      </section>

      {canManage ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <LeaveTypeForm schoolId={schoolId} />
          <LedgerForm schoolId={schoolId} today={today} workspace={workspace} />
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
        <div className="border-b border-border-subtle p-4 sm:p-5">
          <h2 className="scolapro-section-title">{canManage ? "School leave requests" : "My leave history"}</h2>
          <p className="scolapro-section-description">{canManage ? "Review submitted requests, evidence state, ledger-derived balance and timetable impact awareness." : "Approval decisions and cancellations remain visible as historical records."}</p>
        </div>
        {workspace.requests.length ? (
          <div className="divide-y divide-border-subtle">
            {workspace.requests.map((row) => (
              <LeaveRequestCard
                key={row.id}
                row={row}
                schoolId={schoolId}
                viewerStaffId={viewerStaffId}
                canManage={canManage}
              />
            ))}
          </div>
        ) : (
          <div className="px-4 py-10 text-center sm:px-5">
            <p className="text-sm font-medium">No leave requests yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Requests will appear here without creating a second staff or timetable record.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function LeaveRequestForm({ schoolId, today, workspace }: { schoolId: string; today: string; workspace: StaffLeaveWorkspace }) {
  const [state, action, pending] = useActionState(submitStaffLeave, initialState);
  const activeTypes = workspace.types.filter((type) => type.status === "active");
  const [leaveTypeId, setLeaveTypeId] = useState(activeTypes[0]?.id ?? "");
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(today);
  useActionToast(state);

  if (!activeTypes.length) {
    return <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-3 text-xs leading-5 text-muted-foreground">No active leave type has been configured. A school leave manager must add the governed type before requests can be submitted.</div>;
  }

  return (
    <form action={action} className="mt-5 grid gap-4 lg:grid-cols-2" noValidate>
      <input type="hidden" name="schoolId" value={schoolId} />
      <Picker
        label="Leave type"
        name="leaveTypeId"
        value={leaveTypeId}
        onChange={setLeaveTypeId}
        placeholder="Choose leave type"
        options={activeTypes.map((type) => ({
          value: type.id,
          label: type.name,
          helper: `${type.tracksBalance ? "Balance tracked" : "No balance ledger"} · Evidence ${type.evidenceRequirement}`,
        }))}
      />
      <div>
        <label htmlFor="leave-requested-units" className="text-xs font-medium">Requested units</label>
        <input id="leave-requested-units" name="requestedUnits" type="number" min="0.01" max="366" step="0.25" className={`${fieldClass} mt-1.5`} />
        <p className="mt-1 text-[0.68rem] text-muted-foreground">Units are reviewed explicitly; ScolaPro does not infer entitlement rules.</p>
        <ErrorText messages={state.fieldErrors?.requestedUnits} />
      </div>
      <DateField label="Starts" name="startsOn" value={startsOn} onChange={setStartsOn} required error={state.fieldErrors?.startsOn?.[0]} />
      <DateField label="Ends" name="endsOn" value={endsOn} onChange={setEndsOn} required error={state.fieldErrors?.endsOn?.[0]} />
      <div className="lg:col-span-2">
        <label htmlFor="leave-reason" className="text-xs font-medium">Reason <span className="font-normal text-muted-foreground">(optional)</span></label>
        <textarea id="leave-reason" name="reason" rows={3} maxLength={1000} className={`${fieldClass} mt-1.5 py-2.5`} />
        <ErrorText messages={state.fieldErrors?.reason} />
      </div>
      <div className="flex justify-end lg:col-span-2">
        <button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60">
          {pending ? <Spinner className="size-4 text-white" /> : <CalendarOff className="size-4" />}
          {pending ? "Submitting…" : "Submit request"}
        </button>
      </div>
    </form>
  );
}

function LeaveTypeForm({ schoolId }: { schoolId: string }) {
  const [state, action, pending] = useActionState(configureStaffLeaveType, initialState);
  const [tracksBalance, setTracksBalance] = useState("no");
  const [evidenceRequirement, setEvidenceRequirement] = useState("optional");
  const [active, setActive] = useState("yes");
  useActionToast(state);

  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-start gap-3"><span className="scolapro-tone-indigo grid size-9 place-items-center rounded-[var(--radius-sm)]"><Settings2 className="size-4" /></span><div><h2 className="scolapro-section-title">Leave type governance</h2><p className="scolapro-section-description">Configure local leave categories without inventing national entitlement values.</p></div></div>
      <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2" noValidate>
        <input type="hidden" name="schoolId" value={schoolId} />
        <div><label htmlFor="leave-type-code" className="text-xs font-medium">Code</label><input id="leave-type-code" name="code" className={`${fieldClass} mt-1.5 uppercase`} placeholder="e.g. SCHOOL-LEAVE" /><ErrorText messages={state.fieldErrors?.code} /></div>
        <div><label htmlFor="leave-type-name" className="text-xs font-medium">Name</label><input id="leave-type-name" name="displayName" className={`${fieldClass} mt-1.5`} placeholder="Leave type name" /><ErrorText messages={state.fieldErrors?.displayName} /></div>
        <Picker label="Balance ledger" name="tracksBalance" value={tracksBalance} onChange={setTracksBalance} options={[{ value: "no", label: "Not tracked" }, { value: "yes", label: "Track balance", helper: "Balance comes only from immutable ledger entries" }]} />
        <Picker label="Evidence" name="evidenceRequirement" value={evidenceRequirement} onChange={setEvidenceRequirement} options={[{ value: "none", label: "None" }, { value: "optional", label: "Optional" }, { value: "required", label: "Required before approval" }]} />
        <div className="sm:col-span-2"><label htmlFor="leave-source" className="text-xs font-medium">Source reference <span className="font-normal text-muted-foreground">(recommended)</span></label><input id="leave-source" name="sourceReference" className={`${fieldClass} mt-1.5`} placeholder="Verified policy / school rule reference" /><p className="mt-1 text-[0.68rem] text-muted-foreground">Use a source reference when a rule is policy-derived. No Ministry entitlement is pre-seeded.</p></div>
        <Picker label="Status" name="active" value={active} onChange={setActive} options={[{ value: "yes", label: "Active" }, { value: "no", label: "Inactive" }]} />
        <div className="flex items-end justify-end"><button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white disabled:opacity-60">{pending ? <Spinner className="size-4 text-white" /> : <Settings2 className="size-4" />}{pending ? "Saving…" : "Save type"}</button></div>
      </form>
    </section>
  );
}

function LedgerForm({ schoolId, today, workspace }: { schoolId: string; today: string; workspace: StaffLeaveWorkspace }) {
  const [state, action, pending] = useActionState(postStaffLeaveLedgerEntry, initialState);
  const tracked = workspace.types.filter((type) => type.status === "active" && type.tracksBalance);
  const [staffMemberId, setStaffMemberId] = useState(workspace.staff[0]?.id ?? "");
  const [leaveTypeId, setLeaveTypeId] = useState(tracked[0]?.id ?? "");
  const [entryKind, setEntryKind] = useState("adjustment");
  const [effectiveOn, setEffectiveOn] = useState(today);
  useActionToast(state);

  if (!workspace.staff.length || !tracked.length) return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-start gap-3"><span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><Scale className="size-4" /></span><div><h2 className="scolapro-section-title">Leave ledger</h2><p className="scolapro-section-description">A tracked leave type and active staff placement are required before sourced ledger entries can be posted.</p></div></div>
    </section>
  );

  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-start gap-3"><span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><Scale className="size-4" /></span><div><h2 className="scolapro-section-title">Leave ledger</h2><p className="scolapro-section-description">Post sourced opening, accrual or adjustment entries. Existing ledger rows cannot be edited or deleted.</p></div></div>
      <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2" noValidate>
        <input type="hidden" name="schoolId" value={schoolId} />
        <Picker label="Staff member" name="staffMemberId" value={staffMemberId} onChange={setStaffMemberId} options={workspace.staff.map((staff) => ({ value: staff.id, label: staff.name, helper: staff.employeeNumber ? `Employee ${staff.employeeNumber}` : undefined }))} />
        <Picker label="Leave type" name="leaveTypeId" value={leaveTypeId} onChange={setLeaveTypeId} options={tracked.map((type) => ({ value: type.id, label: type.name }))} />
        <Picker label="Entry kind" name="entryKind" value={entryKind} onChange={setEntryKind} options={[{ value: "opening", label: "Opening value" }, { value: "accrual", label: "Accrual" }, { value: "adjustment", label: "Adjustment" }]} />
        <div><label htmlFor="leave-units-delta" className="text-xs font-medium">Units change</label><input id="leave-units-delta" name="unitsDelta" type="number" step="0.25" className={`${fieldClass} mt-1.5`} placeholder="e.g. 10 or -1" /><ErrorText messages={state.fieldErrors?.unitsDelta} /></div>
        <DateField label="Effective date" name="effectiveOn" value={effectiveOn} onChange={setEffectiveOn} required error={state.fieldErrors?.effectiveOn?.[0]} />
        <div><label htmlFor="leave-ledger-source" className="text-xs font-medium">Source reference</label><input id="leave-ledger-source" name="sourceReference" className={`${fieldClass} mt-1.5`} placeholder="Verified record / policy reference" /><ErrorText messages={state.fieldErrors?.sourceReference} /></div>
        <div className="sm:col-span-2"><label htmlFor="leave-ledger-note" className="text-xs font-medium">Note <span className="font-normal text-muted-foreground">(optional)</span></label><input id="leave-ledger-note" name="note" className={`${fieldClass} mt-1.5`} /></div>
        <div className="flex justify-end sm:col-span-2"><button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white disabled:opacity-60">{pending ? <Spinner className="size-4 text-white" /> : <Scale className="size-4" />}{pending ? "Posting…" : "Post ledger entry"}</button></div>
      </form>
    </section>
  );
}

function LeaveRequestCard({ row, schoolId, viewerStaffId, canManage }: { row: StaffLeaveRequestRow; schoolId: string; viewerStaffId: string | null; canManage: boolean }) {
  const own = viewerStaffId === row.staffMemberId;
  return (
    <article className="p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{row.staffName}</p><span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.65rem] font-semibold capitalize ${statusClass(row.status)}`}>{row.status}</span></div>
          <p className="mt-1 text-sm text-muted-foreground">{row.leaveTypeName} · {fmtDate(row.startsOn)} – {fmtDate(row.endsOn)}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Requested <strong className="text-foreground">{row.requestedUnits}</strong></span>
            {row.approvedUnits !== null ? <span>Approved <strong className="text-foreground">{row.approvedUnits}</strong></span> : null}
            {row.tracksBalance ? <span>Balance <strong className="text-foreground">{row.balanceUnits}</strong></span> : null}
            <span>Evidence <strong className="text-foreground">{row.evidenceCount}</strong></span>
            <span>Timetable slots <strong className="text-foreground">{row.timetableSlotsAffected}</strong></span>
          </div>
          {row.reason ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{row.reason}</p> : null}
          {row.decisionNote ? <p className="mt-2 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2 text-xs text-muted-foreground">Decision note: {row.decisionNote}</p> : null}
        </div>
        {row.absenceStatus ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><CalendarOff className="size-3.5" />Operational absence: {row.absenceStatus}</span> : null}
      </div>

      {row.status === "submitted" ? (
        <div className="mt-4 grid gap-3 border-t border-border-subtle pt-4 lg:grid-cols-2">
          {own ? <EvidenceForm schoolId={schoolId} requestId={row.id} /> : null}
          {canManage ? <DecisionForm row={row} /> : null}
        </div>
      ) : null}
      {(row.status === "submitted" || row.status === "approved") && (own || canManage) ? <CancelForm requestId={row.id} /> : null}
    </article>
  );
}

function EvidenceForm({ schoolId, requestId }: { schoolId: string; requestId: string }) {
  const [state, action, pending] = useActionState(uploadStaffLeaveEvidence, initialState);
  useActionToast(state);
  return (
    <form action={action} className="rounded-[var(--radius-sm)] bg-surface-muted p-3">
      <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="requestId" value={requestId} />
      <div className="flex items-center gap-2"><FileLock2 className="size-4 text-brand" /><p className="text-xs font-semibold">Private evidence</p></div>
      <input name="evidence" type="file" accept=".pdf,image/jpeg,image/png,image/webp" className="mt-2 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-[var(--radius-xs)] file:border-0 file:bg-surface-elevated file:px-3 file:py-2 file:text-xs file:font-medium file:text-foreground" />
      <ErrorText messages={state.fieldErrors?.evidence} />
      <button type="submit" disabled={pending} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-surface-elevated px-3 text-xs font-medium shadow-[var(--shadow-xs)] disabled:opacity-60">{pending ? <Spinner className="size-3.5" /> : <FileLock2 className="size-3.5" />}{pending ? "Uploading…" : "Upload evidence"}</button>
    </form>
  );
}

function DecisionForm({ row }: { row: StaffLeaveRequestRow }) {
  const [state, action, pending] = useActionState(decideStaffLeave, initialState);
  const [decision, setDecision] = useState("approve");
  useActionToast(state);
  return (
    <form action={action} className="rounded-[var(--radius-sm)] bg-surface-muted p-3">
      <input type="hidden" name="requestId" value={row.id} />
      <Picker label="Decision" name="decision" value={decision} onChange={setDecision} options={[{ value: "approve", label: "Approve" }, { value: "reject", label: "Reject" }]} />
      {decision === "approve" ? <div className="mt-3"><label htmlFor={`approved-${row.id}`} className="text-xs font-medium">Approved units</label><input id={`approved-${row.id}`} name="approvedUnits" type="number" min="0.01" max="366" step="0.25" defaultValue={row.requestedUnits} className={`${fieldClass} mt-1.5`} /><ErrorText messages={state.fieldErrors?.approvedUnits} /></div> : null}
      <div className="mt-3"><label htmlFor={`decision-note-${row.id}`} className="text-xs font-medium">Decision note <span className="font-normal text-muted-foreground">(optional)</span></label><input id={`decision-note-${row.id}`} name="note" className={`${fieldClass} mt-1.5`} /></div>
      <button type="submit" disabled={pending} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-medium text-white disabled:opacity-60">{pending ? <Spinner className="size-3.5 text-white" /> : decision === "approve" ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}{pending ? "Saving…" : "Save decision"}</button>
    </form>
  );
}

function CancelForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(cancelStaffLeave, initialState);
  const [open, setOpen] = useState(false);
  useActionToast(state);
  return open ? (
    <form action={action} className="mt-3 flex flex-col gap-2 rounded-[var(--radius-sm)] border border-border-subtle p-3 sm:flex-row sm:items-end">
      <input type="hidden" name="requestId" value={requestId} />
      <div className="min-w-0 flex-1"><label htmlFor={`cancel-${requestId}`} className="text-xs font-medium">Cancellation reason</label><input id={`cancel-${requestId}`} name="reason" className={`${fieldClass} mt-1.5`} /><ErrorText messages={state.fieldErrors?.reason} /></div>
      <div className="flex gap-2"><button type="submit" disabled={pending} className="min-h-10 rounded-[var(--radius-sm)] bg-[color:var(--danger)] px-3 text-xs font-medium text-white disabled:opacity-60">{pending ? "Cancelling…" : "Confirm cancellation"}</button><button type="button" onClick={() => setOpen(false)} className="min-h-10 rounded-[var(--radius-sm)] bg-surface-muted px-3 text-xs font-medium">Keep request</button></div>
    </form>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="mt-3 text-xs font-medium text-[color:var(--danger)] hover:underline">Cancel this request</button>
  );
}
