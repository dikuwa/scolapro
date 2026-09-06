"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { Banknote, Box, CheckCircle2, ClipboardPlus, PackagePlus, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { addCampaignItem, createCampaign, publishCampaign, recordContribution, type ContributionActionState } from "@/features/contributions/server/actions";
import type { ContributionCampaign, ContributionItem, ContributionLearner, ContributionRecord, ContributionStaff } from "@/features/contributions/server/queries";

const initialState: ContributionActionState = {};
const fieldClass = "mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

type Props = { schoolId: string; canConfigure: boolean; campaigns: ContributionCampaign[]; items: ContributionItem[]; learners: ContributionLearner[]; staff: ContributionStaff[]; records: ContributionRecord[]; today: string; academicYear: number };

function money(value: number | null) { return value === null ? "—" : `N$ ${Number(value).toFixed(2)}`; }
function labelStatus(value: string) { return value.replaceAll("_", " "); }

function useResultToast(state: ContributionActionState) {
  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
}

export function ContributionWorkspace({ schoolId, canConfigure, campaigns, items, learners, staff, records, today, academicYear }: Props) {
  const [campaignState, campaignAction, campaignPending] = useActionState(createCampaign, initialState);
  const [itemState, itemAction, itemPending] = useActionState(addCampaignItem, initialState);
  const [recordState, recordAction, recordPending] = useActionState(recordContribution, initialState);
  const [publishPending, startPublish] = useTransition();
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState("");
  const [campaignId, setCampaignId] = useState(campaigns.find((item) => item.status === "draft")?.id ?? "");
  const [itemType, setItemType] = useState("goods");
  const [learnerId, setLearnerId] = useState("");
  const [recordItemId, setRecordItemId] = useState(items.find((item) => item.active && campaigns.find((campaign) => campaign.id === item.campaignId)?.status === "published")?.id ?? "");
  const [receivedByStaffId, setReceivedByStaffId] = useState("");
  const [contributionDate, setContributionDate] = useState(today);
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  useResultToast(campaignState); useResultToast(itemState); useResultToast(recordState);

  const campaignMap = useMemo(() => new Map(campaigns.map((item) => [item.id, item])), [campaigns]);
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const learnerMap = useMemo(() => new Map(learners.map((item) => [item.id, item])), [learners]);
  const staffMap = useMemo(() => new Map(staff.map((item) => [item.id, item])), [staff]);
  const classes = useMemo(() => Array.from(new Set(learners.map((item) => item.registerClass))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [learners]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return records.filter((record) => {
      const learner = learnerMap.get(record.learnerId); const item = itemMap.get(record.itemId); const campaign = campaignMap.get(record.campaignId); const receiver = record.receivedByStaffId ? staffMap.get(record.receivedByStaffId) : null;
      const haystack = `${learner?.name ?? ""} ${learner?.admissionNumber ?? ""} ${learner?.registerClass ?? ""} ${item?.label ?? ""} ${campaign?.title ?? ""} ${receiver?.name ?? ""}`.toLocaleLowerCase();
      return (!needle || haystack.includes(needle)) && (classFilter === "all" || learner?.registerClass === classFilter) && (typeFilter === "all" || item?.type === typeFilter);
    });
  }, [campaignMap, classFilter, itemMap, learnerMap, query, records, staffMap, typeFilter]);

  const publishedItems = items.filter((item) => item.active && campaignMap.get(item.campaignId)?.status === "published");

  return <div className="space-y-5">
    <section className="grid gap-4 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
      <div className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-start gap-3"><span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><ClipboardPlus aria-hidden="true" className="size-4" /></span><div><h2 className="scolapro-section-title">Record received contribution</h2><p className="scolapro-section-description">Record voluntary goods or money against the learner who brought it.</p></div></div>
        <form action={recordAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <Picker label="Learner" name="learnerId" value={learnerId} onChange={setLearnerId} placeholder="Choose learner" options={learners.map((item) => ({ value: item.id, label: item.name, helper: `${item.registerClass} · ${item.admissionNumber ?? "No number"}` }))} />
          <Picker label="Contribution item" name="itemId" value={recordItemId} onChange={setRecordItemId} placeholder="Choose item" options={publishedItems.map((item) => ({ value: item.id, label: item.label, helper: `${campaignMap.get(item.campaignId)?.title ?? "Campaign"} · ${item.type}` }))} />
          <DateField label="Date received" name="contributionDate" value={contributionDate} onChange={setContributionDate} required max={today} />
          <Picker label="Received by" name="receivedByStaffId" value={receivedByStaffId} onChange={setReceivedByStaffId} placeholder="Not specified" options={[{ value: "", label: "Not specified" }, ...staff.map((item) => ({ value: item.id, label: item.name }))]} />
          <label className="text-xs font-medium">Quantity<input name="quantity" inputMode="decimal" placeholder="e.g. 2" className={fieldClass} /></label>
          <label className="text-xs font-medium">Amount (N$)<input name="amount" inputMode="decimal" placeholder="e.g. 100.00" className={fieldClass} /></label>
          <label className="text-xs font-medium sm:col-span-2">Note<textarea name="note" rows={2} placeholder="Optional receipt, handover or context note" className={`${fieldClass} resize-none py-2.5`} /></label>
          <button type="submit" disabled={recordPending || !learnerId || !recordItemId} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-55 sm:col-span-2"><>{recordPending ? <Spinner className="size-4 text-white" /> : <CheckCircle2 className="size-4" />}{recordPending ? "Recording…" : "Record contribution"}</></button>
        </form>
      </div>

      <div className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div><h2 className="scolapro-section-title">Campaigns & requested items</h2><p className="scolapro-section-description">Published campaigns become available to class teachers and linked guardians.</p></div>
        {campaigns.length ? <div className="mt-4 divide-y divide-border-subtle">{campaigns.map((campaign) => <article key={campaign.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="scolapro-record-title">{campaign.title}</h3><span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.65rem] font-medium capitalize ${campaign.status === "published" ? "bg-success-soft text-[color:var(--success)]" : "bg-surface-muted text-muted-foreground"}`}>{labelStatus(campaign.status)}</span></div><p className="mt-1 text-xs text-muted-foreground">{campaign.academicYear} · {new Date(campaign.startsOn).toLocaleDateString("en-NA")}{campaign.endsOn ? ` – ${new Date(campaign.endsOn).toLocaleDateString("en-NA")}` : ""}</p>{campaign.description ? <p className="mt-1 text-xs leading-5 text-foreground/80">{campaign.description}</p> : null}</div>{canConfigure && campaign.status === "draft" ? <button type="button" disabled={publishPending} onClick={() => startPublish(async () => { const data = new FormData(); data.set("campaignId", campaign.id); const result = await publishCampaign(data); if (result.success) toast.success(result.message); else toast.error(result.message); })} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-brand-soft px-3 text-xs font-semibold text-brand-strong disabled:opacity-55">{publishPending ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />}Publish</button> : null}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">{items.filter((item) => item.campaignId === campaign.id).map((item) => <span key={item.id} className="inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 text-xs"><>{item.type === "money" || item.type === "raffle" ? <Banknote className="size-3.5 text-[color:var(--success)]" /> : <Box className="size-3.5 text-brand" />}{item.label}{item.suggestedAmount !== null ? ` · ${money(item.suggestedAmount)}` : ""}{item.suggestedQuantity !== null ? ` · ${item.suggestedQuantity}${item.unitLabel ? ` ${item.unitLabel}` : ""}` : ""}</></span>)}</div>
        </article>)}</div> : <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center"><PackagePlus className="mx-auto size-5 text-muted-foreground" /><p className="mt-2 text-sm font-medium">No contribution campaigns yet</p><p className="mt-1 text-xs text-muted-foreground">School leadership can create the first voluntary campaign below.</p></div>}
      </div>
    </section>

    {canConfigure ? <section className="grid gap-4 lg:grid-cols-2">
      <form action={campaignAction} className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><input type="hidden" name="schoolId" value={schoolId} /><div><h2 className="scolapro-section-title">New campaign</h2><p className="scolapro-section-description">Create a voluntary request, then add one or more items before publishing.</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium sm:col-span-2">Campaign title<input name="title" placeholder="Term 2 classroom supplies" className={fieldClass} /></label><label className="text-xs font-medium">Academic year<input name="academicYear" inputMode="numeric" defaultValue={academicYear} className={fieldClass} /></label><label className="text-xs font-medium sm:col-span-2">Description<textarea name="description" rows={2} className={`${fieldClass} resize-none py-2.5`} /></label><DateField label="Starts on" name="startsOn" value={startsOn} onChange={setStartsOn} required /><DateField label="Ends on" name="endsOn" value={endsOn} onChange={setEndsOn} min={startsOn} /><button type="submit" disabled={campaignPending} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-white disabled:opacity-55 sm:col-span-2">{campaignPending ? <Spinner className="size-4 text-white" /> : <PackagePlus className="size-4" />}{campaignPending ? "Creating…" : "Create campaign"}</button></div></form>
      <form action={itemAction} className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><div><h2 className="scolapro-section-title">Add requested item</h2><p className="scolapro-section-description">Define a cash, goods, raffle, service or other voluntary item.</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Picker label="Campaign" name="campaignId" value={campaignId} onChange={setCampaignId} placeholder="Choose campaign" options={campaigns.filter((item) => item.status === "draft").map((item) => ({ value: item.id, label: item.title }))} /><Picker label="Item type" name="itemType" value={itemType} onChange={setItemType} placeholder="Choose type" options={[{ value: "goods", label: "Goods" }, { value: "money", label: "Money" }, { value: "raffle", label: "Raffle" }, { value: "service", label: "Service" }, { value: "other", label: "Other" }]} /><label className="text-xs font-medium sm:col-span-2">Item name<input name="label" placeholder="Ream of paper" className={fieldClass} /></label><label className="text-xs font-medium">Suggested quantity<input name="suggestedQuantity" inputMode="decimal" className={fieldClass} /></label><label className="text-xs font-medium">Unit label<input name="unitLabel" placeholder="reams, boxes…" className={fieldClass} /></label><label className="text-xs font-medium">Suggested amount (N$)<input name="suggestedAmount" inputMode="decimal" className={fieldClass} /></label><label className="text-xs font-medium sm:col-span-2">Description<textarea name="description" rows={2} className={`${fieldClass} resize-none py-2.5`} /></label><button type="submit" disabled={itemPending || !campaignId} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-white disabled:opacity-55 sm:col-span-2">{itemPending ? <Spinner className="size-4 text-white" /> : <PackagePlus className="size-4" />}{itemPending ? "Adding…" : "Add item"}</button></div></form>
    </section> : null}

    <section className="overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
      <div className="border-b border-border-subtle px-4 py-4 sm:px-5"><h2 className="scolapro-section-title">Contribution register</h2><p className="scolapro-section-description">Filter current records by learner, item, class, campaign or receiving teacher.</p><div className="mt-3 grid gap-2 lg:grid-cols-[minmax(15rem,1fr)_12rem_12rem]">
        <label className="scolapro-control-surface flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] px-3"><Search className="size-4 text-muted-foreground" /><span className="sr-only">Search contributions</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search learner, item or receiver…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X className="size-3.5 text-muted-foreground" /></button> : null}</label>
        <Picker ariaLabel="Filter by class" name="class-filter" value={classFilter} onChange={setClassFilter} placeholder="All classes" options={[{ value: "all", label: "All classes" }, ...classes.map((item) => ({ value: item, label: item }))]} />
        <Picker ariaLabel="Filter by contribution type" name="type-filter" value={typeFilter} onChange={setTypeFilter} placeholder="All types" options={[{ value: "all", label: "All types" }, { value: "goods", label: "Goods" }, { value: "money", label: "Money" }, { value: "raffle", label: "Raffle" }, { value: "service", label: "Service" }, { value: "other", label: "Other" }]} />
      </div></div>
      {filtered.length ? <div><div className="hidden grid-cols-[minmax(12rem,1.2fr)_minmax(10rem,1fr)_8rem_7rem_10rem] gap-3 bg-surface-muted/60 px-5 py-2.5 text-[0.68rem] font-medium uppercase tracking-[0.05em] text-muted-foreground md:grid"><span>Learner</span><span>Contribution</span><span>Date</span><span>Value</span><span>Received by</span></div><div className="divide-y divide-border-subtle">{filtered.map((record) => { const learner=learnerMap.get(record.learnerId); const item=itemMap.get(record.itemId); const receiver=record.receivedByStaffId?staffMap.get(record.receivedByStaffId):null; return <article key={record.id} className="grid gap-2 px-4 py-3.5 sm:px-5 md:grid-cols-[minmax(12rem,1.2fr)_minmax(10rem,1fr)_8rem_7rem_10rem] md:items-center md:gap-3"><div><p className="scolapro-record-title">{learner?.name ?? "Learner"}</p><p className="mt-0.5 text-[0.68rem] text-muted-foreground">{learner?.registerClass ?? "Class"} · {learner?.admissionNumber ?? "No number"}</p></div><div><p className="text-xs font-medium">{item?.label ?? "Contribution"}</p><p className="mt-0.5 text-[0.68rem] capitalize text-muted-foreground">{item?.type ?? "other"} · {campaignMap.get(record.campaignId)?.title ?? "Campaign"}</p></div><time className="text-xs text-muted-foreground">{new Date(record.date).toLocaleDateString("en-NA")}</time><p className="text-xs font-semibold">{record.amount !== null ? money(record.amount) : record.quantity !== null ? `${record.quantity}${item?.unitLabel ? ` ${item.unitLabel}` : ""}` : "Note"}</p><div><p className="text-xs">{receiver?.name ?? "Not specified"}</p><p className="mt-0.5 text-[0.68rem] capitalize text-muted-foreground">{labelStatus(record.status)}</p></div>{record.note ? <p className="text-xs leading-5 text-muted-foreground md:col-span-5">{record.note}</p> : null}</article>; })}</div></div> : <div className="px-5 py-10 text-center"><Box className="mx-auto size-5 text-muted-foreground" /><p className="mt-2 text-sm font-medium">No contribution records match</p><p className="mt-1 text-xs text-muted-foreground">Record the first contribution or clear the filters.</p></div>}
    </section>
  </div>;
}
