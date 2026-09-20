"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { recordPayment, savePaymentSettings, searchFinanceLearners, type FinanceActionState } from "@/features/finance/server/actions";
import type { FinanceLearner, FinancePayment, SchoolPaymentSettings } from "@/features/finance/server/queries";

const initial: FinanceActionState = {};
const field = "mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground outline-none focus:border-[color:var(--brand)]/45";
function Label({ children }: { children: React.ReactNode }) { return <span className="text-xs font-medium text-muted-foreground">{children}</span>; }

export function PaymentSettingsForm({ schoolId, settings }: { schoolId: string; settings: SchoolPaymentSettings | null }) {
  const [state, action, pending] = useActionState(savePaymentSettings, initial);
  useEffect(() => { if (state.message) state.success ? toast.success(state.message) : toast.error(state.message); }, [state]);
  return <form action={action} className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
    <input type="hidden" name="schoolId" value={schoolId}/><div><h2 className="scolapro-section-title">Banking & payment details</h2><p className="scolapro-section-description">Payer-safe instructions only. Never enter banking passwords, PINs or online-banking credentials.</p></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label><Label>Bank name</Label><input className={field} name="bankName" required defaultValue={settings?.bankName ?? ""}/></label>
      <label><Label>Account name</Label><input className={field} name="accountName" required defaultValue={settings?.accountName ?? ""}/></label>
      <label><Label>Account number</Label><input className={field} name="accountNumber" required defaultValue={settings?.accountNumber ?? ""}/></label>
      <label><Label>Account type</Label><input className={field} name="accountType" defaultValue={settings?.accountType ?? ""}/></label>
      <label><Label>Branch name</Label><input className={field} name="branchName" defaultValue={settings?.branchName ?? ""}/></label>
      <label><Label>Branch code</Label><input className={field} name="branchCode" defaultValue={settings?.branchCode ?? ""}/></label>
      <label className="sm:col-span-2"><Label>Payment reference instructions</Label><textarea className={`${field} min-h-20 py-2`} name="referenceInstructions" defaultValue={settings?.referenceInstructions ?? ""} placeholder="Example: use the learner admission number or invoice number."/></label>
      <label className="sm:col-span-2"><Label>Payment instructions</Label><textarea className={`${field} min-h-20 py-2`} name="paymentInstructions" defaultValue={settings?.paymentInstructions ?? ""}/></label>
      <Checkbox name="active" defaultChecked={settings?.active ?? true} label="Show these instructions to eligible payers" />
    </div><div className="mt-4 flex justify-start sm:justify-end"><Button type="submit" loading={pending} disabled={pending}>Save banking details</Button></div>
  </form>;
}

