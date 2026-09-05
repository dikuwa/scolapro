"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowRightLeft, Check, LoaderCircle, Plus, Search, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  prepareCrcCustody,
  transitionCrcCustody,
  type CrcCustodyActionState,
} from "@/features/crc/server/actions";
import type {
  CrcCustodyDestination,
  CrcCustodyLearner,
  CrcCustodyReceiver,
  CrcCustodyRecord,
} from "@/features/crc/server/custody";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const initialState: CrcCustodyActionState = {};

const statusLabels: Record<string, string> = {
  prepared: "Prepared",
  authorized: "Authorized",
  dispatched: "Dispatched",
  received: "Received",
  acknowledged: "Acknowledged",
  closed: "Closed",
};

const statusClass: Record<string, string> = {
  prepared: "bg-[color:var(--accent-amber-soft)] text-[color:var(--accent-amber)]",
  authorized: "bg-[color:var(--accent-sky-soft)] text-[color:var(--accent-sky)]",
  dispatched: "bg-[color:var(--accent-indigo-soft)] text-[color:var(--accent-indigo)]",
  received: "bg-[color:var(--accent-mint-soft)] text-[color:var(--accent-mint)]",
  acknowledged: "bg-success-soft text-[color:var(--success)]",
  closed: "bg-surface-muted text-muted-foreground",
};

const nextActions: Record<string, { action: string; label: string; roles: "leadership" | "custodian" | "recipient" | "either" }[]> = {
  prepared: [{ action: "authorize", label: "Authorize", roles: "leadership" }],
  authorized: [{ action: "dispatch", label: "Dispatch", roles: "custodian" }],
  dispatched: [{ action: "receive", label: "Receive", roles: "recipient" }],
  received: [{ action: "acknowledge", label: "Acknowledge", roles: "recipient" }],
  acknowledged: [{ action: "close", label: "Close", roles: "either" }],
  received_closed: [{ action: "close", label: "Close", roles: "either" }],
};

function fieldClass(extra = "") {
  return `min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)] ${extra}`;
}

function ActionButton({ record, leadership }: { record: CrcCustodyRecord; leadership: boolean }) {
  const [state, action, pending] = useActionState(transitionCrcCustody, initialState);
  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  const candidates = [...(nextActions[record.custodyStatus] ?? [])];
  const allowed = candidates.filter((candidate) => {
    if (candidate.roles === "leadership") return leadership && !record.incoming;
    if (candidate.roles === "custodian") return record.outgoing && !record.incoming;
    if (candidate.roles === "recipient") return record.incoming;
    return record.outgoing || record.incoming;
  });
  if (!allowed.length) return null;

  return (
    <form action={action}>
      <input type="hidden" name="custodyId" value={record.custodyId} />
      <input type="hidden" name="action" value={allowed[0].action} />
      <button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-2.5 text-xs font-medium hover:bg-surface disabled:opacity-60">
        {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <Check className="size-3.5" aria-hidden="true" />}
        {allowed[0].label}
      </button>
    </form>
  );
}

