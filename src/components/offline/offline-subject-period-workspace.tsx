"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenText, CloudOff, TriangleAlert } from "lucide-react";
import { Picker } from "@/components/ui/picker";
import { SubjectPeriodRegister } from "@/features/attendance/subject-period-register";
import { listCachedSubjectPeriodSnapshots } from "@/features/attendance/offline/subject-period-queue";
import { getActiveOfflineScope, type OfflineScope, type OfflineSnapshot } from "@/lib/offline/db";
import type { SubjectPeriodRoster } from "@/features/attendance/server/subject-period";

type CachedSubjectPeriod = SubjectPeriodRoster & { attendanceDate: string };
type SnapshotRecord = OfflineSnapshot<CachedSubjectPeriod>;

function snapshotLabel(record: SnapshotRecord) {
  const { slot, attendanceDate } = record.payload;
  return `${slot.subjectName} · ${slot.className} · ${slot.periodName} · ${attendanceDate}`;
}

function snapshotHelper(record: SnapshotRecord) {
  const { slot, learners } = record.payload;
  return `${learners.length} learner${learners.length === 1 ? "" : "s"} · ${slot.teacherName}`;
}

export function OfflineSubjectPeriodWorkspace() {
  const [scope, setScope] = useState<OfflineScope | null>(null);
  const [records, setRecords] = useState<SnapshotRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const activeScope = await getActiveOfflineScope();
      if (!activeScope) {
        setScope(null);
        setRecords([]);
        setSelectedId("");
        return;
      }

      const cached = await listCachedSubjectPeriodSnapshots(activeScope);
      setScope(activeScope);
      setRecords(cached);
      setSelectedId((current) => cached.some((record) => record.id === current)
        ? current
        : cached[0]?.id ?? "");
    } catch {
      setScope(null);
      setRecords([]);
      setSelectedId("");
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => { void loadSnapshots(); });
    const refresh = () => { void loadSnapshots(); };
    window.addEventListener("scolapro-offline-queue-changed", refresh);
    return () => window.removeEventListener("scolapro-offline-queue-changed", refresh);
  }, [loadSnapshots]);

  const selected = useMemo(
    () => records.find((record) => record.id === selectedId) ?? records[0] ?? null,
    [records, selectedId],
  );

  if (loading) {
    return (
      <section className="mt-6 rounded-[var(--radius-md)] border border-border-subtle bg-surface-muted p-4 text-sm text-muted-foreground" aria-busy="true">
        Loading cached subject-period lessons…
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-6 rounded-[var(--radius-md)] border border-dashed border-border bg-surface-muted p-4 text-sm leading-6 text-muted-foreground" role="alert">
        Cached subject-period lessons could not be loaded. Reconnect and open a lesson register again to refresh this offline workspace.
      </section>
    );
  }

  if (!scope || !records.length) {
    return (
      <section className="mt-6 rounded-[var(--radius-md)] border border-dashed border-border bg-surface-muted p-4 text-sm leading-6 text-muted-foreground">
        No cached subject-period lesson is available on this device yet. Open a lesson register once while online so the current bounded lesson roster can be used during an outage.
      </section>
    );
  }

  return (
    <section className="mt-6 overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
      <div className="border-b border-border-subtle p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-brand-soft text-brand-strong">
              <BookOpenText className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="scolapro-section-title">Subject-period lesson fallback</h2>
              <p className="scolapro-section-description">Choose a cached lesson and date for operational lesson attendance. This is separate from the daily register.</p>
            </div>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-xs)] bg-warning-soft px-2.5 py-1.5 text-xs font-semibold text-[color:var(--warning)]">
            <CloudOff className="size-3.5" aria-hidden="true" />
            Local only
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] sm:items-end">
          <Picker
            label="Cached lesson and date"
            ariaLabel="Choose cached subject-period lesson and date"
            value={selected?.id ?? ""}
            onChange={setSelectedId}
            options={records.map((record) => ({ value: record.id, label: snapshotLabel(record), helper: snapshotHelper(record) }))}
            placeholder="Choose cached lesson"
            searchable
            searchPlaceholder="Search cached lessons"
          />
          {selected ? (
            <p className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2.5 text-xs leading-5 text-muted-foreground">
              Snapshot saved {new Intl.DateTimeFormat("en-NA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(selected.updatedAt))}.
            </p>
          ) : null}
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-sm)] bg-warning-soft/60 px-3 py-2.5 text-xs leading-5 text-[color:var(--warning)]" role="status">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>Offline saves stay on this device until the existing subject-period queue syncs and the server accepts them. Restricted evidence upload is unavailable offline.</span>
        </div>
      </div>

      {selected ? (
        <div className="p-3 sm:p-5">
          <SubjectPeriodRegister
            key={selected.id}
            roster={selected.payload}
            attendanceDate={selected.payload.attendanceDate}
            offlineScope={scope}
          />
        </div>
      ) : null}
    </section>
  );
}