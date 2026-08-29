"use client";

import { useActionState, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { addContributionItem, createContributionCampaign, publishContributionCampaign, type ContributionActionState } from "@/features/contributions/server/actions";
import type { ContributionCampaign } from "@/features/contributions/server/queries";

const initialState: ContributionActionState = {};
const inputClass = "mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none shadow-[var(--shadow-xs)] focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

export function ContributionSetup({ schoolId, academicYear, today, campaigns }: { schoolId: string; academicYear: number; today: string; campaigns: ContributionCampaign[] }) {
  const [open, setOpen] = useState(campaigns.length === 0);
  const [campaignState, campaignAction, campaignPending] = useActionState(createContributionCampaign, initialState);
  const [itemState, itemAction, itemPending] = useActionState(addContributionItem, initialState);
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState("");
  const [campaignId, setCampaignId] = useState(campaigns.find((campaign) => campaign.status === "draft")?.id ?? campaigns[0]?.id ?? "");
  const [itemType, setItemType] = useState("goods");

  useEffect(() => { if (campaignState.message) campaignState.success ? toast.success(campaignState.message) : toast.error(campaignState.message); }, [campaignState]);
  useEffect(() => { if (itemState.message) itemState.success ? toast.success(itemState.message) : toast.error(itemState.message); }, [itemState]);

  return (
    <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-4 text-left sm:px-5">
        <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-brand-soft text-brand-strong">{open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</span>
        <span className="min-w-0 flex-1"><span className="scolapro-section-title block">Campaign & contribution item setup</span><span className="scolapro-section-description block">School Admin/leadership creates the campaign, adds the requested items, then publishes it before contributions can be recorded.</span></span>
        <span className="hidden rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.68rem] font-medium text-muted-foreground sm:inline">{campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}</span>
      </button>

      {open ? <div className="grid gap-4 border-t border-border-subtle p-4 sm:p-5 xl:grid-cols-2">
        <form action={campaignAction} className="rounded-[var(--radius-sm)] bg-surface-muted/60 p-4">
          <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="academicYear" value={academicYear} /><input type="hidden" name="startsOn" value={startsOn} /><input type="hidden" name="endsOn" value={endsOn} />
          <div className="mb-3"><h3 className="text-sm font-semibold">1. Create campaign</h3><p className="mt-0.5 text-[0.68rem] text-muted-foreground">Examples: School Development Fund, Toilet Paper Drive, Grade 12 Fundraiser.</p></div>
          <div><label htmlFor="campaign-title" className="text-xs font-medium">Campaign title</label><input id="campaign-title" name="title" required className={inputClass} placeholder="e.g. Term 2 School Development Drive" /></div>
          <div className="mt-3"><label htmlFor="campaign-description" className="text-xs font-medium">Description</label><textarea id="campaign-description" name="description" rows={2} className={`${inputClass} py-2`} placeholder="What the contribution supports (optional)" /></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2"><DateField label="Starts" name="campaign-start-ui" value={startsOn} onChange={setStartsOn} required /><DateField label="Ends (optional)" name="campaign-end-ui" value={endsOn} onChange={setEndsOn} min={startsOn} /></div>
          <button type="submit" disabled={campaignPending} className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white disabled:opacity-55">{campaignPending ? <Spinner className="size-3.5 text-white" /> : <Plus className="size-3.5" />}Create draft campaign</button>
        </form>

        <form action={itemAction} className="rounded-[var(--radius-sm)] bg-surface-muted/60 p-4">
          <input type="hidden" name="campaignId" value={campaignId} /><input type="hidden" name="itemType" value={itemType} />
          <div className="mb-3"><h3 className="text-sm font-semibold">2. Add contribution item</h3><p className="mt-0.5 text-[0.68rem] text-muted-foreground">Define what parents/learners may contribute. Nothing here creates a compulsory debt.</p></div>
          <div className="grid gap-3 sm:grid-cols-2"><Picker label="Campaign" name="campaign-ui" value={campaignId} onChange={setCampaignId} placeholder="Choose campaign" options={campaigns.map((campaign) => ({ value: campaign.id, label: campaign.title, helper: `${campaign.itemCount} items · ${campaign.status}` }))} /><Picker label="Item type" name="item-type-ui" value={itemType} onChange={setItemType} placeholder="Choose type" options={[{value:"goods",label:"Goods"},{value:"money",label:"Money"},{value:"raffle",label:"Raffle"},{value:"service",label:"Service"},{value:"other",label:"Other"}]} /></div>
          <div className="mt-3"><label htmlFor="item-label" className="text-xs font-medium">Item name</label><input id="item-label" name="label" required className={inputClass} placeholder={itemType === "money" ? "e.g. Development fund contribution" : "e.g. Ream of A4 paper"} /></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2"><div><label htmlFor="unit-label" className="text-xs font-medium">Unit label</label><input id="unit-label" name="unitLabel" className={inputClass} placeholder="reams, rolls, tickets…" /></div>{itemType === "money" || itemType === "raffle" ? <div><label htmlFor="suggested-amount" className="text-xs font-medium">Suggested amount (NAD)</label><input id="suggested-amount" name="suggestedAmount" type="number" min="0" step="0.01" className={inputClass} /></div> : <div><label htmlFor="suggested-quantity" className="text-xs font-medium">Suggested quantity</label><input id="suggested-quantity" name="suggestedQuantity" type="number" min="0" step="0.01" className={inputClass} /></div>}</div>
          <div className="mt-3"><label htmlFor="item-description" className="text-xs font-medium">Item note</label><input id="item-description" name="description" className={inputClass} placeholder="Optional explanation" /></div>
          <button type="submit" disabled={itemPending || !campaignId} className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white disabled:opacity-55">{itemPending ? <Spinner className="size-3.5 text-white" /> : <Plus className="size-3.5" />}Add item</button>
        </form>

        {campaigns.length ? <div className="xl:col-span-2"><h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Campaigns</h3><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{campaigns.map((campaign) => <div key={campaign.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-3"><div className="min-w-0"><p className="truncate text-xs font-semibold">{campaign.title}</p><p className="mt-0.5 text-[0.65rem] text-muted-foreground">{campaign.itemCount} item{campaign.itemCount === 1 ? "" : "s"} · <span className="capitalize">{campaign.status}</span></p></div>{campaign.status === "draft" ? <form action={publishContributionCampaign}><input type="hidden" name="campaignId" value={campaign.id} /><button type="submit" disabled={campaign.itemCount === 0} className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-brand-soft px-2.5 text-[0.68rem] font-semibold text-brand-strong disabled:opacity-40"><Send className="size-3.5" />Publish</button></form> : <span className="rounded-[var(--radius-xs)] bg-success-soft px-2 py-1 text-[0.65rem] font-medium capitalize text-[color:var(--success)]">{campaign.status}</span>}</div>)}</div></div> : null}
      </div> : null}
    </section>
  );
}
