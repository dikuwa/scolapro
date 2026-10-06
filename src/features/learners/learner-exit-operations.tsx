[Reading 90 lines from start (total: 90 lines, 0 remaining)]

"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { advanceLearnerTransfer, exitLearnerEnrolment, publishCompletedProgression, requestLearnerTransfer, type LearnerExitActionState } from "@/features/learners/server/exit-operations";
import type { LearnerCompletionCandidate, LearnerTransferDestination, LearnerTransferHistory } from "@/features/learners/server/exit-queries";
import { getNamibiaDateKey } from "@/lib/namibia-date";

const initialState: LearnerExitActionState = {};
const statusOptions = [{ value: "left", label: "Left school" }, { value: "withdrawn", label: "Withdrawn" }];
const today = getNamibiaDateKey();

function Feedback({ state }: { state: LearnerExitActionState }) {
  if (!state.message) return null;
  return <p role={state.success ? "status" : "alert"} className={state.success ? "text-xs text-[color:var(--success)]" : "text-xs text-[color:var(--danger)]"}>{state.message}</p>;
}
function ConfirmField() {
  return <label className="flex items-start gap-2 text-xs text-muted-foreground"><input className="mt-0.5 size-4 accent-[var(--brand)]" type="checkbox" name="confirmation" value="confirmed" required /><span>I confirm this operational action and its effective date.</span></label>;
}

