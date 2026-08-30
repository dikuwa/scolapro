"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { CheckboxField } from "@/components/ui/checkbox-field";
import type { GuardianAddress, GuardianContact } from "@/features/guardians/server/queries";

type ContactDraft = { id: string; type: "mobile" | "phone" | "whatsapp" | "email"; label: string; value: string; primary: boolean };
type AddressDraft = { id: string; type: "physical" | "postal" | "work" | "other"; label: string; line1: string; line2: string; locality: string; town: string; region: string; postalCode: string; country: string; primary: boolean };

const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs outline-none transition focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

function makeContact(type: ContactDraft["type"] = "mobile"): ContactDraft { return { id: crypto.randomUUID(), type, label: type === "mobile" ? "Cell" : type === "phone" ? "Work" : type === "whatsapp" ? "WhatsApp" : "Email", value: "", primary: false }; }
function makeAddress(): AddressDraft { return { id: crypto.randomUUID(), type: "physical", label: "Home", line1: "", line2: "", locality: "", town: "", region: "", postalCode: "", country: "Namibia", primary: false }; }

export function GuardianDetailsFields({ initialContacts = [], initialAddresses = [] }: { initialContacts?: GuardianContact[]; initialAddresses?: GuardianAddress[] }) {
  const [contacts, setContacts] = useState<ContactDraft[]>(() => initialContacts.length ? initialContacts.map((item) => ({ id: item.id, type: ["mobile","phone","whatsapp","email"].includes(item.type) ? item.type as ContactDraft["type"] : "phone", label: item.label ?? "", value: item.value, primary: item.primary })) : [makeContact("mobile")]);
  const [addresses, setAddresses] = useState<AddressDraft[]>(() => initialAddresses.length ? initialAddresses.map((item) => ({ id: item.id, type: item.type as AddressDraft["type"], label: item.label ?? "", line1: item.line1, line2: item.line2 ?? "", locality: item.locality ?? "", town: item.town ?? "", region: item.region ?? "", postalCode: item.postalCode ?? "", country: item.country || "Namibia", primary: item.primary })) : [makeAddress()]);

  const contactPayload = contacts.filter((item) => item.value.trim()).map(({ type, label, value, primary }) => ({ type, label, value: value.trim(), primary }));
  const addressPayload = addresses.filter((item) => item.line1.trim()).map(({ type, label, line1, line2, locality, town, region, postalCode, country, primary }) => ({ type, label, line1, line2, locality, town, region, postalCode, country: country || "Namibia", primary }));

  function updateContact(id: string, patch: Partial<ContactDraft>) { setContacts((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item)); }
  function updateAddress(id: string, patch: Partial<AddressDraft>) { setAddresses((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item)); }

  return <div className="space-y-5">
    <input type="hidden" name="contacts" value={JSON.stringify(contactPayload)} />
    <input type="hidden" name="addresses" value={JSON.stringify(addressPayload)} />

    <section>
      <div className="mb-2 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold">Contact numbers & channels</p><p className="text-[0.68rem] text-muted-foreground">Add cell, work phone, WhatsApp or email. Keep only the contacts the school should use.</p></div><button type="button" onClick={() => setContacts((current) => [...current, makeContact()])} className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-xs)] bg-brand-soft px-2.5 text-[0.68rem] font-semibold text-brand-strong"><Plus className="size-3.5" />Add</button></div>
      <div className="space-y-2">{contacts.map((contact, index) => <div key={contact.id} className="grid gap-2 rounded-[var(--radius-sm)] bg-surface p-2.5 sm:grid-cols-[8rem_8rem_minmax(0,1fr)_auto] sm:items-center">
        <select aria-label={`Contact type ${index + 1}`} value={contact.type} onChange={(event) => updateContact(contact.id, { type: event.target.value as ContactDraft["type"] })} className={fieldClass}><option value="mobile">Cell</option><option value="phone">Phone</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select>
        <input aria-label={`Contact label ${index + 1}`} value={contact.label} onChange={(event) => updateContact(contact.id, { label: event.target.value })} placeholder="Label" className={fieldClass} />
        <input aria-label={`Contact value ${index + 1}`} inputMode={contact.type === "email" ? "email" : "tel"} value={contact.value} onChange={(event) => updateContact(contact.id, { value: event.target.value })} placeholder={contact.type === "email" ? "name@example.com" : "+264 …"} className={fieldClass} />
        <div className="flex items-center justify-end gap-1"><CheckboxField label="Primary" checked={contact.primary} onChange={(event) => updateContact(contact.id, { primary: event.target.checked })} />{contacts.length > 1 ? <button type="button" onClick={() => setContacts((current) => current.filter((item) => item.id !== contact.id))} aria-label="Remove contact" className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-danger-soft hover:text-[color:var(--danger)]"><Trash2 className="size-3.5" /></button> : null}</div>
      </div>)}</div>
    </section>

    <section>
      <div className="mb-2 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold">Addresses</p><p className="text-[0.68rem] text-muted-foreground">Structured addresses can be reused for report cards and correspondence.</p></div><button type="button" onClick={() => setAddresses((current) => [...current, makeAddress()])} className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-xs)] bg-brand-soft px-2.5 text-[0.68rem] font-semibold text-brand-strong"><Plus className="size-3.5" />Add address</button></div>
      <div className="space-y-3">{addresses.map((address, index) => <div key={address.id} className="rounded-[var(--radius-sm)] bg-surface p-3">
        <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center"><select aria-label={`Address type ${index + 1}`} value={address.type} onChange={(event) => updateAddress(address.id, { type: event.target.value as AddressDraft["type"] })} className={fieldClass}><option value="physical">Physical</option><option value="postal">Postal</option><option value="work">Work</option><option value="other">Other</option></select><input aria-label={`Address label ${index + 1}`} value={address.label} onChange={(event) => updateAddress(address.id, { label: event.target.value })} placeholder="Home, postal…" className={fieldClass} /><div className="flex items-center justify-end gap-1"><CheckboxField label="Primary" checked={address.primary} onChange={(event) => updateAddress(address.id, { primary: event.target.checked })} />{addresses.length > 1 ? <button type="button" onClick={() => setAddresses((current) => current.filter((item) => item.id !== address.id))} aria-label="Remove address" className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-danger-soft hover:text-[color:var(--danger)]"><Trash2 className="size-3.5" /></button> : null}</div></div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2"><input value={address.line1} onChange={(event) => updateAddress(address.id, { line1: event.target.value })} placeholder="Address line 1" className={fieldClass} /><input value={address.line2} onChange={(event) => updateAddress(address.id, { line2: event.target.value })} placeholder="Address line 2 (optional)" className={fieldClass} /><input value={address.locality} onChange={(event) => updateAddress(address.id, { locality: event.target.value })} placeholder="Suburb / locality" className={fieldClass} /><input value={address.town} onChange={(event) => updateAddress(address.id, { town: event.target.value })} placeholder="Town / city" className={fieldClass} /><input value={address.region} onChange={(event) => updateAddress(address.id, { region: event.target.value })} placeholder="Region" className={fieldClass} /><input value={address.postalCode} onChange={(event) => updateAddress(address.id, { postalCode: event.target.value })} placeholder="Postal code" className={fieldClass} /></div>
      </div>)}</div>
    </section>
  </div>;
}
