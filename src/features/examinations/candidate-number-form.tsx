"use client";

import { useActionState, useEffect, useState } from "react";
import { BadgeCheck, Save } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { assignCandidateNumber, type CandidateNumberActionState } from "@/features/examinations/server/actions";
import type { ExaminationCandidate } from "@/features/examinations/server/candidates";

const initialState: CandidateNumberActionState = {};

export function CandidateNumberForm({ candidate }: { candidate: ExaminationCandidate }) {
  const [state, action, pending] = useActionState(assignCandidateNumber, initialState);
  const [source, setSource] = useState(candidate.candidateNumber ? "official_correction" : "dnea_official");

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return <form action={action} className="grid gap-3 lg:grid-cols-[minmax(9rem,0.7fr)_minmax(9rem,0.7fr)_minmax(11rem,0.8fr)_minmax(12rem,1fr)_auto] lg:items-end">
    <input type="hidden" name="candidateId" value={candidate.id} />
    <label className="block text-xs font-medium">Candidate Number<input name="candidateNumber" required defaultValue={candidate.candidateNumber ?? ""} placeholder="Official number" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm uppercase outline-none transition duration-[var(--motion-fast)] placeholder:normal-case placeholder:text-muted-foreground focus-visible:border-[color:var(--brand)]/45 focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)]" /></label>
    <label className="block text-xs font-medium">Centre Number<input name="centreNumber" defaultValue={candidate.centreNumber ?? ""} placeholder="Optional" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm uppercase outline-none transition duration-[var(--motion-fast)] placeholder:normal-case placeholder:text-muted-foreground focus-visible:border-[color:var(--brand)]/45 focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)]" /></label>
    <Picker label="Authority source" name="source" value={source} onChange={setSource} placeholder="Choose source" options={[{ value: "dnea_official", label: "DNEA official" }, { value: "official_import", label: "Official import" }, { value: "official_correction", label: "Official correction" }]} />
    <label className="block text-xs font-medium">Assignment note<input name="note" defaultValue={candidate.note ?? ""} placeholder="Optional correction context" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition duration-[var(--motion-fast)] placeholder:text-muted-foreground focus-visible:border-[color:var(--brand)]/45 focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)]" /></label>
    <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-medium text-white disabled:opacity-55">{pending ? <Spinner className="size-4 text-white" /> : candidate.candidateNumber ? <Save className="size-4" aria-hidden="true" /> : <BadgeCheck className="size-4" aria-hidden="true" />}{pending ? "Saving…" : candidate.candidateNumber ? "Save correction" : "Assign number"}</button>
  </form>;
}
