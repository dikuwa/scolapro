"use client";

import { useActionState, useEffect, useState } from "react";
import { FilePenLine, Send } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { cancelProfileChange, submitLearnerProfileChange, type ProfileChangeActionState } from "@/features/profile-changes/server/actions";
import type { ProfileChangeRequestRow } from "@/features/profile-changes/server/queries";

const initialState: ProfileChangeActionState = {};
const fields = [
  ["first_names", "First names"],
  ["initials", "Initials"],
  ["surname", "Surname"],
  ["preferred_name", "Preferred name"],
  ["date_of_birth", "Date of birth (YYYY-MM-DD)"],
  ["sex", "Sex"],
  ["national_id", "National ID"],
  ["birth_certificate_number", "Birth certificate number"],
] as const;

const sourceOptions = [
  { value: "parent_guardian_report", label: "Parent / guardian report" },
  { value: "learner_report", label: "Learner report" },
  { value: "teacher_observation", label: "Teacher observation" },
  { value: "admin_detected_error", label: "Admin-detected error" },
  { value: "verified_document", label: "Verified document" },
  { value: "other", label: "Other" },
];

function RequestHistory({ learnerId, requests }: { learnerId: string; requests: ProfileChangeRequestRow[] }) {
  const [state, action, pending] = useActionState(cancelProfileChange, initialState);
  useEffect(() => {
    if (state.message) state.success ? toast.success(state.message) : toast.error(state.message);
  }, [state]);
  if (!requests.length) return <p className="mt-3 text-xs text-muted-foreground">No correction requests have been submitted for this learner.</p>;
  return <div className="mt-4 space-y-2">{requests.map((request) => <div key={request.id} className="rounded-[var(--radius-xs)] border border-border-subtle bg-surface p-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold capitalize">{request.status}</span><span className="text-muted-foreground">{request.fieldKey.replaceAll("_", " ")}</span></div><p className="mt-1">Current: {request.currentValue || "—"} · Proposed: {request.proposedValue || "—"}</p>{request.status === "pending" ? <form action={action} className="mt-2"><input type="hidden" name="requestId" value={request.id} /><input type="hidden" name="learnerId" value={learnerId} /><button type="submit" disabled={pending} className="font-semibold text-danger underline-offset-2 hover:underline disabled:opacity-60">{pending ? "Cancelling…" : "Cancel pending request"}</button></form> : request.reviewNote ? <p className="mt-1 text-muted-foreground">Review result: {request.reviewNote}</p> : null}</div>)}</div>;
}

export function LearnerChangeRequestForm({ learnerId, parentMode = false, requests = [] }: { learnerId: string; parentMode?: boolean; requests?: ProfileChangeRequestRow[] }) {
  const [state, action, pending] = useActionState(submitLearnerProfileChange, initialState);
  const [open, setOpen] = useState(false);
  const [fieldKey, setFieldKey] = useState<(typeof fields)[number][0]>("surname");
  const [sourceCategory, setSourceCategory] = useState("teacher_observation");

  useEffect(() => {
    if (!state.message) return;
    state.success ? toast.success(state.message) : toast.error(state.message);
  }, [state]);

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] bg-surface-muted px-3 text-xs font-semibold text-foreground transition-colors duration-[var(--motion-fast)] hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)]"><FilePenLine className="size-4" />Request a data correction</button>;
  }

  return (
    <div>
    <form action={action} className="mt-3 space-y-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted p-3">
      <input type="hidden" name="learnerId" value={learnerId} />
      {state.success ? <p className="rounded-[var(--radius-xs)] bg-success-soft px-3 py-2 text-xs font-medium text-[color:var(--success)]">Correction submitted. It will remain pending until an authorized reviewer approves it.</p> : null}
      <Picker label="Field to correct" name="fieldKey" value={fieldKey} onChange={(value) => setFieldKey(value as typeof fieldKey)} placeholder="Surname" options={fields.map(([value, label]) => ({ value, label }))} />
      <div>
        <label htmlFor="profile-value" className="text-xs font-medium">Correct value</label>
        <input id="profile-value" name="proposedValue" required className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-sm outline-none focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" />
      </div>
      {!parentMode ? <Picker label="Source category" name="sourceCategory" value={sourceCategory} onChange={setSourceCategory} placeholder="Teacher observation" options={sourceOptions} /> : <input type="hidden" name="sourceCategory" value="parent_guardian_report" />}
      <div>
        <label htmlFor="profile-reason" className="text-xs font-medium">Source / reason</label>
        <textarea id="profile-reason" name="reason" rows={2} required placeholder={parentMode ? "What detail is incorrect and why?" : "For example: parent report, learner report, or verified document"} className="mt-1.5 w-full resize-none rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-3 text-xs outline-none focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" />
      </div>
      <div>
        <label htmlFor="profile-evidence" className="text-xs font-medium">Evidence / reference (optional)</label>
        <input id="profile-evidence" name="evidenceReference" placeholder="Document or reference number" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-sm outline-none focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)] disabled:cursor-not-allowed disabled:opacity-60">{pending ? <Spinner className="size-3.5 text-white" /> : <Send className="size-3.5" />}{pending ? "Submitting…" : "Submit for review"}</button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)} className="min-h-9 cursor-pointer rounded-[var(--radius-sm)] bg-surface px-3 text-xs font-semibold text-muted-foreground shadow-[var(--shadow-xs)] transition-colors hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60">Close</button>
      </div>
    </form>
    <RequestHistory learnerId={learnerId} requests={requests} />
    </div>
  );
}
