"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CloudOff, Clock3, RefreshCw, Trash2, TriangleAlert, X } from "lucide-react";
import { DAILY_ATTENDANCE_MUTATION } from "@/features/attendance/offline/daily-register-queue";
import { SUBJECT_ATTENDANCE_MUTATION } from "@/features/attendance/offline/subject-period-queue";
import { LIBRARY_CIRCULATION_MUTATION } from "@/features/library/offline/circulation-queue";
import { TEACHING_COVERAGE_MUTATION } from "@/features/teaching/offline/coverage-queue";
import {
  listOfflineMutations,
  type OfflineMutationRecord,
  type OfflineScope,
} from "@/lib/offline/db";

type QueueRecord = OfflineMutationRecord<Record<string, unknown>>;
type QueueStatus = QueueRecord["status"];

const statusLabels: Record<QueueStatus, string> = {
  pending: "Pending",
  syncing: "Syncing",
  conflicted: "Conflict",
  rejected: "Rejected",
};

const statusIcons: Record<QueueStatus, typeof Clock3> = {
  pending: Clock3,
  syncing: RefreshCw,
  conflicted: TriangleAlert,
  rejected: X,
};

const statusClasses: Record<QueueStatus, string> = {
  pending: "bg-surface-muted text-muted-foreground",
  syncing: "bg-brand-soft text-brand-strong",
  conflicted: "bg-warning-soft text-[color:var(--warning)]",
  rejected: "bg-danger-soft text-[color:var(--danger)]",
};

const queueLabels: Record<string, { domain: string; action: string }> = {
  [DAILY_ATTENDANCE_MUTATION]: { domain: "Daily attendance", action: "Save register" },
  [SUBJECT_ATTENDANCE_MUTATION]: { domain: "Lesson attendance", action: "Save register" },
  [LIBRARY_CIRCULATION_MUTATION]: { domain: "Library circulation", action: "Issue or return" },
  [TEACHING_COVERAGE_MUTATION]: { domain: "Teaching coverage", action: "Save teaching actual" },
};

function labelFor(record: QueueRecord) {
  const known = queueLabels[record.kind];
  if (!known) return { domain: "Offline work", action: "Queued change" };
  const action = typeof record.payload.action === "string"
    ? record.payload.action === "issue"
      ? "Issue intent"
      : record.payload.action === "return"
        ? "Return intent"
        : known.action
    : known.action;
  return { domain: known.domain, action };
}

