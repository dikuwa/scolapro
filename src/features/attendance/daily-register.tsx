"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Paperclip, Save } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
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

function schoolDayShift(date: string, direction: -1 | 1) {
  const current = new Date(`${date}T12:00:00`);
  do current.setDate(current.getDate() + direction); while (current.getDay() === 0 || current.getDay() === 6);
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
  const [navigationPending, startNavigation] = useTransition();
  const [rows, setRows] = useState<EditableRow[]>(learners);
  const [evidenceNames, setEvidenceNames] = useState<Record<string, string>>({});
  const [clientMutationId] = useState(() => crypto.randomUUID());
  const selectedClass = classes.find((item) => item.id === selectedClassId);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      router.refresh();
    } else toast.error(state.message);
  }, [state, router]);

  useEffect(() => {
    if (!selectedClassId) return;
    for (const direction of [-1, 1] as const) {
      const target = schoolDayShift(attendanceDate, direction);
      router.prefetch(`/attendance?class=${encodeURIComponent(selectedClassId)}&date=${target}`);
    }
  }, [attendanceDate, router, selectedClassId]);

  const exceptions = useMemo(
    () => rows.filter((row) => row.status !== "present").map((row) => ({ enrolment_id: row.enrolmentId, status: row.status, reason_id: row.reasonId, note: row.note })),
    [rows],
  );

  const presentCount = rows.filter((row) => row.status === "present").length;
  const exceptionCount = rows.length - presentCount;

  function updateRow(enrolmentId: string, changes: Partial<EditableRow>) {
    setRows((current) => current.map((row) => row.enrolmentId === enrolmentId ? { ...row, ...changes } : row));
  }

  function moveDate(direction: -1 | 1) {
    const params = new URLSearchParams();
    if (selectedClassId) params.set("class", selectedClassId);
    params.set("date", schoolDayShift(attendanceDate, direction));
    startNavigation(() => router.replace(`/attendance?${params.toString()}`, { scroll: false }));
  }

  function chooseClass(classId: string) {
    startNavigation(() => router.replace(`/attendance?class=${encodeURIComponent(classId)}&date=${encodeURIComponent(attendanceDate)}`, { scroll: false }));
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <Picker
            label="Register class"
            name="register-class-ui"
            value={selectedClassId ?? ""}
            onChange={chooseClass}
            placeholder="Choose a class"
            options={classes.map((item) => ({ value: item.id, label: item.name, helper: item.grade }))}
            className="max-w-xl"
          />

          <div>
            <p className="text-xs font-medium text-muted-foreground lg:text-right">Attendance date</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <button type="button" disabled={navigationPending} onClick={() => moveDate(-1)} aria-label="Previous school day" className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground transition hover:bg-brand-soft hover:text-brand-strong disabled:opacity-50"><ChevronLeft className="size-4" /></button>
              <div className="relative min-w-40 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2 text-center text-sm font-medium">
                {navigationPending ? <span className="absolute inset-0 grid place-items-center bg-[color:var(--surface-muted)]"><Spinner className="size-4 text-brand" /></span> : null}
                {new Intl.DateTimeFormat("en-NA", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${attendanceDate}T12:00:00`))}
              </div>
              <button type="button" disabled={navigationPending} onClick={() => moveDate(1)} aria-label="Next school day" className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground transition hover:bg-brand-soft hover:text-brand-strong disabled:opacity-50"><ChevronRight className="size-4" /></button>
            </div>
            <p className="mt-1 text-[0.68rem] text-muted-foreground lg:text-right">Normal register navigation skips Saturday and Sunday.</p>
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex flex-col gap-3 border-b border-border-subtle bg-surface-muted/55 -mx-4 -mt-4 px-4 py-4 sm:-mx-5 sm:-mt-5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="scolapro-section-title">Daily register</h2>
            <p className="scolapro-section-description">Everyone starts as present. Mark only exceptions; each exception may include a reason, note and optional supporting document.</p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-[var(--radius-xs)] bg-success-soft px-2.5 py-1.5 font-medium text-[color:var(--success)]">{presentCount} present</span>
            <span className="rounded-[var(--radius-xs)] bg-surface px-2.5 py-1.5 font-medium text-muted-foreground">{exceptionCount} exceptions</span>
          </div>
        </div>

        {!selectedClassId || !classes.length ? (
          <div className="py-10 text-center"><p className="text-sm font-medium">No register classes configured</p><p className="mt-1 text-xs text-muted-foreground">A school administrator must configure grades and register classes first.</p></div>
        ) : !rows.length ? (
          <div className="py-10 text-center"><p className="text-sm font-medium">No learners in this class</p><p className="mt-1 text-xs text-muted-foreground">Learners enrolled for this date will appear here automatically.</p></div>
        ) : (
          <form action={action} className="mt-1">
            <input type="hidden" name="registerClassId" value={selectedClassId} />
            <input type="hidden" name="attendanceDate" value={attendanceDate} />
            <input type="hidden" name="clientMutationId" value={clientMutationId} />
            <input type="hidden" name="replacesSubmissionId" value={currentSubmissionId ?? ""} />
            <input type="hidden" name="exceptions" value={JSON.stringify(exceptions)} />

            <div className="divide-y divide-border-subtle">
              {rows.map((row, index) => {
                const isException = row.status !== "present";
                return (
                  <div key={row.enrolmentId} className="grid gap-3 py-3 sm:grid-cols-[2rem_minmax(10rem,0.75fr)_minmax(20rem,1.25fr)] sm:items-start">
                    <span className="pt-2 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                    <div className="pt-1.5"><p className="scolapro-record-title">{row.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{row.admissionNumber ?? "No admission number"}</p></div>
                    <div>
                      <div className="flex flex-wrap gap-1.5">
                        {statuses.map((status) => (
                          <button key={status.value} type="button" onClick={() => updateRow(row.enrolmentId, { status: status.value, reasonId: status.value === "present" ? null : row.reasonId, note: status.value === "present" ? null : row.note })} className={`min-h-8 rounded-[var(--radius-xs)] px-2.5 text-xs font-medium transition ${row.status === status.value ? "bg-brand-soft text-brand-strong" : "bg-surface-muted text-muted-foreground hover:text-foreground"}`}>
                            {status.value === "present" && row.status === "present" ? <Check className="mr-1 inline size-3.5" aria-hidden="true" /> : null}{status.label}
                          </button>
                        ))}
                      </div>

                      {isException ? (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <Picker label="Reason" name={`reason-ui-${row.enrolmentId}`} value={row.reasonId ?? ""} onChange={(reasonId) => updateRow(row.enrolmentId, { reasonId: reasonId || null })} placeholder="Reason (optional)" options={[{ value: "", label: "No reason" }, ...reasons.map((reason) => ({ value: reason.id, label: reason.name, helper: reason.sensitive ? "Restricted detail" : undefined }))]} />
                          <div><label htmlFor={`note-${row.enrolmentId}`} className="text-xs font-medium">Note</label><input id={`note-${row.enrolmentId}`} value={row.note ?? ""} onChange={(event) => updateRow(row.enrolmentId, { note: event.target.value })} placeholder="Optional context" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs outline-none transition placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></div>
                          <div className="sm:col-span-2">
                            <input id={`evidence-${row.enrolmentId}`} name={`evidence-${row.enrolmentId}`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="sr-only" onChange={(event) => setEvidenceNames((current) => ({ ...current, [row.enrolmentId]: event.target.files?.[0]?.name ?? "" }))} />
                            <label htmlFor={`evidence-${row.enrolmentId}`} className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] bg-surface-muted px-3 text-xs font-medium text-muted-foreground transition hover:bg-surface-subtle hover:text-foreground"><Paperclip className="size-3.5" aria-hidden="true" />{evidenceNames[row.enrolmentId] ? "Change evidence" : "Add evidence"}</label>
                            <span className="ml-2 text-[0.68rem] text-muted-foreground">{evidenceNames[row.enrolmentId] || "Photo, doctor/parent note or PDF · optional · max 5 MB"}</span>
                          </div>
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
                {pending ? <Spinner className="size-4 text-white" /> : <Save className="size-4" aria-hidden="true" />}{pending ? "Saving…" : currentSubmissionId ? "Save revision" : "Confirm register"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}