export function FinanceWorkspace({ schoolId, today, settings, payments }: { schoolId: string; today: string; settings: SchoolPaymentSettings | null; payments: FinancePayment[] }) {
  const [state, action, pending] = useActionState(recordPayment, initial);
  const [learnerId, setLearnerId] = useState("");
  const [learnerQuery, setLearnerQuery] = useState("");
  const [learnerOptions, setLearnerOptions] = useState<FinanceLearner[]>([]);
  const [selectedLearner, setSelectedLearner] = useState<FinanceLearner | null>(null);
  const [learnerSearchPending, setLearnerSearchPending] = useState(false);
  const [learnerSearchError, setLearnerSearchError] = useState("");
  useEffect(() => { if (state.message) state.success ? toast.success(state.message) : toast.error(state.message); }, [state]);
  function handleLearnerSearchChange(next: string) {
    setLearnerQuery(next);
    if (next.trim().length < 2) {
      setLearnerSearchPending(false);
      setLearnerSearchError("");
      if (!learnerId) setLearnerOptions([]);
    } else {
      setLearnerSearchPending(true);
      setLearnerSearchError("");
    }
  }
  useEffect(() => {
    const query = learnerQuery.trim();
    if (query.length < 2) return;
    let active = true;
    const timer = window.setTimeout(() => {
      searchFinanceLearners(schoolId, query)
        .then((results) => {
          if (active) setLearnerOptions(results);
        })
        .catch(() => {
          if (active) {
            setLearnerOptions([]);
            setLearnerSearchError("Learners could not be searched.");
          }
        })
        .finally(() => {
          if (active) setLearnerSearchPending(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [learnerQuery, schoolId]);
  const learnerSelectOptions = useMemo(() => {
    const options = selectedLearner && !learnerOptions.some((learner) => learner.id === selectedLearner.id)
      ? [selectedLearner, ...learnerOptions]
      : learnerOptions;
    return options.map((learner) => ({
      value: learner.id,
      label: learner.name,
      helper: learner.admissionNumber ?? undefined,
      searchText: learner.admissionNumber ?? undefined,
    }));
  }, [learnerOptions, selectedLearner]);
  const learnerEmptyMessage = (query: string) => {
    if (learnerSearchError) return learnerSearchError;
    if (query.trim().length < 2) return "Type at least 2 characters to search.";
    return "No current learners found.";
  };
  return <div className="space-y-5">
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><h2 className="scolapro-section-title">School payment instructions</h2>{settings?.active ? <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Bank</dt><dd className="mt-1 font-medium">{settings.bankName}</dd></div><div><dt className="text-xs text-muted-foreground">Account name</dt><dd className="mt-1 font-medium">{settings.accountName}</dd></div><div><dt className="text-xs text-muted-foreground">Account number</dt><dd className="mt-1 font-medium">{settings.accountNumber}</dd></div><div><dt className="text-xs text-muted-foreground">Branch/code</dt><dd className="mt-1 font-medium">{[settings.branchName,settings.branchCode].filter(Boolean).join(" · ") || "—"}</dd></div><div className="col-span-2"><dt className="text-xs text-muted-foreground">Reference</dt><dd className="mt-1">{settings.referenceInstructions || "Use the learner admission number or invoice/payment reference supplied by the school."}</dd></div>{settings.paymentInstructions ? <div className="col-span-2"><dt className="text-xs text-muted-foreground">Instructions</dt><dd className="mt-1">{settings.paymentInstructions}</dd></div> : null}</dl> : <p className="mt-3 text-sm text-muted-foreground">Banking details have not been published yet.</p>}</section>
      <form action={action} className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><input type="hidden" name="schoolId" value={schoolId}/><h2 className="scolapro-section-title">Record received payment</h2><p className="scolapro-section-description">Records an offline/manual payment in the canonical received state for later verification/allocation.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">
        <SearchableSelect
          label="Learner (optional)"
          name="learnerId"
          value={learnerId}
          onChange={(value) => {
            const learner = learnerOptions.find((option) => option.id === value) ?? selectedLearner;
            setLearnerId(value);
            setSelectedLearner(learner?.id === value ? learner : null);
          }}
          onSearchChange={handleLearnerSearchChange}
          onClear={() => {
            setLearnerId("");
            setSelectedLearner(null);
            setLearnerOptions([]);
            setLearnerQuery("");
          }}
          options={learnerSelectOptions}
          placeholder="School-level / not linked"
          searchPlaceholder="Search name or admission number"
          emptyMessage={learnerEmptyMessage}
          loading={learnerSearchPending}
          clearable
          className="sm:col-span-2"
        />
        <label><Label>Payment reference</Label><input className={field} name="reference" required/></label><label><Label>Bank/deposit reference</Label><input className={field} name="bankReference"/></label>
        <label><Label>Method</Label><select className={field} name="method" defaultValue="bank_transfer"><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="mobile">Mobile</option><option value="card">Card</option><option value="other">Other</option></select></label>
        <label><Label>Amount (NAD)</Label><input className={field} name="amount" type="number" min="0.01" step="0.01" required/></label>
        <label><Label>Date received</Label><input className={field} name="paidOn" type="date" defaultValue={today} required/></label><label><Label>Note</Label><input className={field} name="note"/></label>
      </div><div className="mt-4 flex justify-start sm:justify-end"><Button type="submit" loading={pending} disabled={pending}>Record payment</Button></div></form>
    </div>
    <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><h2 className="scolapro-section-title">Recent payments</h2>{payments.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="py-2">Date</th><th>Reference</th><th>Learner</th><th>Method</th><th>Status</th><th className="text-right">Amount</th></tr></thead><tbody>{payments.map((p)=><tr key={p.id} className="border-t border-border-subtle"><td className="py-3">{p.paidOn}</td><td>{p.reference}</td><td>{p.learnerId ? p.learnerName ?? "Learner" : "School-level"}</td><td>{p.method.replaceAll("_"," ")}</td><td>{p.status}</td><td className="text-right font-medium">N$ {p.amount.toFixed(2)}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm text-muted-foreground">No payments have been recorded yet.</p>}</section>
  </div>;
}