function PrepareForm({ destinations, canPrepare }: { destinations: CrcCustodyDestination[]; canPrepare: boolean }) {
  const [learnerQuery, setLearnerQuery] = useState("");
  const [learners, setLearners] = useState<CrcCustodyLearner[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedLearnerId, setSelectedLearnerId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [receivers, setReceivers] = useState<CrcCustodyReceiver[]>([]);
  const [selectedReceiverId, setSelectedReceiverId] = useState("");

  const [state, action, pending] = useActionState(async (previousState: CrcCustodyActionState, formData: FormData) => {
    const result = await prepareCrcCustody(previousState, formData);
    if (result.success) {
      setLearnerQuery("");
      setLearners([]);
      setSelectedLearnerId("");
      setSchoolId("");
      setReceivers([]);
      setSelectedReceiverId("");
    }
    return result;
  }, initialState);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  async function runLearnerSearch() {
    if (!learnerQuery.trim()) return;
    setSearching(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("search_crc_custody_learners", { p_query: learnerQuery.trim() });
      if (error) {
        toast.error("Learner search is not available for your scope.");
        setLearners([]);
        return;
      }
      setLearners((data ?? []) as CrcCustodyLearner[]);
    } finally {
      setSearching(false);
    }
  }

  async function loadReceivers(nextSchoolId: string) {
    setSchoolId(nextSchoolId);
    setSelectedReceiverId("");
    if (!nextSchoolId) {
      setReceivers([]);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("search_crc_custody_receivers", { p_school_id: nextSchoolId });
    if (!error) setReceivers((data ?? []) as CrcCustodyReceiver[]);
    else setReceivers([]);
  }

  const selectedLearner = learners.find((learner) => learner.learnerId === selectedLearnerId);

  if (!canPrepare) {
    return (
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <h2 className="scolapro-section-title">Prepare a custody transfer</h2>
        <p className="scolapro-section-description">Only a school social worker, learner-support or counselling custodian may prepare confidential CRC custody. Leadership can authorize prepared transfers.</p>
      </section>
    );
  }

  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-start gap-3 border-b border-border-subtle pb-4"><span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><Plus className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">Prepare a custody transfer</h2><p className="scolapro-section-description">Dispatch the confidential CRC to an explicitly authorized receiving custodian at another school. The transfer must be authorized by school leadership before dispatch.</p></div></div>
      <form action={action} className="mt-5 space-y-4" noValidate>
        <input type="hidden" name="learnerId" value={selectedLearnerId} />
        <input type="hidden" name="receivingSchoolId" value={schoolId} />
        <input type="hidden" name="receivingUserId" value={selectedReceiverId} />

        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium leading-4">Learner</p>
          <div className="flex gap-2">
            <input value={learnerQuery} onChange={(event) => setLearnerQuery(event.target.value)} placeholder="Search by name or admission number" className={fieldClass()} />
            <button type="button" onClick={runLearnerSearch} disabled={searching || !learnerQuery.trim()} className="scolapro-cta inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[var(--radius-sm)] bg-surface-muted px-3 text-sm font-medium hover:bg-surface disabled:opacity-60">
              {searching ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
              Search
            </button>
          </div>
          {learners.length ? <div className="mt-1.5 max-h-48 overflow-auto rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-1.5">{learners.map((learner) => <button key={learner.learnerId} type="button" onClick={() => setSelectedLearnerId(learner.learnerId)} className={`flex w-full items-center justify-between gap-2 rounded-[var(--radius-xs)] px-2.5 py-2 text-left text-sm transition hover:bg-surface-muted ${learner.learnerId === selectedLearnerId ? "bg-brand-soft text-brand-strong" : ""}`}><span className="min-w-0"><span className="block truncate font-medium">{learner.learnerName}</span><span className="block truncate text-[0.68rem] text-muted-foreground">{[learner.gradeLabel, learner.admissionNumber].filter(Boolean).join(" · ")}</span></span>{learner.learnerId === selectedLearnerId ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}</button>)}</div> : null}
          {selectedLearner ? <p className="text-xs text-[color:var(--success)]">Selected: {selectedLearner.learnerName}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium leading-4">Receiving school</p>
          <select value={schoolId} onChange={(event) => loadReceivers(event.target.value)} className={fieldClass()} aria-label="Receiving school">
            <option value="">Choose a school</option>
            {destinations.map((school) => <option key={school.schoolId} value={school.schoolId}>{school.schoolName}{school.schoolTown ? ` · ${school.schoolTown}` : ""}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium leading-4">Receiving custodian</p>
          <select value={selectedReceiverId} onChange={(event) => setSelectedReceiverId(event.target.value)} disabled={!schoolId} className={fieldClass()} aria-label="Receiving custodian">
            <option value="">{schoolId ? "Choose a custodian" : "Choose a school first"}</option>
            {receivers.map((receiver) => <option key={receiver.userId} value={receiver.userId}>{receiver.displayName} · {receiver.roleKey.replaceAll("_", " ")}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="custodyNote" className="text-xs font-medium leading-4">Custody note</label>
          <textarea id="custodyNote" name="custodyNote" rows={3} className={`${fieldClass()} py-2`} placeholder="Optional handover context — no confidential content required here" />
        </div>

        <div className="flex justify-end border-t border-border-subtle pt-4">
          <button type="submit" disabled={pending || !selectedLearnerId || !schoolId || !selectedReceiverId} className="scolapro-cta inline-flex min-h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60">
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            {pending ? "Preparing…" : "Prepare custody"}
          </button>
        </div>
      </form>
    </section>
  );
}

export function CrcCustodyWorkspace({
  records,
  destinations,
  canPrepare,
  leadership,
}: {
  records: CrcCustodyRecord[];
  destinations: CrcCustodyDestination[];
  canPrepare: boolean;
  leadership: boolean;
}) {
  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] xl:items-start">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="mb-4 flex items-center gap-2 border-b border-border-subtle pb-4"><span className="scolapro-tone-amber grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"><ShieldCheck className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">Custody records</h2><p className="scolapro-section-description !mt-0">Confidential CRC transfers within your need-to-know scope. Dispatch is school-to-school and requires an explicit authorized receiving custodian.</p></div></div>
        {records.length ? <div className="divide-y divide-border-subtle">{records.map((record) => <article key={record.custodyId} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="scolapro-record-title">{record.learnerName}{record.admissionNumber ? <span className="ml-2 text-xs font-normal text-muted-foreground">{record.admissionNumber}</span> : null}</p><p className="mt-0.5 text-xs text-muted-foreground">{record.originSchoolName} → {record.receivingSchoolName}</p><p className="mt-0.5 text-xs text-muted-foreground">Receiving custodian: {record.receivingUserName}</p>{record.custodyNote ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{record.custodyNote}</p> : null}</div><div className="flex shrink-0 flex-wrap items-center gap-2"><span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.68rem] font-medium capitalize ${statusClass[record.custodyStatus] ?? "bg-surface-muted text-muted-foreground"}`}>{statusLabels[record.custodyStatus] ?? record.custodyStatus}</span><ActionButton record={record} leadership={leadership} /></div></div><p className="text-[0.68rem] text-muted-foreground">Prepared {new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(record.preparedAt))} · Updated {new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(record.updatedAt))}</p></article>)}</div> : <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center"><p className="text-sm font-medium">No custody records in your scope</p><p className="mt-1 text-xs text-muted-foreground">Outgoing transfers prepared by your school and incoming transfers addressed to you will appear here.</p></div>}
      </section>

      <div className="space-y-5">
        <PrepareForm destinations={destinations} canPrepare={canPrepare} />
        <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5">
          <div className="flex items-start gap-3"><span className="scolapro-tone-mint grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><ArrowRightLeft className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">How custody works</h2><p className="scolapro-section-description">Prepare → Authorize → Secure dispatch → Recipient receives → Recipient acknowledges → Custody closed. Every step binds the acting user and writes an immutable audit event.</p></div></div>
        </section>
      </div>
    </div>
  );
}