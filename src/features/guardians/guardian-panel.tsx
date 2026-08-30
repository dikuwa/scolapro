"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Mail, MapPin, Pencil, Phone, Plus, Search, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Picker } from "@/components/ui/picker";
import { GuardianDetailsFields } from "@/features/guardians/guardian-details-fields";
import { addGuardianRelationship, endGuardianRelationship, linkExistingGuardian, saveGuardianContactDetails, type GuardianActionState } from "@/features/guardians/server/actions";
import type { LearnerGuardian, ReusableGuardian } from "@/features/guardians/server/queries";

const initialState: GuardianActionState = {};
const fieldClass = "mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs outline-none transition focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

export function GuardianPanel({ learnerId, guardians, reusableGuardians = [] }: { learnerId: string; guardians: LearnerGuardian[]; reusableGuardians?: ReusableGuardian[] }) {
  const [newState, newAction, newPending] = useActionState(addGuardianRelationship, initialState);
  const [existingState, existingAction, existingPending] = useActionState(linkExistingGuardian, initialState);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">(reusableGuardians.length ? "existing" : "new");
  const [guardianId, setGuardianId] = useState("");
  const [guardianQuery, setGuardianQuery] = useState("");
  const [editingGuardianId, setEditingGuardianId] = useState<string | null>(null);

  useEffect(() => {
    const state = newState.message ? newState : existingState;
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [newState, existingState]);

  const filteredReusable = useMemo(() => {
    const needle = guardianQuery.trim().toLowerCase();
    if (!needle) return reusableGuardians;
    return reusableGuardians.filter((guardian) => `${guardian.name} ${guardian.contacts.map((contact) => contact.value).join(" ")}`.toLowerCase().includes(needle));
  }, [guardianQuery, reusableGuardians]);

  return (
    <section className="bg-surface shadow-[var(--shadow-xs)]">
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-4 sm:px-5">
        <div><h2 className="scolapro-section-title">Parents & guardians</h2><p className="scolapro-section-description">One guardian identity can be linked to several siblings. Contact and address history is maintained once and reused for communication and reports.</p></div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand-soft px-3 text-xs font-semibold text-brand-strong"><Plus className="size-3.5" />Add guardian</button>
      </div>

      {guardians.length ? <div className="divide-y divide-border-subtle">{guardians.map((guardian) => (
        <GuardianRow
          key={guardian.relationshipId}
          learnerId={learnerId}
          guardian={guardian}
          editing={editingGuardianId === guardian.guardianId}
          onToggleEdit={() => setEditingGuardianId((current) => current === guardian.guardianId ? null : guardian.guardianId)}
          onClose={() => setEditingGuardianId(null)}
        />
      ))}</div> : <div className="px-4 py-8 text-center text-xs text-muted-foreground sm:px-5">No guardian relationships linked yet.</div>}

      {open ? <div className="border-t border-border-subtle bg-surface-muted/45 p-4 sm:p-5">
        <div className="mb-4 inline-flex rounded-[var(--radius-sm)] bg-surface p-1 shadow-[var(--shadow-xs)]">
          {reusableGuardians.length ? <button type="button" onClick={() => setMode("existing")} className={`rounded-[var(--radius-xs)] px-3 py-1.5 text-xs font-medium ${mode === "existing" ? "bg-brand-soft text-brand-strong" : "text-muted-foreground"}`}>Existing guardian</button> : null}
          <button type="button" onClick={() => setMode("new")} className={`rounded-[var(--radius-xs)] px-3 py-1.5 text-xs font-medium ${mode === "new" ? "bg-brand-soft text-brand-strong" : "text-muted-foreground"}`}>New guardian</button>
        </div>

        {mode === "existing" && reusableGuardians.length ? <form action={existingAction}>
          <input type="hidden" name="learnerId" value={learnerId} />
          <label className="scolapro-control-surface mb-3 flex min-h-10 w-full max-w-lg items-center gap-2 rounded-[var(--radius-sm)] px-3"><Search className="size-4 text-muted-foreground" /><input value={guardianQuery} onChange={(event) => { setGuardianQuery(event.target.value); setGuardianId(""); }} placeholder="Search guardian by name, phone or email…" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Picker label="Guardian" name="guardianId" value={guardianId} onChange={setGuardianId} placeholder={filteredReusable.length ? "Choose existing guardian" : "No matching guardians"} options={filteredReusable.map((guardian) => ({ value: guardian.id, label: guardian.name, helper: guardian.contacts.map((contact) => contact.value).join(" · ") || undefined }))} />
            <label className="text-xs font-medium">Relationship<input name="relationshipType" placeholder="Mother, father, guardian…" className={fieldClass} /></label>
            <label className="text-xs font-medium">Priority<input name="priority" type="number" min="1" max="20" defaultValue="1" className={fieldClass} /></label>
          </div>
          <RelationshipFlags />
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="min-h-9 rounded-[var(--radius-sm)] px-3 text-xs text-muted-foreground">Cancel</button><button type="submit" disabled={existingPending || !guardianId} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white disabled:opacity-60"><ShieldCheck className="size-3.5" />{existingPending ? "Linking…" : "Link existing guardian"}</button></div>
        </form> : <form action={newAction}>
          <input type="hidden" name="learnerId" value={learnerId} />
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">First names<input name="firstNames" className={fieldClass} /></label><label className="text-xs font-medium">Surname<input name="surname" className={fieldClass} /></label><label className="text-xs font-medium">Relationship<input name="relationshipType" placeholder="Mother, father, guardian…" className={fieldClass} /></label><label className="text-xs font-medium">Priority<input name="priority" type="number" min="1" max="20" defaultValue="1" className={fieldClass} /></label></div>
          <div className="mt-4"><GuardianDetailsFields /></div>
          <RelationshipFlags />
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="min-h-9 rounded-[var(--radius-sm)] px-3 text-xs text-muted-foreground">Cancel</button><button type="submit" disabled={newPending} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white disabled:opacity-60"><ShieldCheck className="size-3.5" />{newPending ? "Saving…" : "Create & link guardian"}</button></div>
        </form>}
      </div> : null}
    </section>
  );
}

function GuardianRow({ learnerId, guardian, editing, onToggleEdit, onClose }: { learnerId: string; guardian: LearnerGuardian; editing: boolean; onToggleEdit: () => void; onClose: () => void }) {
  const [state, action, pending] = useActionState(saveGuardianContactDetails, initialState);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      onClose();
    } else toast.error(state.message);
  }, [state, onClose]);

  return <div className="px-4 py-4 sm:px-5">
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><UserRound className="size-4 text-brand" /><p className="scolapro-record-title">{guardian.name}</p><span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.65rem] capitalize text-muted-foreground">{guardian.relationshipType}</span></div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] text-muted-foreground">{guardian.contacts.map((contact) => <span key={contact.id} className="inline-flex items-center gap-1">{contact.type === "email" ? <Mail className="size-3" /> : <Phone className="size-3" />}<span className="capitalize">{contact.label || contact.type}</span>: {contact.value}</span>)}</div>
        {guardian.addresses.length ? <div className="mt-2 space-y-1 text-[0.7rem] text-muted-foreground">{guardian.addresses.map((address) => <div key={address.id} className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-3 shrink-0" /><span><span className="font-medium capitalize text-foreground/80">{address.label || address.type}: </span>{[address.line1, address.line2, address.locality, address.town, address.region, address.postalCode, address.country].filter(Boolean).join(", ")}</span></div>)}</div> : null}
        <div className="mt-2 flex flex-wrap gap-1.5 text-[0.65rem]">{guardian.legalGuardian ? <span className="rounded-[var(--radius-xs)] bg-success-soft px-2 py-1 font-medium text-[color:var(--success)]">Legal guardian</span> : null}{guardian.emergencyContact ? <span className="rounded-[var(--radius-xs)] bg-warning-soft px-2 py-1 font-medium text-[color:var(--warning)]">Emergency contact</span> : null}{guardian.pickupAuthorized ? <span className="rounded-[var(--radius-xs)] bg-info-soft px-2 py-1 font-medium text-[color:var(--info)]">Pickup authorized</span> : null}</div>
      </div>
      <div className="flex gap-1"><button type="button" onClick={onToggleEdit} aria-expanded={editing} aria-label={`${editing ? "Close" : "Edit"} contact details for ${guardian.name}`} className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-brand-soft hover:text-brand-strong">{editing ? <X className="size-3.5" /> : <Pencil className="size-3.5" />}</button><form action={endGuardianRelationship}><input type="hidden" name="relationshipId" value={guardian.relationshipId} /><input type="hidden" name="learnerId" value={learnerId} /><button type="submit" aria-label={`End relationship with ${guardian.name}`} className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-danger-soft hover:text-[color:var(--danger)]"><Trash2 className="size-3.5" /></button></form></div>
    </div>
    {editing ? <form action={action} className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted/55 p-3 sm:p-4"><input type="hidden" name="guardianId" value={guardian.guardianId} /><input type="hidden" name="learnerId" value={learnerId} /><GuardianDetailsFields initialContacts={guardian.contacts} initialAddresses={guardian.addresses} /><div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={onClose} disabled={pending} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-muted-foreground transition hover:bg-surface hover:text-foreground disabled:opacity-55"><X className="size-3.5" />Close</button><button type="submit" disabled={pending} className="min-h-9 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white disabled:opacity-60">{pending ? "Saving…" : "Save contact details"}</button></div></form> : null}
  </div>;
}

function RelationshipFlags() {
  return <div className="mt-3 flex flex-wrap gap-2"><CheckboxField name="legalGuardian" label="Legal guardian" /><CheckboxField name="emergencyContact" label="Emergency contact" /><CheckboxField name="pickupAuthorized" label="Pickup authorized" /></div>;
}
