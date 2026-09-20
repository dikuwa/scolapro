"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, RefreshCw, ShieldCheck, X } from "lucide-react";
import {
  listCachedDailyRegisters,
  queueDailyRegister,
  type OfflineDailyRegisterSnapshot,
} from "@/features/attendance/offline/daily-register-queue";
import { getActiveOfflineScope, type OfflineScope, type OfflineSnapshot } from "@/lib/offline/db";
import type { AttendanceLearnerRow } from "@/features/attendance/server/register";

type SnapshotRecord = OfflineSnapshot<OfflineDailyRegisterSnapshot>;
type Status = AttendanceLearnerRow["status"];

const statuses: Array<{ value: Status; label: string; icon: typeof Check }> = [
  { value: "present", label: "Present", icon: Check },
  { value: "absent", label: "Absent", icon: X },
  { value: "late", label: "Late", icon: Clock3 },
  { value: "excused", label: "Excused", icon: ShieldCheck },
];

export function OfflineAttendanceWorkspace() {
  const [scope, setScope] = useState<OfflineScope | null>(null);
  const [records, setRecords] = useState<SnapshotRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [rows, setRows] = useState<AttendanceLearnerRow[]>([]);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let active = true;
    void getActiveOfflineScope()
      .then(async (current) => {
        if (!active || !current) return;
        setScope(current);
        const cached = await listCachedDailyRegisters(current);
        if (!active) return;
        setRecords(cached);
        const first = cached[0];
        if (first) {
          setSelectedId(first.id);
          setRows(first.payload.learners);
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const selected = records.find((record) => record.id === selectedId) ?? records[0] ?? null;
  const exceptions = useMemo(
    () => rows
      .filter((row) => row.status !== "present")
      .map((row) => ({
        enrolment_id: row.enrolmentId,
        status: row.status as Exclude<Status, "present">,
        reason_id: row.reasonId,
        note: row.note,
      })),
    [rows],
  );

  function choose(record: SnapshotRecord) {
    setSelectedId(record.id);
    setRows(record.payload.learners);
    setMessage("");
  }

  function updateStatus(enrolmentId: string, status: Status) {
    setRows((current) => current.map((row) => row.enrolmentId === enrolmentId
      ? { ...row, status, reasonId: status === "present" ? null : row.reasonId, note: status === "present" ? null : row.note }
      : row));
  }

  async function save() {
    if (!scope || !selected) return;
    if (selected.payload.teachingDay.impact === "NO_TEACHING") {
      setMessage("This cached date is marked as a non-teaching day and cannot be submitted.");
      return;
    }

    try {
      await queueDailyRegister(scope, {
        registerClassId: selected.payload.registerClassId,
        attendanceDate: selected.payload.attendanceDate,
        clientMutationId: crypto.randomUUID(),
        replacesSubmissionId: selected.payload.currentSubmissionId,
        exceptions,
      });
      setMessage("Attendance saved on this device. It will sync after you reconnect.");
    } catch {
      setMessage("This device could not store the attendance change.");
    }
  }

  if (!scope || !records.length) {
    return (
      <div className="mt-6 rounded-[var(--radius-md)] bg-surface-muted p-4 text-sm leading-6 text-muted-foreground">
        No attendance roster has been cached on this device yet. Open a class register once while online so ScolaPro can make that working roster available during an outage.
      </div>
    );
  }

  return (
    <section className="mt-6 overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
      <div className="border-b border-border-subtle p-4">
        <p className="text-xs font-medium text-muted-foreground">Cached attendance register</p>
        <select
          value={selected?.id ?? ""}
          onChange={(event) => {
            const record = records.find((item) => item.id === event.target.value);
            if (record) choose(record);
          }}
          className="mt-2 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm"
        >
          {records.map((record) => (
            <option key={record.id} value={record.id}>
              {record.payload.registerClassName} · {record.payload.attendanceDate}
            </option>
          ))}
        </select>
        {selected ? <p className="mt-2 text-[0.7rem] text-muted-foreground">Snapshot saved {new Intl.DateTimeFormat("en-NA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(selected.updatedAt))}. The server revalidates school access and the school day when syncing.</p> : null}
      </div>

      {selected ? (
        <>
          <div className="max-h-[52vh] divide-y divide-border-subtle overflow-y-auto">
            {rows.map((row) => (
              <div key={row.enrolmentId} className="p-3 sm:p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <p className="text-[0.68rem] text-muted-foreground">{row.admissionNumber ?? "No admission number"}</p>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {statuses.map((status) => {
                      const Icon = status.icon;
                      const active = row.status === status.value;
                      return (
                        <button
                          key={status.value}
                          type="button"
                          onClick={() => updateStatus(row.enrolmentId, status.value)}
                          aria-pressed={active}
                          className={`inline-flex min-h-9 items-center justify-center gap-1 rounded-[var(--radius-xs)] px-2 text-[0.65rem] font-semibold ${active ? "bg-brand-soft text-brand-strong" : "bg-surface-muted text-muted-foreground"}`}
                        >
                          <Icon className="size-3" aria-hidden="true" />
                          <span className="hidden sm:inline">{status.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-border-subtle p-4">
            {message ? <p className="mb-3 text-xs text-muted-foreground" role="status">{message}</p> : null}
            <button type="button" onClick={() => void save()} className="scolapro-cta inline-flex min-h-10 w-full items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white sm:w-auto">
              <RefreshCw className="size-4" aria-hidden="true" />
              Save on this device
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
