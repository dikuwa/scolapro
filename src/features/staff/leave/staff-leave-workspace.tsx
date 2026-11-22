"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
  StaffLeaveTypeOption,
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
          <LeaveTypeForm schoolId={schoolId} types={workspace.types} />
          <LedgerForm schoolId={schoolId} today={today} workspace={workspace} />
        </div>
      ) : null}
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

type LeaveTypeDraft = {
  code: string;
  displayName: string;
  tracksBalance: "yes" | "no";
  evidenceRequirement: StaffLeaveTypeOption["evidenceRequirement"];
  sourceReference: string;
  active: "yes" | "no";
};

const emptyLeaveTypeDraft: LeaveTypeDraft = {
  code: "", displayName: "", tracksBalance: "no", evidenceRequirement: "optional", sourceReference: "", active: "yes",
};

function LeaveTypeForm({ schoolId, types }: { schoolId: string; types: StaffLeaveTypeOption[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [draft, setDraft] = useState<LeaveTypeDraft>(emptyLeaveTypeDraft);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const editButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);

  function openEditor(type?: StaffLeaveTypeOption, trigger?: HTMLButtonElement | null) {
    if (saving) return;
    returnFocusRef.current = trigger ?? addButtonRef.current;
    setEditorSession((current) => current + 1);
    setEditingCode(type?.code ?? null);
    setDraft(type ? {
      code: type.code,
      displayName: type.name,
      tracksBalance: type.tracksBalance ? "yes" : "no",
      evidenceRequirement: type.evidenceRequirement,
      sourceReference: type.sourceReference ?? "",
      active: type.status === "active" ? "yes" : "no",
    } : { ...emptyLeaveTypeDraft });
    setEditing(true);
  }

  function discardEditor() {
    setEditing(false);
    setEditingCode(null);
    setDraft({ ...emptyLeaveTypeDraft });
    requestAnimationFrame(() => returnFocusRef.current?.focus());
  }

  function closeEditor() {
    if (saving) return;
    discardEditor();
  }

  function savedEditor() {
    setSaving(false);
    discardEditor();
    router.refresh();
  }

  return (
    <section aria-label="Leave type governance" className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3"><span className="scolapro-tone-indigo grid size-9 place-items-center rounded-[var(--radius-sm)]"><Settings2 className="size-4" /></span><div><h2 className="scolapro-section-title">Leave type governance</h2><p className="scolapro-section-description">Approved local leave categories and their evidence/balance rules. No national entitlements are invented.</p></div></div>
        {editing ? <Button type="button" size="sm" variant="neutral" disabled={saving} onClick={closeEditor}>Close</Button> :
          <Button ref={addButtonRef} type="button" size="sm" variant="soft" onClick={() => openEditor(undefined, addButtonRef.current)}>Add leave type</Button>}
      </div>
      {types.length ? <div className="mt-4 divide-y divide-border-subtle" aria-label="Configured leave types">{types.map((type) =>
        <div key={type.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0"><p className="text-sm font-semibold">{type.name} <span className="text-xs font-normal text-muted-foreground">({type.code})</span></p>
            <p className="mt-1 text-xs text-muted-foreground">{type.status === "active" ? "Active" : "Inactive"} · {type.tracksBalance ? "Balance tracked" : "No balance ledger"} · Evidence {type.evidenceRequirement}</p>
            {type.sourceReference ? <p className="mt-1 break-words text-xs text-muted-foreground">Source: {type.sourceReference}</p> : null}
          </div>
          <Button ref={(element) => { editButtonRefs.current[type.id] = element; }} type="button" variant="ghost" size="sm" disabled={saving} onClick={() => openEditor(type, editButtonRefs.current[type.id])} aria-label={`Edit ${type.name}`}>Edit</Button>
        </div>
      )}</div> : <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-border-subtle px-4 py-3 text-sm text-muted-foreground">No leave types configured. Add an approved school leave category to enable staff requests.</div>}

      {editing ? <LeaveTypeEditor
        key={`${editingCode ?? "new"}:${editorSession}`}
        schoolId={schoolId}
        draft={draft}
        setDraft={setDraft}
        editingCode={editingCode}
        onCancel={closeEditor}
        onSubmitting={() => setSaving(true)}
        onFinished={() => setSaving(false)}
        onSaved={savedEditor}
      /> : null}
    </section>
  );
}


function LeaveTypeEditor({ schoolId, draft, setDraft, editingCode, onCancel, onSubmitting, onFinished, onSaved }: {
  schoolId: string;
  draft: LeaveTypeDraft;
  setDraft: React.Dispatch<React.SetStateAction<LeaveTypeDraft>>;
  editingCode: string | null;
  onCancel: () => void;
  onSubmitting: () => void;
  onFinished: () => void;
  onSaved: () => void;
}) {
  // This keyed child owns the action state: opening a different editor discards
  // all previous validation and success responses, not merely the input draft.
  const [state, action, pending] = useActionState(configureStaffLeaveType, initialState);
  const handledState = useRef<StaffLeaveActionState | null>(null);
  useEffect(() => {
    if ((!state.message && !state.fieldErrors) || handledState.current === state) return;
    handledState.current = state;
    if (state.success) {
      if (state.message) toast.success(state.message);
      queueMicrotask(onSaved);
    } else {
      if (state.message) toast.error(state.message);
      // Validation-only errors also finish the request; do not leave Cancel
      // and the rest of the leave-category manager disabled indefinitely.
      queueMicrotask(onFinished);
    }
  }, [state, onFinished, onSaved]);
  return (
      <form action={action} onSubmit={() => onSubmitting()} className="mt-4 grid gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted p-3 sm:grid-cols-2" noValidate>
        <input type="hidden" name="schoolId" value={schoolId} />
        <div><label htmlFor="leave-type-code" className="text-xs font-medium">Code</label><input id="leave-type-code" name="code" value={draft.code} readOnly={editingCode !== null} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))} className={`${fieldClass} mt-1.5 uppercase ${editingCode ? "bg-surface-muted" : ""}`} placeholder="e.g. SCHOOL-LEAVE" /><ErrorText messages={state.fieldErrors?.code} /></div>
        <div><label htmlFor="leave-type-name" className="text-xs font-medium">Name</label><input id="leave-type-name" name="displayName" value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} className={`${fieldClass} mt-1.5`} placeholder="Leave type name" /><ErrorText messages={state.fieldErrors?.displayName} /></div>
        <Picker label="Balance ledger" name="tracksBalance" placeholder="Choose balance behavior" value={draft.tracksBalance} onChange={(value) => setDraft((current) => ({ ...current, tracksBalance: value as LeaveTypeDraft["tracksBalance"] }))} options={[{ value: "no", label: "Not tracked" }, { value: "yes", label: "Track balance", helper: "Balance comes only from immutable ledger entries" }]} />
        <Picker label="Evidence" name="evidenceRequirement" placeholder="Choose evidence rule" value={draft.evidenceRequirement} onChange={(value) => setDraft((current) => ({ ...current, evidenceRequirement: value as LeaveTypeDraft["evidenceRequirement"] }))} options={[{ value: "none", label: "None" }, { value: "optional", label: "Optional" }, { value: "required", label: "Required before approval" }]} />
        <div className="sm:col-span-2"><label htmlFor="leave-source" className="text-xs font-medium">Source reference <span className="font-normal text-muted-foreground">(required for tracked balance)</span></label><input id="leave-source" name="sourceReference" value={draft.sourceReference} onChange={(event) => setDraft((current) => ({ ...current, sourceReference: event.target.value }))} className={`${fieldClass} mt-1.5`} placeholder="Verified policy / school rule reference" /><ErrorText messages={state.fieldErrors?.sourceReference} /></div>
        <Picker label="Status" name="active" placeholder="Choose status" value={draft.active} onChange={(value) => setDraft((current) => ({ ...current, active: value as LeaveTypeDraft["active"] }))} options={[{ value: "yes", label: "Active" }, { value: "no", label: "Inactive" }]} />
        <div className="flex items-end justify-end gap-2"><Button type="button" size="sm" variant="neutral" disabled={pending} onClick={onCancel}>Cancel</Button><Button type="submit" size="sm" disabled={pending} loading={pending}>{editingCode ? "Save changes" : "Save type"}</Button></div>
      </form>
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
        <Picker label="Staff member" name="staffMemberId" placeholder="Choose staff member" value={staffMemberId} onChange={setStaffMemberId} options={workspace.staff.map((staff) => ({ value: staff.id, label: staff.name, helper: staff.employeeNumber ? `Employee ${staff.employeeNumber}` : undefined }))} />
        <Picker label="Leave type" name="leaveTypeId" placeholder="Choose tracked leave type" value={leaveTypeId} onChange={setLeaveTypeId} options={tracked.map((type) => ({ value: type.id, label: type.name }))} />
        <Picker label="Entry kind" name="entryKind" placeholder="Choose ledger entry kind" value={entryKind} onChange={setEntryKind} options={[{ value: "opening", label: "Opening value" }, { value: "accrual", label: "Accrual" }, { value: "adjustment", label: "Adjustment" }]} />
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
      {((row.status === "submitted" && (own || canManage)) || (row.status === "approved" && canManage)) ? <CancelForm requestId={row.id} /> : null}
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
      <Picker label="Decision" name="decision" placeholder="Choose decision" value={decision} onChange={setDecision} options={[{ value: "approve", label: "Approve" }, { value: "reject", label: "Reject" }]} />
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
