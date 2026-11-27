"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { decideAdmissionApplication } from "@/features/admissions/server/actions";

const decisions = [
  { value: "accepted", label: "Accepted" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "declined", label: "Declined" },
];

export function AdmissionDecisionEditor({
  applicationId,
  currentStatus,
  currentNote,
  currentReviewedAt,
}: {
  applicationId: string;
  currentStatus: string;
  currentNote: string | null;
  currentReviewedAt: string | null;
}) {
  const [editing, setEditing] = useState(false);
  // The authoritative server state captured the moment editing begins. It is
  // never refreshed from props while editing, so a background revalidation
  // cannot silently re-point this editor at another reviewer's newer decision:
  // the server compares these values and rejects the stale write instead.
  const [baseline, setBaseline] = useState(() => captureBaseline(currentStatus, currentNote, currentReviewedAt));
  const [status, setStatus] = useState(() => normalizeStatus(currentStatus));
  const [note, setNote] = useState(currentNote ?? "");

  function reset() {
    setEditing(false);
  }

  function beginEditing() {
    const nextBaseline = captureBaseline(currentStatus, currentNote, currentReviewedAt);
    setBaseline(nextBaseline);
    setStatus(normalizeStatus(nextBaseline.status));
    setNote(nextBaseline.note);
    setEditing(true);
  }

  if (!editing) {
    return <div className="min-w-0"><button type="button" onClick={beginEditing}
      className="min-h-9 rounded-[var(--radius-sm)] bg-brand-soft px-3 text-xs font-semibold text-brand-strong">
      {decisions.some((item) => item.value === currentStatus) ? "Edit decision" : "Review decision"}
    </button></div>;
  }

  return (
    <div className="min-w-0 lg:col-span-4">
      <form action={decideAdmissionApplication} className="w-full max-w-xl min-w-0 space-y-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted p-3">
        <input type="hidden" name="applicationId" value={applicationId} />
        <input type="hidden" name="expectedStatus" value={baseline.status} />
        <input type="hidden" name="expectedDecisionNote" value={baseline.note} />
        <input type="hidden" name="expectedReviewedAt" value={baseline.reviewedAt} />
        <DecisionFormFields status={status} setStatus={setStatus}
          note={note} setNote={setNote} onCancel={reset} />
      </form>
    </div>
  );
}

function captureBaseline(
  currentStatus: string,
  currentNote: string | null,
  currentReviewedAt: string | null,
) {
  return {
    // The raw authoritative status, including non-decision states such as
    // `received`, is the concurrency token. The editable draft is separately
    // normalised because only real decisions are selectable.
    status: currentStatus,
    note: currentNote ?? "",
    reviewedAt: currentReviewedAt ?? "",
  };
}

function normalizeStatus(value: string) {
  return decisions.some((item) => item.value === value) ? value : "";
}

function DecisionFormFields({
  status, setStatus, note, setNote, onCancel,
}: {
  status: string;
  setStatus: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  onCancel: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <>
      <SearchableSelect
        label="Admission decision"
        name="status"
        value={status}
        onChange={setStatus}
        disabled={pending}
        options={decisions}
        placeholder="Choose decision"
        searchPlaceholder="Find decision"
      />
      <label className="block space-y-1">
        <span className="block text-xs font-medium">Reviewer note (optional)</span>
        <textarea name="decisionNote" value={note} onChange={(event) => setNote(event.target.value)}
          disabled={pending} maxLength={1000} rows={3}
          className="scolapro-control-surface min-h-20 w-full rounded-[var(--radius-sm)] px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:opacity-50"
          placeholder="Reason or follow-up for this decision" />
        <span className="block text-[0.68rem] text-muted-foreground">Existing notes are retained unless edited. Clear the text to remove the note.</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending || !status}
          className="min-h-9 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "Saving…" : "Save decision"}
        </button>
        <button type="button" onClick={onCancel} disabled={pending}
          className="min-h-9 rounded-[var(--radius-sm)] bg-surface px-3 text-xs font-semibold text-foreground shadow-[var(--shadow-xs)] disabled:cursor-not-allowed disabled:opacity-50">
          Cancel
        </button>
      </div>
      {pending ? <p role="status" className="text-xs text-muted-foreground">Saving admission decision…</p> : null}
    </>
  );
}
