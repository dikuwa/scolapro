"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { activateOfflineScope, offlineQueueSummary, type OfflineScope } from "@/lib/offline/db";
import { syncQueuedDailyRegisters } from "@/features/attendance/offline/daily-register-queue";
import { syncQueuedSubjectPeriodAttendance } from "@/features/attendance/offline/subject-period-queue";
import { syncQueuedLibraryCirculation } from "@/features/library/offline/circulation-queue";

type State = "online" | "offline" | "syncing" | "attention";

export function OfflineRuntime({ scope }: { scope: OfflineScope | null }) {
  const [state, setState] = useState<State>(() => typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online");
  const [pending, setPending] = useState(0);

  const refresh = useCallback(async () => {
    if (!scope) {
      setPending(0);
      setState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online");
      return;
    }
    const summary = await offlineQueueSummary(scope);
    setPending(summary.pending);
    if (summary.attention) setState("attention");
    else if (typeof navigator !== "undefined" && !navigator.onLine) setState("offline");
    else setState("online");
  }, [scope]);

  const sync = useCallback(async () => {
    if (!scope || typeof navigator === "undefined" || !navigator.onLine) {
      await refresh();
      return;
    }
    const before = await offlineQueueSummary(scope);
    if (!before.pending) {
      await refresh();
      return;
    }
    setState("syncing");
    setPending(before.pending);
    await Promise.all([
      syncQueuedDailyRegisters(scope),
      syncQueuedSubjectPeriodAttendance(scope),
      syncQueuedLibraryCirculation(scope),
    ]);
    const after = await offlineQueueSummary(scope);
    setPending(after.pending);
    setState(after.attention ? "attention" : "online");
  }, [refresh, scope]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    let active = true;
    activateOfflineScope(scope)
      .then(() => active ? sync() : undefined)
      .catch(() => undefined);

    const onOnline = () => { if (active) void sync(); };
    const onOffline = () => { if (active) setState("offline"); };
    const onQueue = () => { if (active) void refresh(); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("scolapro-offline-queue-changed", onQueue);
    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("scolapro-offline-queue-changed", onQueue);
    };
  }, [refresh, scope, sync]);

  if (state === "online" && pending === 0) return null;

  const detail = state === "offline"
    ? pending ? `Offline · ${pending} change${pending === 1 ? "" : "s"} saved on this device` : "Offline"
    : state === "syncing"
      ? `Syncing ${pending} change${pending === 1 ? "" : "s"}…`
      : state === "attention"
        ? "Some offline changes need attention"
        : pending ? `${pending} change${pending === 1 ? "" : "s"} waiting to sync` : "";

  return (
    <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-1/2 z-[170] -translate-x-1/2 rounded-full border border-border-subtle bg-surface-elevated px-3 py-2 text-xs font-medium text-foreground shadow-[var(--shadow-md)] lg:bottom-5" role="status" aria-live="polite">
      <span className="flex items-center gap-2">
        {state === "syncing" ? <RefreshCw className="size-3.5 animate-spin text-brand" aria-hidden="true" /> : state === "attention" ? <TriangleAlert className="size-3.5 text-[color:var(--warning)]" aria-hidden="true" /> : <CloudOff className="size-3.5 text-muted-foreground" aria-hidden="true" />}
        {detail}
      </span>
    </div>
  );
}
