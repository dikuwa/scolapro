"use client";

import { useCallback, useEffect, useState } from "react";
import { OfflineSyncCenter } from "@/components/offline/offline-sync-center";
import { activateOfflineScope, discardOfflineMutation, offlineQueueSummary, retryOfflineMutation, type OfflineScope } from "@/lib/offline/db";
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

  const retry = useCallback(async (id: string) => {
    if (!scope) return;
    await retryOfflineMutation(scope, id);
    await sync();
  }, [scope, sync]);

  const discard = useCallback(async (id: string) => {
    if (!scope) return;
    await discardOfflineMutation(scope, id);
    window.dispatchEvent(new Event("scolapro-offline-queue-changed"));
  }, [scope]);

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

  return <OfflineSyncCenter scope={scope} state={state} pending={pending} onRetry={retry} onDiscard={discard} />;
}
