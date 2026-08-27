"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronLeft, ChevronRight, LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { submitDailyRegister, type DailyRegisterState } from "@/features/attendance/server/actions";
import type { AttendanceClassOption, AttendanceLearnerRow, AttendanceReasonOption } from "@/features/attendance/server/register";

const initialState: DailyRegisterState = {};
type AttendanceStatus = AttendanceLearnerRow["status"];
type EditableRow = AttendanceLearnerRow;

const statuses: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "excused", label: "Excused" },
];

function dateShift(date: string, days: number) {
  const current = new Date(`${date}T12:00:00`);
  current.setDate(current.getDate() + days);
  return current.toISOString().slice(0, 10);
}

export function DailyRegister({
  classes,
  selectedClassId,
  attendanceDate,
  learners,
  reasons,
  currentSubmissionId,
}: {
  classes: AttendanceClassOption[];
  selectedClassId: string | null;
  attendanceDate: string;
  learners: AttendanceLearnerRow[];
  reasons: AttendanceReasonOption[];
  currentSubmissionId: string | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(submitDailyRegister, initialState);
  const [rows, setRows] = useState<EditableRow[]>(learners);
  const [classOpen, setClassOpen] = useState(false);
  const [reasonOpenFor, setReasonOpenFor] = useState<string | null>(null);
  const [clientMutationId, setClientMutationId] = useState(() => crypto.randomUUID());
  const selectedClass = classes.find((item) => item.id === selectedClassId);

  useEffect(() => {
    setRows(learners);
    setClientMutationId(crypto.randomUUID());
  }, [learners, selectedClassId, attendanceDate]);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      setClientMutationId(crypto.randomUUID());
      router.refresh();
    } else {
      toast.error(state.message);
    }
  }, [state, router]);

  const exceptions = useMemo(
    () => rows
      .filter((row) => row.status !== "present")
      .map((row) => ({
        enrolment_id: row.enrolmentId,
        status: row.status,
        reason_id: row.reasonId,
        note: row.note,
      })),
    [rows],
  );

  const presentCount = rows.filter((row) => row.status === "present").length;
  const exceptionCount = rows.length - presentCount;

  function updateRow(enrolmentId: string, changes: Partial<EditableRow>) {
    setRows((current) => current.map((row) => row.enrolmentId === enrolmentId ? { ...row, ...changes } : row));
  }

  function moveDate(days: number) {
    const params = new URLSearchParams();
    if (selectedClassId) params.set("class", selectedClassId);
    params.set("date", dateShift(attendanceDate, days));
    router.push(`/attendance?${params.toString()}`);
  }

  function chooseClass(classId: string) {
    setClassOpen(false);
    router.push(`/attendance?class=${encodeURIComponent(classId)}&date=${encodeURIComponent(attendanceDate)}`);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="relative max-w-xl">
            <p className="text-xs font-medium text-muted-foreground">Register class</p>
            <button
              type="button"
              onClick={() => setClassOpen((value) => !value)}
              aria-expanded={classOpen}
              className="mt-1.5 flex min-h-10 w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-left text-sm shadow-[var(--shadow-xs)] transition hover:border-border"
            >
              <span className="min-w-0 truncate">{selectedClass ? `${selectedClass.name} · ${selectedClass.grade}` : "Choose a class"}</span>
              <ChevronDown className={`size-4 text-muted-foreground transition-transform ${classOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {classOpen ? (
              <div className="absolute z-30 mt-1.5 max-h-64 w-full overflow-auto rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-1.5 shadow-[var(--shadow-md)]">
                {classes.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => chooseClass(item.id)}
                    className={`w-full rounded-[var(--radius-xs)] px-2.5 py-2 text-left transition hover:bg-surface-muted ${item.id === selectedClassId ? "bg-brand-soft text-brand-strong" : ""}`}
                  >
                    <span className="block text-sm font-medium">{item.name}</span>
                    <span className="block text-xs text-muted-foreground">{item.grade}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground lg:text-right">Attendance date</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <button type="button" onClick={() => moveDate(-1)} aria-label="Previous day" className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground transition hover:bg-brand-soft hover:text-brand-strong"><ChevronLeft className="size-4" /></button>
              <div className="min-w-40 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2 text-center text-sm font-medium">
                {new Intl.DateTimeFormat("en-NA", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${attendanceDate}T12:00:00`))}
              </div>
              <button type="button" onClick={() => moveDate(1)} aria-label="Next day" className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground transition hover:bg-brand-soft hover:text-brand-strong"><ChevronRight className="size-4" /></button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex flex-col gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Daily register</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Everyone starts as present. Mark only exceptions, then confirm the register.</p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-[var(--radius-xs)] bg-success-soft px-2.5 py-1.5 font-medium text-[color:var(--success)]">{presentCount} present</span>
            <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 font-medium text-muted-foreground">{exceptionCount} exceptions</span>
          </div>
        </div>

        {!selectedClassId || !classes.length ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium">No register classes configured</p>
            <p className="mt-1 text-xs text-muted-foreground">A school administrator must configure grades and register classes first.</p>
          </div>
        ) : !rows.length ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium">No learners in this class</p>
            <p className="mt-1 text-xs text-muted-foreground">Learners enrolled for this date will appear here automatically.</p>
          </div>
        ) : (
          <form action={action} className="mt-1">
            <input type="hidden" name="registerClassId" value={selectedClassId} />
            <input type="hidden" name="attendanceDate" value={attendanceDate} />
            <input type="hidden" name="clientMutationId" value={clientMutationId} />
            <input type="hidden" name="replacesSubmissionId" value={currentSubmissionId ?? ""} />
            <input type="hidden" name="exceptions" value={JSON.stringify(exceptions)} />

            <div className="divide-y divide-border-subtle">
              {rows.map((row, index) => {
                const selectedReason = reasons.find((reason) => reason.id === row.reasonId);
                const isException = row.status !== "present";
                return (
                  <div key={row.enrolmentId} className="grid gap-3 py-3 sm:grid-cols-[2rem_minmax(10rem,1fr)_minmax(18rem,1.1fr)] sm:items-start">
                    <span className="pt-2 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                    <div className="pt-1.5">
                      <p className="text-sm font-medium">{row.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{row.admissionNumber ?? "No admission number"}</p>
                    </div>
                    <div>
                      <div className="flex flex-wrap gap-1.5">
                        {statuses.map((status) => (
                          <button
                            key={status.value}
                            type="button"
                            onClick={() => updateRow(row.enrolmentId, {
                              status: status.value,
                              reasonId: status.value === "present" ? null : row.reasonId,
                              note: status.value === "present" ? null : row.note,
                            })}
                            className={`min-h-8 rounded-[var(--radius-xs)] px-2.5 text-xs font-medium transition ${row.status === status.value ? "bg-brand-soft text-brand-strong" : "bg-surface-muted text-muted-foreground hover:text-foreground"}`}
                          >
                            {status.value === "present" && row.status === "present" ? <Check className="mr-1 inline size-3.5" aria-hidden="true" /> : null}
                            {status.label}
                          </button>
                        ))}
                      </div>

                      {isException ? (
                        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setReasonOpenFor((current) => current === row.enrolmentId ? null : row.enrolmentId)}
                              className="flex min-h-9 w-full items-center justify-between gap-2 rounded-[var(--radius-xs)] border border-border-subtle bg-surface-elevated px-2.5 text-left text-xs transition hover:border-border"
                            >
                              <span className="truncate">{selectedReason?.name ?? "Reason (optional)"}</span>
                              <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
                            </button>
                            {reasonOpenFor === row.enrolmentId ? (
                              <div className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-1 shadow-[var(--shadow-md)]">
                                <button type="button" onClick={() => { updateRow(row.enrolmentId, { reasonId: null }); setReasonOpenFor(null); }} className="w-full rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-surface-muted">No reason</button>
                                {reasons.map((reason) => (
                                  <button key={reason.id} type="button" onClick={() => { updateRow(row.enrolmentId, { reasonId: reason.id }); setReasonOpenFor(null); }} className="w-full rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-xs hover:bg-surface-muted">
                                    {reason.name}{reason.sensitive ? <span className="ml-1 text-muted-foreground">· restricted</span> : null}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <input
                            value={row.note ?? ""}
                            onChange={(event) => updateRow(row.enrolmentId, { note: event.target.value })}
                            placeholder="Note (optional)"
                            className="min-h-9 w-full rounded-[var(--radius-xs)] border border-border-subtle bg-surface-elevated px-2.5 text-xs outline-none transition placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="sticky bottom-[4.5rem] -mx-4 mt-3 flex items-center justify-between gap-3 border-t border-border-subtle bg-[color:var(--surface)]/96 px-4 py-3 backdrop-blur-xl sm:-mx-5 sm:px-5 lg:bottom-0">
              <p className="text-xs text-muted-foreground">{currentSubmissionId ? "Saving creates a new auditable register revision." : "Confirming records the register for this class and date."}</p>
              <button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-10 shrink-0 items-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60">
                {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
                {pending ? "Saving…" : currentSubmissionId ? "Save revision" : "Confirm register"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
