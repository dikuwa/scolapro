"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowRightLeft, Check, LoaderCircle, Plus, Search, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
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
  CrcAdministrationSummary,
  CrcClassCompleteness,
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

        <Picker
          label="Receiving school"
          value={schoolId}
          onChange={loadReceivers}
          placeholder="Choose a school"
          searchable
          options={destinations.map((school) => ({
            value: school.schoolId,
            label: school.schoolName,
            helper: school.schoolTown ?? undefined,
          }))}
        />

        <Picker
          label="Receiving custodian"
          value={selectedReceiverId}
          onChange={setSelectedReceiverId}
          placeholder={schoolId ? "Choose a custodian" : "Choose a school first"}
          disabled={!schoolId}
          searchable
          options={receivers.map((receiver) => ({
            value: receiver.userId,
            label: receiver.displayName,
            helper: receiver.roleKey.replaceAll("_", " "),
          }))}
        />

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
  summary,
  classes,
}: {
  records: CrcCustodyRecord[];
  destinations: CrcCustodyDestination[];
  canPrepare: boolean;
  leadership: boolean;
  summary: CrcAdministrationSummary;
  classes: CrcClassCompleteness[];
}) {
  const [view, setView] = useState<"overview" | "requests" | "transfers" | "incoming" | "completeness" | "reports" | "training">("overview");

  const visibleRecords = view === "requests"
    ? records.filter((record) => record.outgoing && ["prepared", "authorized"].includes(record.custodyStatus))
    : view === "transfers"
      ? records.filter((record) => record.outgoing)
      : view === "incoming"
        ? records.filter((record) => record.incoming)
        : records;

  const tabs = [
    ["overview", "Overview"],
    ["requests", "Requests"],
    ["transfers", "Transfers"],
    ["incoming", "Incoming"],
    ["completeness", "Completeness"],
    ["reports", "Reports & audit"],
    ["training", "Training"],
  ] as const;

  const showCustodyList = ["overview", "requests", "transfers", "incoming"].includes(view);

  return (
    <div className="mt-5 space-y-5">
      <nav aria-label="CRC workspace views" className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            aria-pressed={view === key}
            className={`shrink-0 rounded-[var(--radius-sm)] px-3 py-2 text-xs font-medium transition ${view === key ? "bg-brand text-white" : "bg-surface-muted text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {view === "overview" ? (
        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Routine CRC activity", summary.learnersWithRoutineCrcActivity, `of ${summary.currentLearners} current learners`],
            ["Follow-up", summary.learnersWithoutRoutineCrcActivity, "learners without routine CRC activity"],
            ["Requests", summary.requestsAwaitingAction, "prepared or authorized outgoing transfers"],
            ["Incoming", summary.incomingAwaitingAcknowledgement, "awaiting receipt or acknowledgement"],
          ].map(([label, value, helper], index) => (
            <div key={String(label)} className={`px-4 py-4 sm:px-5 ${index ? "border-t border-border-subtle sm:border-l sm:border-t-0" : ""}`}>
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">{value}</p>
              <p className="mt-1 text-[0.68rem] text-muted-foreground">{helper}</p>
            </div>
          ))}
        </div>
      ) : null}

      {showCustodyList ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] xl:items-start">
          <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <div className="mb-4 flex items-center gap-2 border-b border-border-subtle pb-4">
              <span className="scolapro-tone-amber grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"><ShieldCheck className="size-4" aria-hidden="true" /></span>
              <div>
                <h2 className="scolapro-section-title">{view === "incoming" ? "Incoming custody" : view === "requests" ? "Requests awaiting action" : view === "transfers" ? "Outgoing transfers" : "Custody records"}</h2>
                <p className="scolapro-section-description !mt-0">Confidential CRC transfers remain within the caller&apos;s need-to-know custody scope.</p>
              </div>
            </div>
            {visibleRecords.length ? (
              <div className="divide-y divide-border-subtle">
                {visibleRecords.map((record) => (
                  <article key={record.custodyId} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="scolapro-record-title">{record.learnerName}{record.admissionNumber ? <span className="ml-2 text-xs font-normal text-muted-foreground">{record.admissionNumber}</span> : null}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{record.originSchoolName} → {record.receivingSchoolName}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Receiving custodian: {record.receivingUserName}</p>
                        {record.custodyNote ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{record.custodyNote}</p> : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.68rem] font-medium capitalize ${statusClass[record.custodyStatus] ?? "bg-surface-muted text-muted-foreground"}`}>{statusLabels[record.custodyStatus] ?? record.custodyStatus}</span>
                        <ActionButton record={record} leadership={leadership} />
                      </div>
                    </div>
                    <p className="text-[0.68rem] text-muted-foreground">Prepared {new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(record.preparedAt))} · Updated {new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(record.updatedAt))}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center">
                <p className="text-sm font-medium">No records in this view</p>
                <p className="mt-1 text-xs text-muted-foreground">Only custody records within your authorized scope appear here.</p>
              </div>
            )}
          </section>

          <div className="space-y-5">
            {view === "overview" || view === "transfers" ? <PrepareForm destinations={destinations} canPrepare={canPrepare} /> : null}
            {summary.canViewConfidentialSupport ? (
              <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 sm:p-5">
                <h2 className="scolapro-section-title">Confidential support</h2>
                <p className="scolapro-section-description">Your explicit support role permits need-to-know access through the governed learner-support and CRC record surfaces. Confidential case content is not duplicated into this dashboard.</p>
              </section>
            ) : (
              <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5">
                <h2 className="scolapro-section-title">Administrative oversight</h2>
                <p className="scolapro-section-description">Leadership sees workflow state and readiness only. Counselling, psychometric and highly restricted content remains outside this administrative view.</p>
              </section>
            )}
          </div>
        </div>
      ) : null}

      {view === "completeness" ? (
        <section className="overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
          <div className="border-b border-border-subtle px-4 py-4 sm:px-5">
            <h2 className="scolapro-section-title">Routine CRC contribution coverage · {summary.academicYear}</h2>
            <p className="scolapro-section-description">This is a follow-up indicator, not a score or ranking. It shows whether each current learner has at least one routine CRC contribution in the academic year.</p>
          </div>
          {classes.length ? (
            <div className="divide-y divide-border-subtle">
              {classes.map((item) => (
                <article key={item.registerClassId} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
                  <div>
                    <p className="text-sm font-medium">{item.registerClassLabel}</p>
                    <p className="text-xs text-muted-foreground">{item.gradeLabel} · {item.learnerCount} current learners</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.contributedCount} with activity · {item.followUpCount} follow-up</p>
                </article>
              ))}
            </div>
          ) : <p className="px-4 py-8 text-sm text-muted-foreground sm:px-5">No current register classes are available for this academic year.</p>}
        </section>
      ) : null}

      {view === "reports" ? (
        <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <h2 className="scolapro-section-title">Reports & audit</h2>
          <p className="scolapro-section-description">Operational counts come from authoritative CRC/custody records. Individual confidential support content is intentionally excluded.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[var(--radius-sm)] bg-surface-muted p-3"><p className="text-xs text-muted-foreground">Outgoing transfers</p><p className="mt-1 text-xl font-semibold">{summary.outgoingTransfers}</p></div>
            <div className="rounded-[var(--radius-sm)] bg-surface-muted p-3"><p className="text-xs text-muted-foreground">Incoming transfers</p><p className="mt-1 text-xl font-semibold">{summary.incomingTransfers}</p></div>
            <div className="rounded-[var(--radius-sm)] bg-surface-muted p-3"><p className="text-xs text-muted-foreground">Requests awaiting action</p><p className="mt-1 text-xl font-semibold">{summary.requestsAwaitingAction}</p></div>
            <div className="rounded-[var(--radius-sm)] bg-surface-muted p-3"><p className="text-xs text-muted-foreground">Incoming follow-up</p><p className="mt-1 text-xl font-semibold">{summary.incomingAwaitingAcknowledgement}</p></div>
          </div>
        </section>
      ) : null}

      {view === "training" ? (
        <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="scolapro-tone-mint grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><ArrowRightLeft className="size-4" aria-hidden="true" /></span>
            <div>
              <h2 className="scolapro-section-title">CRC workflow guidance</h2>
              <p className="scolapro-section-description">Routine register-teacher contributions stay non-confidential. Confidential custody follows Prepare → Authorize → Dispatch → Receive → Acknowledge → Close. Health, counselling and psychometric content remains separately permissioned throughout.</p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