function safeReason(value: string | null) {
  if (!value) return "Waiting for sync.";
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

function localTime(value: string) {
  try {
    return new Intl.DateTimeFormat("en-NA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return "Local time unavailable";
  }
}

export function OfflineSyncCenter({
  scope,
  state,
  pending,
  onRetry,
  onDiscard,
}: {
  scope: OfflineScope | null;
  state: "online" | "offline" | "syncing" | "attention";
  pending: number;
  onRetry: (id: string) => Promise<void>;
  onDiscard: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<QueueRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!scope) {
      setRecords([]);
      return;
    }
    setLoading(true);
    try {
      const next = await listOfflineMutations<Record<string, unknown>>(scope);
      setRecords(next.filter((record) =>
        record.userId === scope.userId
        && record.tenantId === scope.tenantId
        && record.schoolId === scope.schoolId,
      ));
    } catch {
      setActionError("The offline queue could not be read on this device.");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
    window.addEventListener("scolapro-offline-queue-changed", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("scolapro-offline-queue-changed", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, [refresh]);

  const counts = useMemo(() => records.reduce<Record<QueueStatus, number>>((summary, record) => {
    summary[record.status] += 1;
    return summary;
  }, { pending: 0, syncing: 0, conflicted: 0, rejected: 0 }), [records]);

  const hasAttention = counts.conflicted + counts.rejected > 0;
  const hasQueue = records.length > 0;
  if (!scope || (!hasQueue && state === "online")) return null;

  async function retry(record: QueueRecord) {
    setActionError(null);
    try {
      await onRetry(record.id);
      await refresh();
    } catch {
      setActionError("This pending change could not be retried.");
    }
  }

  async function discard(record: QueueRecord) {
    setActionError(null);
    try {
      await onDiscard(record.id);
      setConfirmingId(null);
      await refresh();
    } catch {
      setActionError("This local queued change could not be discarded.");
    }
  }

  const statusText = state === "syncing"
    ? `Syncing ${pending} queued change${pending === 1 ? "" : "s"}…`
    : hasAttention
      ? `${counts.conflicted + counts.rejected} change${counts.conflicted + counts.rejected === 1 ? "" : "s"} need attention`
      : state === "offline"
        ? `Offline · ${pending} queued change${pending === 1 ? "" : "s"}`
        : `${pending} queued change${pending === 1 ? "" : "s"} waiting to sync`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-1/2 z-[170] -translate-x-1/2 rounded-full border border-border-subtle bg-surface-elevated px-3 py-2 text-xs font-medium text-foreground shadow-[var(--shadow-md)] lg:bottom-5"
        aria-expanded={open}
        aria-controls="offline-sync-center"
      >
        <span className="flex items-center gap-2">
          {state === "syncing" ? <RefreshCw className="size-3.5 animate-spin text-brand" aria-hidden="true" /> : hasAttention ? <TriangleAlert className="size-3.5 text-[color:var(--warning)]" aria-hidden="true" /> : <CloudOff className="size-3.5 text-muted-foreground" aria-hidden="true" />}
          {statusText}
        </span>
      </button>

      {open ? (
        <aside
          id="offline-sync-center"
          className="fixed bottom-[calc(8rem+env(safe-area-inset-bottom))] left-1/2 z-[171] flex max-h-[min(70vh,40rem)] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated shadow-[var(--shadow-lg)] lg:bottom-16 lg:left-auto lg:right-5 lg:translate-x-0"
          aria-label="Offline sync center"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border-subtle p-4">
            <div>
              <h2 className="text-sm font-semibold">Offline sync center</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Only this signed-in user and school&apos;s local queue is shown.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted" aria-label="Close offline sync center">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          {actionError ? <p className="border-b border-border-subtle bg-danger-soft px-4 py-3 text-xs text-[color:var(--danger)]" role="alert">{actionError}</p> : null}
          <div className="grid grid-cols-4 gap-1 border-b border-border-subtle p-3 text-center text-[0.65rem]">
            {(Object.keys(statusLabels) as QueueStatus[]).map((status) => <div key={status} className="rounded-[var(--radius-xs)] bg-surface-muted px-1 py-2"><p className="font-semibold">{counts[status]}</p><p className="mt-0.5 text-muted-foreground">{statusLabels[status]}</p></div>)}
          </div>

          <div className="min-h-0 overflow-y-auto p-3">
            {loading ? <p className="p-3 text-xs text-muted-foreground">Loading local queue…</p> : !records.length ? <div className="p-3 text-center"><Check className="mx-auto size-5 text-[color:var(--success)]" aria-hidden="true" /><p className="mt-2 text-xs font-medium">No queued changes</p><p className="mt-1 text-xs text-muted-foreground">Local offline work will appear here before sync.</p></div> : <div className="space-y-2">{records.map((record) => {
              const label = labelFor(record);
              const StatusIcon = statusIcons[record.status];
              const canRetry = record.status === "pending";
              const canDiscard = record.status !== "syncing";
              return <article key={record.id} className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="text-xs font-semibold">{label.domain}</p><p className="mt-0.5 text-xs text-muted-foreground">{label.action}</p></div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-xs)] px-2 py-1 text-[0.65rem] font-semibold ${statusClasses[record.status]}`}><StatusIcon className={`size-3 ${record.status === "syncing" ? "animate-spin" : ""}`} aria-hidden="true" />{statusLabels[record.status]}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{safeReason(record.lastError)}</p>
                <p className="mt-1 text-[0.65rem] text-muted-foreground">Updated locally {localTime(record.updatedAt)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {canRetry ? <button type="button" onClick={() => void retry(record)} className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-brand-soft px-2.5 text-[0.68rem] font-semibold text-brand-strong"><RefreshCw className="size-3" aria-hidden="true" />Retry</button> : null}
                  {canDiscard ? confirmingId === record.id ? <span className="flex flex-wrap items-center gap-2 text-[0.68rem]"><span className="text-muted-foreground">Discard local item?</span><button type="button" onClick={() => void discard(record)} className="inline-flex min-h-8 items-center rounded-[var(--radius-xs)] bg-danger-soft px-2.5 font-semibold text-[color:var(--danger)]">Discard</button><button type="button" onClick={() => setConfirmingId(null)} className="inline-flex min-h-8 items-center rounded-[var(--radius-xs)] bg-surface-muted px-2.5 font-semibold text-muted-foreground">Cancel</button></span> : <button type="button" onClick={() => setConfirmingId(record.id)} className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-2.5 text-[0.68rem] font-semibold text-muted-foreground"><Trash2 className="size-3" aria-hidden="true" />Discard</button> : null}
                </div>
              </article>;
            })}</div>}
          </div>
        </aside>
      ) : null}
    </>
  );
}