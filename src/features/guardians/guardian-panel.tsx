"use client";

import { useActionState, useEffect, useState } from "react";
import { Mail, Phone, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { addGuardianRelationship, endGuardianRelationship, linkExistingGuardian, type GuardianActionState } from "@/features/guardians/server/actions";
import type { LearnerGuardian, ReusableGuardian } from "@/features/guardians/server/queries";

const initialState: GuardianActionState = {};

export function GuardianPanel({ learnerId, guardians, reusableGuardians = [] }: { learnerId: string; guardians: LearnerGuardian[]; reusableGuardians?: ReusableGuardian[] }) {
  const [newState, newAction, newPending] = useActionState(addGuardianRelationship, initialState);
  const [existingState, existingAction, existingPending] = useActionState(linkExistingGuardian, initialState);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">(reusableGuardians.length ? "existing" : "new");
  const [guardianId, setGuardianId] = useState("");

  useEffect(() => {
    const state = newState.message ? newState : existingState;
    if (!state.message) return;
    if (state.success) { toast.success(state.message); setOpen(false); }
    else toast.error(state.message);
  }, [newState, existingState]);

  return (
    <section className="bg-surface shadow-[var(--shadow-xs)]">
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-4 sm:px-5">
        <div><h2 className="scolapro-section-title">Parents & guardians</h2><p className="scolapro-section-description">Link guardians once, then reuse the same person across siblings and communication workflows.</p></div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand-soft px-3 text-xs font-semibold text-brand-strong"><Plus className="size-3.5" />Add guardian</button>
      </div>

      {guardians.length ? <div className="divide-y divide-border-subtle">{guardians.map((guardian) => (
        <div key={guardian.relationshipId} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
          <div className="min-w-0"><div className="flex items-center gap-2"><UserRound className="size-4 text-brand" /><p className="scolapro-record-title">{guardian.name}</p><span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.65rem] capitalize text-muted-foreground">{guardian.relationshipType}</span></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] text-muted-foreground">{guardian.contacts.map((contact) => <span key={contact.id} className="inline-flex items-center gap-1">{contact.type === "email" ? <Mail className="size-3" /> : <Phone className="size-3" />}{contact.value}</span>)}</div><div className="mt-2 flex flex-wrap gap-1.5 text-[0.65rem]">{guardian.legalGuardian ? <span className="rounded-[var(--radius-xs)] bg-success-soft px-2 py-1 font-medium text-[color:var(--success)]">Legal guardian</span> : null}{guardian.emergencyContact ? <span className="rounded-[var(--radius-xs)] bg-warning-soft px-2 py-1 font-medium text-[color:var(--warning)]">Emergency contact</span> : null}{guardian.pickupAuthorized ? <span className="rounded-[var(--radius-xs)] bg-info-soft px-2 py-1 font-medium text-[color:var(--info)]">Pickup authorized</span> : null}</div></div>
          <form action={endGuardianRelationship}><input type="hidden" name="relationshipId" value={guardian.relationshipId} /><input type="hidden" name="learnerId" value={learnerId} /><button type="submit" aria-label={`End relationship with ${guardian.name}`} className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-danger-soft hover:text-[color:var(--danger)]"><Trash2 className="size-3.5" /></button></form>
        </div>
      ))}</div> : <div className="px-4 py-8 text-center text-xs text-muted-foreground sm:px-5">No guardian relationships linked yet.</div>}

      {open ? <div className="border-t border-border-subtle bg-surface-muted/45 p-4 sm:p-5">
        <div className="mb-4 inline-flex rounded-[var(--radius-sm)] bg-surface p-1 shadow-[var(--shadow-xs)]">
          {reusableGuardians.length ? <button type="button" onClick={() => setMode("existing")} className={`rounded-[var(--radius-xs)] px-3 py-1.5 text-xs font-medium ${mode === "existing" ? "bg-brand-soft text-brand-strong" : "text-muted-foreground"}`}>Existing guardian</button> : null}
          <button type="button" onClick={() => setMode("new")} className={`rounded-[var(--radius-xs)] px-3 py-1.5 text-xs font-medium ${mode === "new" ? "bg-brand-soft text-brand-strong" : "text-muted-foreground"}`}>New guardian</button>
        </div>

        {mode === "existing" && reusableGuardians.length ? <form action={existingAction}>
          <input type="hidden" name="learnerId" value={learnerId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Picker label="Guardian" name="guardianId" value={guardianId} onChange={setGuardianId} placeholder="Choose existing guardian" options={reusableGuardians.map((guardian) => ({ value: guardian.id, label: guardian.name, helper: guardian.contacts.map((contact) => contact.value).join(" · ") || undefined }))} />
            <label className="text-xs font-medium">Relationship<input name="relationshipType" placeholder="Mother, father, guardian…" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 outline-none" /></label>
            <label className="text-xs font-medium">Priority<input name="priority" type="number" min="1" max="20" defaultValue="1" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 outline-none" /></label>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[0.7rem]"><label className="inline-flex items-center gap-1.5"><input name="legalGuardian" type="checkbox" />Legal guardian</label><label className="inline-flex items-center gap-1.5"><input name="emergencyContact" type="checkbox" />Emergency contact</label><label className="inline-flex items-center gap-1.5"><input name="pickupAuthorized" type="checkbox" />Pickup authorized</label></div>
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="min-h-9 rounded-[var(--radius-sm)] px-3 text-xs text-muted-foreground">Cancel</button><button type="submit" disabled={existingPending || !guardianId} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white disabled:opacity-60"><ShieldCheck className="size-3.5" />{existingPending ? "Linking…" : "Link existing guardian"}</button></div>
        </form> : <form action={newAction}><input type="hidden" name="learnerId" value={learnerId} /><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">First names<input name="firstNames" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 outline-none" /></label><label className="text-xs font-medium">Surname<input name="surname" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 outline-none" /></label><label className="text-xs font-medium">Relationship<input name="relationshipType" placeholder="Mother, father, guardian…" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 outline-none" /></label><label className="text-xs font-medium">Priority<input name="priority" type="number" min="1" max="20" defaultValue="1" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 outline-none" /></label><label className="text-xs font-medium">Mobile<input name="mobile" inputMode="tel" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 outline-none" /></label><label className="text-xs font-medium">Email<input name="email" type="email" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 outline-none" /></label></div><div className="mt-3 flex flex-wrap gap-3 text-[0.7rem]"><label className="inline-flex items-center gap-1.5"><input name="legalGuardian" type="checkbox" />Legal guardian</label><label className="inline-flex items-center gap-1.5"><input name="emergencyContact" type="checkbox" />Emergency contact</label><label className="inline-flex items-center gap-1.5"><input name="pickupAuthorized" type="checkbox" />Pickup authorized</label></div><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="min-h-9 rounded-[var(--radius-sm)] px-3 text-xs text-muted-foreground">Cancel</button><button type="submit" disabled={newPending} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white disabled:opacity-60"><ShieldCheck className="size-3.5" />{newPending ? "Saving…" : "Create & link guardian"}</button></div></form>}
      </div> : null}
    </section>
  );
}
