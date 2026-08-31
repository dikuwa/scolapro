"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Coins, Plus, Receipt, Search, X } from "lucide-react";
import { toast } from "sonner";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { ContributionLearnerLookup } from "@/features/contributions/contribution-learner-lookup";
import { recordContribution, type ContributionActionState } from "@/features/contributions/server/actions";
import type { ContributionCampaign, ContributionItem, LearnerContribution } from "@/features/contributions/server/queries";

const initialState: ContributionActionState = {};

function itemTypeLabel(type: string): string {
  const map: Record<string, string> = { goods: "Goods", money: "Money", raffle: "Raffle", service: "Service", other: "Other" };
  return map[type] ?? type;
}

function statusStyle(status: string) {
  if (status === "verified") return "bg-success-soft text-[color:var(--success)]";
  if (status === "reversed") return "bg-danger-soft text-[color:var(--danger)]";
  return "bg-surface-muted text-muted-foreground";
}

export function ContributionWorkspace({ campaigns, items, contributions, academicYear, today, operationId }: {
  campaigns: ContributionCampaign[];
  items: ContributionItem[];
  contributions: LearnerContribution[];
  academicYear: number;
  today: string;
  operationId: string;
}) {
  const [state, action, pending] = useActionState(recordContribution, initialState);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [itemId, setItemId] = useState("");
  const [learnerId, setLearnerId] = useState("");
  const [contributionDate, setContributionDate] = useState(today);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");

  useEffect(() => {
    if (!state.message) return;
    state.success ? toast.success(state.message) : toast.error(state.message);
  }, [state]);

  const campaignItems = useMemo(() => items.filter((i) => i.campaignId === campaignId), [campaignId, items]);
  const selectedItem = campaignItems.find((i) => i.id === itemId);

  const filteredContributions = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return contributions.filter((c) => {
      const matchSearch = !needle || `${c.learnerName} ${c.campaignTitle} ${c.itemLabel} ${c.note ?? ""}`.toLowerCase().includes(needle);
      const matchType = filterType === "all" || c.itemType === filterType;
      return matchSearch && matchType;
    });
  }, [contributions, searchQuery, filterType]);

  const totalMoney = filteredContributions
    .filter((c) => c.amount && c.status !== "reversed")
    .reduce((sum, c) => sum + (c.amount ?? 0), 0);

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="scolapro-tone-mint grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]">
            <Plus className="size-4" />
          </span>
          <div>
            <h2 className="scolapro-section-title">Record contribution</h2>
            <p className="scolapro-section-description">Record a voluntary contribution received from a parent/learner for a published campaign.</p>
          </div>
        </div>

        <form action={action} className="grid gap-3 lg:grid-cols-2">
          <input type="hidden" name="clientOperationId" value={operationId} />
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="learnerId" value={learnerId} />
          <input type="hidden" name="contributionDate" value={contributionDate} />

          <Picker label="Campaign" name="campaignId-ui" value={campaignId} onChange={(v) => { setCampaignId(v); setItemId(""); }} placeholder="Choose campaign"
            options={campaigns.filter((c) => c.status === "published").map((c) => ({ value: c.id, label: c.title, helper: `${c.itemCount} items · ${c.status}` }))} />

          <Picker label="Item" name="itemId-ui" value={itemId} onChange={setItemId} placeholder="Choose contribution item"
            options={campaignItems.map((i) => ({ value: i.id, label: i.label, helper: `${itemTypeLabel(i.itemType)}${i.suggestedAmount ? ` · N$${i.suggestedAmount}` : ""}${i.suggestedQuantity ? ` · ${i.suggestedQuantity} ${i.unitLabel ?? "units"}` : ""}` }))} />

          <ContributionLearnerLookup academicYear={academicYear} value={learnerId} onChange={setLearnerId} />

          <DateField label="Date received" name="contributionDate-ui" value={contributionDate} onChange={setContributionDate} max={today} />

          {selectedItem?.itemType === "money" || selectedItem?.itemType === "raffle" ? (
            <div>
              <label className="text-xs font-medium" htmlFor="contrib-amount">Amount ({selectedItem?.currency ?? "NAD"})</label>
              <input id="contrib-amount" name="amount" type="number" min="0" step="0.01"
                placeholder="0.00" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none shadow-[var(--shadow-xs)] placeholder:text-muted-foreground/65 focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" />
            </div>
          ) : selectedItem?.itemType === "goods" ? (
            <div>
              <label className="text-xs font-medium" htmlFor="contrib-quantity">Quantity {selectedItem?.unitLabel ? `(${selectedItem.unitLabel})` : ""}</label>
              <input id="contrib-quantity" name="quantity" type="number" min="0" step="0.01"
                placeholder="0" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none shadow-[var(--shadow-xs)] placeholder:text-muted-foreground/65 focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" />
            </div>
          ) : null}

          <div className="lg:col-span-2">
            <label className="text-xs font-medium" htmlFor="contrib-note">Note</label>
            <textarea id="contrib-note" name="note" rows={2}
              placeholder="Optional context" className="mt-1.5 w-full resize-none rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3 text-xs outline-none shadow-[var(--shadow-xs)] placeholder:text-muted-foreground/65 focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" />
          </div>

          <div className="lg:col-span-2 flex justify-end">
            <button type="submit" disabled={pending || !campaignId || !itemId || !learnerId}
              className="scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white disabled:opacity-60">
              {pending ? <Spinner className="size-4 text-white" /> : <Receipt className="size-4" />}
              {pending ? "Recording…" : "Record contribution"}
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
        <div className="border-b border-border-subtle px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="scolapro-section-title">Recent contributions</h2>
              <p className="scolapro-section-description">Recorded contributions across all campaigns for this academic year.</p>
            </div>
            {totalMoney > 0 ? (
              <span className="rounded-[var(--radius-xs)] bg-success-soft px-2.5 py-1.5 text-xs font-semibold text-[color:var(--success)]">
                N${totalMoney.toFixed(2)} total
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="scolapro-control-surface flex min-h-10 w-full max-w-md items-center gap-2 rounded-[var(--radius-sm)] px-3">
              <Search className="size-4 text-muted-foreground" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by learner, campaign, item…"
                className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70" />
              {searchQuery ? <button type="button" onClick={() => setSearchQuery("")} className="grid size-7 place-items-center text-muted-foreground"><X className="size-3.5" /></button> : null}
            </label>
            <Picker ariaLabel="Filter by type" name="type-filter" value={filterType} onChange={setFilterType} placeholder="All types"
              options={[{ value: "all", label: "All types" }, { value: "goods", label: "Goods" }, { value: "money", label: "Money" }, { value: "raffle", label: "Raffle" }]} className="max-w-[10rem]" />
          </div>
        </div>

        {filteredContributions.length ? (
          <div className="divide-y divide-border-subtle">
            {filteredContributions.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="scolapro-record-title">{c.learnerName}</p>
                  <p className="mt-0.5 text-[0.68rem] text-muted-foreground">{c.campaignTitle} · {c.itemLabel}</p>
                  {c.note ? <p className="mt-1 text-[0.68rem] text-muted-foreground italic">{c.note}</p> : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {c.amount ? `${c.currency} ${c.amount.toFixed(2)}` : c.quantity ? `${c.quantity}×` : "—"}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[0.65rem] text-muted-foreground">{new Date(c.contributionDate).toLocaleDateString()}</span>
                    <span className={`rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[0.6rem] font-medium capitalize ${statusStyle(c.status)}`}>{c.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-10 text-center">
            <span className="mx-auto grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground">
              <Coins className="size-5" />
            </span>
            <h3 className="mt-3 text-sm font-semibold">No contributions recorded</h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">Record the first contribution using the form above.</p>
          </div>
        )}
      </section>
    </div>
  );
}