export function LearnerExitOperations({ learnerId, schoolId, enrolmentId, currentStatus, transfers, completion, destinations }: { learnerId: string; schoolId: string; enrolmentId: string; currentStatus: string; transfers: LearnerTransferHistory[]; completion: LearnerCompletionCandidate | null; destinations: LearnerTransferDestination[] }) {
  const [exitState, exitAction, exitPending] = useActionState(exitLearnerEnrolment, initialState);
  const [transferState, transferAction, transferPending] = useActionState(requestLearnerTransfer, initialState);
  const [lifecycleState, lifecycleAction, lifecyclePending] = useActionState(advanceLearnerTransfer, initialState);
  const [completionState, completionAction, completionPending] = useActionState(publishCompletedProgression, initialState);
  const [exitStatus, setExitStatus] = useState("left");
  const [exitDate, setExitDate] = useState(today);
  const [transferDate, setTransferDate] = useState(today);
  const [completionDate, setCompletionDate] = useState(today);
  const [destinationMode, setDestinationMode] = useState<"registered" | "external">("registered");
  const [destinationSchoolId, setDestinationSchoolId] = useState("");

  const destinationOptions = destinations.map((school) => ({
    value: school.schoolId,
    label: school.schoolName,
    helper: [school.town, school.emisNumber ? `EMIS ${school.emisNumber}` : null].filter(Boolean).join(" · "),
  }));

  return <section id="learner-transfer-workflow" className="mt-5 scroll-mt-4 bg-surface shadow-[var(--shadow-xs)]" aria-labelledby="learner-exit-heading">
    <div className="border-b border-border-subtle px-4 py-3.5 sm:px-5"><h2 id="learner-exit-heading" className="scolapro-section-title">Learner exit operations</h2><p className="scolapro-section-description">Use the governed transfer and enrolment lifecycle. Learner identity and historical records remain intact.</p></div>
    <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-2">
      <form action={exitAction} className="space-y-3 rounded-[var(--radius-sm)] border border-border-subtle p-3 sm:p-4">
        <div><h3 className="text-sm font-semibold">Leave school</h3><p className="mt-1 text-xs text-muted-foreground">Use this for non-transfer exits. A learner transfer uses the dedicated workflow alongside it.</p></div>
        <input type="hidden" name="enrolmentId" value={enrolmentId} /><input type="hidden" name="learnerId" value={learnerId} />
        <div className="grid gap-3 sm:grid-cols-2"><Picker label="Outcome" name="status" value={exitStatus} onChange={setExitStatus} options={statusOptions} placeholder="Choose outcome" /><DateField label="Effective date" name="effectiveOn" value={exitDate} onChange={setExitDate} max={today} required /></div>
        <label className="block text-xs font-medium" htmlFor="learner-exit-reason">Reason or outcome note<span className="text-[color:var(--danger)]"> *</span><textarea id="learner-exit-reason" name="reason" required minLength={2} maxLength={800} rows={3} className="mt-1.5 min-h-20 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-2 text-sm outline-none focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></label>
        <ConfirmField /><button type="submit" disabled={exitPending || currentStatus !== "current"} className="inline-flex min-h-10 items-center rounded-[var(--radius-sm)] bg-brand px-3 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:opacity-50">{exitPending ? <><Spinner className="mr-2 size-4" />Saving…</> : "Record exit"}</button><Feedback state={exitState} />
      </form>

      <form action={transferAction} className="space-y-3 rounded-[var(--radius-sm)] border border-border-subtle p-3 sm:p-4">
        <div><h3 className="text-sm font-semibold">Transfer learner</h3><p className="mt-1 text-xs text-muted-foreground">Choose a registered school where possible. Approval unlocks the official transfer form and creates the CRC handoff requirement.</p></div>
        <input type="hidden" name="enrolmentId" value={enrolmentId} /><input type="hidden" name="learnerId" value={learnerId} /><input type="hidden" name="schoolId" value={schoolId} />
        <DateField label="Effective / departure date" name="effectiveOn" value={transferDate} onChange={setTransferDate} min={today} required />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setDestinationMode("registered")} className={`rounded-[var(--radius-xs)] px-3 py-2 text-xs font-medium ${destinationMode === "registered" ? "bg-brand-soft text-brand-strong" : "bg-surface-muted text-muted-foreground"}`}>Registered school</button>
          <button type="button" onClick={() => setDestinationMode("external")} className={`rounded-[var(--radius-xs)] px-3 py-2 text-xs font-medium ${destinationMode === "external" ? "bg-brand-soft text-brand-strong" : "bg-surface-muted text-muted-foreground"}`}>External / other school</button>
        </div>
        {destinationMode === "registered" ? <>
          <Picker label="Destination school" value={destinationSchoolId} onChange={setDestinationSchoolId} options={destinationOptions} placeholder="Search or choose school" searchable />
          <input type="hidden" name="destinationSchoolId" value={destinationSchoolId} />
        </> : <div className="grid gap-3">
          <label className="block text-xs font-medium">Destination school name<span className="text-[color:var(--danger)]"> *</span><input name="destinationName" required maxLength={240} className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></label>
          <label className="block text-xs font-medium">Destination school address<span className="text-[color:var(--danger)]"> *</span><textarea name="destinationAddress" required maxLength={500} rows={2} className="mt-1.5 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></label>
        </div>}
        <label className="block text-xs font-medium" htmlFor="transfer-reason">Reason for departure<span className="text-[color:var(--danger)]"> *</span><textarea id="transfer-reason" name="reason" required minLength={2} maxLength={800} rows={3} className="mt-1.5 min-h-20 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></label>
        <ConfirmField /><button type="submit" disabled={transferPending || currentStatus !== "current" || (destinationMode === "registered" && !destinationSchoolId)} className="inline-flex min-h-10 items-center rounded-[var(--radius-sm)] bg-brand-soft px-3 text-sm font-semibold text-brand-strong disabled:opacity-50">{transferPending ? <><Spinner className="mr-2 size-4" />Requesting…</> : "Request transfer"}</button><Feedback state={transferState} />
      </form>
    </div>

    <div className="border-t border-border-subtle px-4 py-4 sm:px-5">
      <h3 className="text-sm font-semibold">Lifecycle history</h3>
      {transfers.length ? <div className="mt-3 space-y-3">{transfers.map((transfer) => <div key={transfer.id} className="rounded-[var(--radius-sm)] border border-border-subtle p-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold capitalize">Transfer · {transfer.status}</span><span className="text-muted-foreground">Requested {transfer.requestedOn}</span></div>
        <p className="mt-1 text-muted-foreground">{transfer.destinationName ?? "Registered destination school"}{transfer.destinationAddress ? ` · ${transfer.destinationAddress}` : ""}{transfer.effectiveOn ? ` · effective ${transfer.effectiveOn}` : ""}</p>
        <p className="mt-1">{transfer.reason ?? "No reason recorded"}</p>
        {transfer.status === "requested" ? <div className="mt-3 flex flex-wrap gap-2"><TransferLifecycleForm learnerId={learnerId} transferId={transfer.id} action="approve" pending={lifecyclePending} actionFn={lifecycleAction} label="Approve" /><TransferLifecycleForm learnerId={learnerId} transferId={transfer.id} action="cancel" pending={lifecyclePending} actionFn={lifecycleAction} label="Cancel" /></div> : null}
        {["approved","completed"].includes(transfer.status) ? <div className="mt-3 flex flex-wrap items-center gap-2"><Link href={`/school/crc-custody/transfer-form/${transfer.id}`} className="inline-flex min-h-9 items-center rounded-[var(--radius-xs)] bg-surface-muted px-2.5 font-semibold">{transfer.status === "approved" ? "Open transfer form" : "Review transfer form"}</Link>{transfer.status === "approved" ? (transfer.effectiveOn && transfer.effectiveOn > today ? <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-2 text-[0.68rem] text-muted-foreground">Complete on or after {transfer.effectiveOn}</span> : <TransferLifecycleForm learnerId={learnerId} transferId={transfer.id} action="complete" pending={lifecyclePending} actionFn={lifecycleAction} label="Complete transfer" />) : null}<span className="text-[0.68rem] text-muted-foreground">CRC handoff: {transfer.crcHandoffStatus.replaceAll("_"," ")}</span></div> : null}
      </div>)}</div> : <p className="mt-2 text-xs text-muted-foreground">No transfer requests are recorded for this enrolment.</p>}
      <Feedback state={lifecycleState} />
      {completion ? <div className="mt-5 rounded-[var(--radius-sm)] border border-border-subtle p-3"><div><h3 className="text-sm font-semibold">Completed school-leaving outcome</h3><p className="mt-1 text-xs text-muted-foreground">A locked completed progression is ready for the existing publication lifecycle.</p></div><form action={completionAction} className="mt-3 flex flex-wrap items-end gap-3"><input type="hidden" name="progressionId" value={completion.id} /><input type="hidden" name="learnerId" value={learnerId} /><DateField label="Effective date" name="effectiveOn" value={completionDate} onChange={setCompletionDate} max={today} required /><ConfirmField /><button type="submit" disabled={completionPending} className="inline-flex min-h-10 items-center rounded-[var(--radius-sm)] bg-brand px-3 text-sm font-semibold text-white disabled:opacity-50">{completionPending ? <><Spinner className="mr-2 size-4" />Publishing…</> : "Publish completed outcome"}</button></form><Feedback state={completionState} /></div> : null}
    </div>
  </section>;
}

function TransferLifecycleForm({ learnerId, transferId, action, pending, actionFn, label }: { learnerId: string; transferId: string; action: "approve" | "complete" | "cancel"; pending: boolean; actionFn: (formData: FormData) => void; label: string }) {
  return <form action={actionFn}><input type="hidden" name="learnerId" value={learnerId} /><input type="hidden" name="transferId" value={transferId} /><input type="hidden" name="action" value={action} /><input type="hidden" name="confirmation" value="confirmed" /><button type="submit" disabled={pending} className="min-h-9 rounded-[var(--radius-xs)] bg-brand-soft px-2.5 text-xs font-semibold text-brand-strong disabled:opacity-50">{pending ? "Working…" : label}</button></form>;
}

[executed on device: MacBook-Pro-2.fritz.box (8ccb94b2-5fc5-4a5b-81c0-6db73d8bfbda)]